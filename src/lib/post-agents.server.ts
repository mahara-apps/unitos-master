import { generateText, NoObjectGeneratedError, Output } from "ai";
import { z } from "zod";
import { getBrandAiModelAdmin } from "@/lib/ai-provider.server";
import { loadAgentPrompts, fillTemplate } from "@/lib/agent-prompts.server";
import { buildBrandContextBlueprint } from "@/lib/ai-agents.functions";
import { loadBriefingContext } from "@/lib/monthly-plan-context.server";

/**
 * ORQUESTRADOR DA PEÇA — cérebro único do fluxo operacional.
 *
 * Pauta aprovada → materialização → esta função. Monta o contexto real
 * (marca + briefing + pauta + tópico + canal/formato) e executa os agentes
 * cadastrados em `agent_prompts`:
 *   - roteirista_social    (somente formatos de vídeo)
 *   - art_director_social  (somente quando falta direção visual)
 *   - copywriter_senior    (sempre — produz a LEGENDA final)
 *
 * O resultado é persistido no próprio post (`copy`, `script`, `design_brief`).
 * Falhas nunca gravam legenda genérica: o post fica com `ai_phase='copy_failed'`
 * e o erro é registrado em `activity_events` para rastreio.
 */

const CopySchema = z.object({
  caption: z.string(),
  reasoning_summary: z.string().nullable(),
});
const ScriptSchema = z.object({ script: z.string() });
const VisualSchema = z.object({ visual_direction: z.string() });

type TopicRow = {
  topic_title: string;
  angle: string | null;
  target_audience: string | null;
  rationale: string | null;
  channel: string | null;
  content_format: string | null;
  monthly_plan_id: string | null;
};

type PostRow = {
  id: string;
  brand_id: string;
  client_id: string;
  project_id: string | null;
  title: string;
  format: string | null;
  channels: string[] | null;
  copy: string | null;
  script: unknown;
  design_brief: string | null;
  internal_briefing: string | null;
  client_briefing: string | null;
  monthly_plan_topic_id: string | null;
};

function isVideoFormat(format: string | null, channels: string[] | null): boolean {
  const s = `${format ?? ""} ${(channels ?? []).join(" ")}`.toLowerCase();
  return /reel|tiktok|short|v[ií]deo|video|youtube/.test(s);
}

async function runStructured<T extends z.ZodTypeAny>(opts: {
  brandId: string;
  system: string;
  prompt: string;
  schema: T;
}): Promise<z.infer<T>> {
  const { model } = await getBrandAiModelAdmin(opts.brandId, "text", "operational");
  try {
    const res = await generateText({
      model,
      system: opts.system,
      prompt: opts.prompt,
      output: Output.object({ schema: opts.schema }),
    });
    return res.output as z.infer<T>;
  } catch (err) {
    if (NoObjectGeneratedError.isInstance(err)) {
      const raw = (err.text ?? "")
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();
      try {
        return JSON.parse(raw) as z.infer<T>;
      } catch {
        throw new Error("ai_invalid_output");
      }
    }
    throw err;
  }
}

async function logFailure(
  admin: import("@supabase/supabase-js").SupabaseClient,
  post: Pick<PostRow, "id" | "brand_id" | "client_id">,
  agent: string,
  step: string,
  message: string,
) {
  console.error(
    `[post-agents] falha agente=${agent} etapa=${step} post=${post.id} cliente=${post.client_id}: ${message}`,
  );
  try {
    await admin.from("activity_events").insert({
      brand_id: post.brand_id,
      client_id: post.client_id,
      entity_type: "post",
      entity_id: post.id,
      verb: "ai_generation_failed",
      payload: { agent, step, error: message.slice(0, 800) },
    } as never);
  } catch {
    // auditoria não crítica
  }
}

export type GeneratePostResult =
  | { status: "generated"; agents: string[] }
  | { status: "skipped"; reason: string }
  | { status: "failed"; agent: string; error: string };

/**
 * Gera o conteúdo de uma peça. Idempotente: se a legenda já existe e
 * `force` é falso, não reexecuta nem duplica nada.
 */
export async function generatePostContent(
  postId: string,
  opts: { force?: boolean; userId?: string | null } = {},
): Promise<GeneratePostResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as unknown as import("@supabase/supabase-js").SupabaseClient;

  const { data: postData, error: postErr } = await admin
    .from("posts")
    .select(
      "id, brand_id, client_id, project_id, title, format, channels, copy, script, design_brief, internal_briefing, client_briefing, monthly_plan_topic_id",
    )
    .eq("id", postId)
    .maybeSingle();
  if (postErr) throw postErr;
  const post = postData as unknown as PostRow | null;
  if (!post) return { status: "skipped", reason: "post_not_found" };
  if (!opts.force && (post.copy ?? "").trim().length > 0) {
    return { status: "skipped", reason: "copy_already_present" };
  }

  await admin.from("posts").update({ ai_phase: "copy_running" } as never).eq("id", post.id);

  // ---- Contexto: tópico da pauta + pauta + briefing + blueprint da marca ----
  let topic: TopicRow | null = null;
  let planTitle: string | null = null;
  let planBriefingId: string | null = null;

  if (post.monthly_plan_topic_id) {
    const { data: t } = await admin
      .from("monthly_plan_topics")
      .select("topic_title, angle, target_audience, rationale, channel, content_format, monthly_plan_id")
      .eq("id", post.monthly_plan_topic_id)
      .maybeSingle();
    topic = (t as unknown as TopicRow | null) ?? null;
    if (topic?.monthly_plan_id) {
      const { data: plan } = await admin
        .from("monthly_plans")
        .select("title, input_briefing_id")
        .eq("id", topic.monthly_plan_id)
        .maybeSingle();
      const p = plan as unknown as { title: string | null; input_briefing_id: string | null } | null;
      planTitle = p?.title ?? null;
      planBriefingId = p?.input_briefing_id ?? null;
    }
  }

  const [blueprintRes, briefingRes] = await Promise.all([
    buildBrandContextBlueprint(admin, post.brand_id, post.client_id).catch(() => ({
      blueprint: "",
      counts: {},
    })),
    loadBriefingContext(admin, post.client_id, { briefingId: planBriefingId }).catch(() => null),
  ]);

  const channel = (post.channels ?? [])[0] ?? topic?.channel ?? "instagram";
  const format = post.format ?? topic?.content_format ?? "Feed";

  const pieceBriefing = [
    post.internal_briefing?.trim() ? `Briefing interno:\n${post.internal_briefing.trim()}` : "",
    post.client_briefing?.trim() ? `Briefing do cliente:\n${post.client_briefing.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const pieceContext = [
    `Título da peça: ${post.title}`,
    `Canal: ${channel}`,
    `Formato: ${format}`,
    planTitle ? `Pauta: ${planTitle}` : "",
    topic?.angle ? `Ângulo/estratégia do tópico: ${topic.angle}` : "",
    topic?.target_audience ? `Público-alvo do tópico: ${topic.target_audience}` : "",
    topic?.rationale ? `Racional estratégico: ${topic.rationale}` : "",
    pieceBriefing || "Briefing específico da peça: (vazio — use o contexto da pauta e da marca, sem inventar fatos)",
  ]
    .filter(Boolean)
    .join("\n");

  const contextBlock = [
    blueprintRes.blueprint,
    briefingRes?.text ? `## Briefing da marca\n${briefingRes.text}` : "",
    `## Briefing desta peça\n${pieceContext}`,
  ]
    .filter(Boolean)
    .join("\n\n---\n\n");

  const needsScript = isVideoFormat(format, post.channels);
  const needsVisual = !needsScript && !(post.design_brief ?? "").trim();

  const agentIds = [
    "copywriter_senior",
    ...(needsScript ? ["roteirista_social"] : []),
    ...(needsVisual ? ["art_director_social"] : []),
  ] as const;

  let prompts: Map<string, string>;
  try {
    prompts = await loadAgentPrompts(post.brand_id, agentIds);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logFailure(admin, post, "agent_prompts", "load_prompts", msg);
    await admin.from("posts").update({ ai_phase: "copy_failed" } as never).eq("id", post.id);
    return { status: "failed", agent: "agent_prompts", error: msg };
  }

  const vars = () => ({
    CONTEXT: contextBlock,
    BRIEFING: pieceBriefing || "(sem briefing específico)",
    TITULO: post.title,
    CANAL: String(channel),
    FORMATO: String(format),
    PLATAFORMA: String(channel),
    OBJETIVO: topic?.angle ?? "",
    PERSONAS: briefingRes?.clientName ?? "",
  });

  const used: string[] = [];
  const patch: Record<string, unknown> = {};

  // 1) Roteirista (somente vídeo) — o roteiro alimenta a legenda depois.
  let scriptText = "";
  if (needsScript && prompts.get("roteirista_social")) {
    try {
      const out = await runStructured({
        brandId: post.brand_id,
        system: fillTemplate(prompts.get("roteirista_social")!, vars()),
        prompt:
          `${contextBlock}\n\nEscreva o roteiro completo desta peça de vídeo (${format} / ${channel}).\n` +
          `Responda EXCLUSIVAMENTE em JSON: {"script":"roteiro completo em texto, com cenas e falas"}`,
        schema: ScriptSchema,
      });
      scriptText = (out.script ?? "").trim();
      if (scriptText) {
        patch.script = [{ cena: 1, fala: scriptText }];
        used.push("roteirista_social");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await logFailure(admin, post, "roteirista_social", "script", msg);
      await admin.from("posts").update({ ai_phase: "copy_failed" } as never).eq("id", post.id);
      return { status: "failed", agent: "roteirista_social", error: msg };
    }
  }

  // 2) Direção de arte (somente peças estáticas sem briefing visual).
  if (needsVisual && prompts.get("art_director_social")) {
    try {
      const out = await runStructured({
        brandId: post.brand_id,
        system: fillTemplate(prompts.get("art_director_social")!, vars()),
        prompt:
          `${contextBlock}\n\nDescreva a direção visual desta peça (${format} / ${channel}).\n` +
          `Responda EXCLUSIVAMENTE em JSON: {"visual_direction":"orientação visual objetiva para o designer"}`,
        schema: VisualSchema,
      });
      const vd = (out.visual_direction ?? "").trim();
      if (vd) {
        patch.design_brief = vd;
        used.push("art_director_social");
      }
    } catch (err) {
      // Direção visual é complementar: registra e segue para a copy.
      await logFailure(
        admin,
        post,
        "art_director_social",
        "visual_direction",
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  // 3) Copywriter — LEGENDA final, campo único e pronto para publicação.
  const copyPrompt = prompts.get("copywriter_senior");
  if (!copyPrompt) {
    await logFailure(admin, post, "copywriter_senior", "load_prompt", "prompt_missing");
    await admin.from("posts").update({ ai_phase: "copy_failed" } as never).eq("id", post.id);
    return { status: "failed", agent: "copywriter_senior", error: "prompt_missing" };
  }

  try {
    const out = await runStructured({
      brandId: post.brand_id,
      system: fillTemplate(copyPrompt, vars()),
      prompt:
        `${contextBlock}\n\n` +
        (scriptText ? `Roteiro aprovado desta peça:\n${scriptText}\n\n` : "") +
        (patch.design_brief ? `Direção visual:\n${patch.design_brief as string}\n\n` : "") +
        `Escreva a LEGENDA FINAL desta peça, pronta para publicar em ${channel} (${format}).\n` +
        `A legenda deve ser um texto único e contínuo contendo: abertura de impacto, desenvolvimento, ` +
        `argumentos, chamada para ação e hashtags no final. Use emojis somente quando fizer sentido para a marca. ` +
        `Respeite tom de voz, posicionamento e restrições da marca. Não invente dados que não estejam no contexto. ` +
        `Não use rótulos como "Hook:", "CTA:" ou "Hashtags:".\n` +
        `Responda EXCLUSIVAMENTE em JSON: {"caption":"legenda completa","reasoning_summary":"1 frase explicando a escolha"}`,
      schema: CopySchema,
    });
    const caption = (out.caption ?? "").trim();
    if (!caption) throw new Error("empty_caption");
    patch.copy = caption;
    used.push("copywriter_senior");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logFailure(admin, post, "copywriter_senior", "caption", msg);
    // Persiste o que já foi produzido (roteiro/visual), mas sinaliza a falha.
    if (Object.keys(patch).length > 0) {
      await admin.from("posts").update(patch as never).eq("id", post.id);
    }
    await admin.from("posts").update({ ai_phase: "copy_failed" } as never).eq("id", post.id);
    return { status: "failed", agent: "copywriter_senior", error: msg };
  }

  patch.ai_phase = "copy_ready";
  const { error: updErr } = await admin.from("posts").update(patch as never).eq("id", post.id);
  if (updErr) {
    await logFailure(admin, post, "persist", "update_post", updErr.message);
    return { status: "failed", agent: "persist", error: updErr.message };
  }

  try {
    await admin.from("activity_events").insert({
      brand_id: post.brand_id,
      client_id: post.client_id,
      actor_id: opts.userId ?? null,
      entity_type: "post",
      entity_id: post.id,
      verb: "ai_generated",
      payload: { agents: used, channel, format },
    } as never);
  } catch {
    // auditoria não crítica
  }

  return { status: "generated", agents: used };
}

/** Executa a geração para várias peças em série (evita estouro de budget). */
export async function generatePostsContentSequential(
  postIds: string[],
  opts: { userId?: string | null } = {},
): Promise<void> {
  for (const id of postIds) {
    try {
      await generatePostContent(id, { userId: opts.userId ?? null });
    } catch (err) {
      console.error("[post-agents] erro inesperado", id, err);
    }
  }
}
