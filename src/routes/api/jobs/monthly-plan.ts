import { createFileRoute } from "@tanstack/react-router";
import { waitUntil } from "@/lib/wait-until.server";
import { createClient } from "@supabase/supabase-js";
import { generateText, NoObjectGeneratedError, Output } from "ai";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { buildBrandContextBlueprint } from "@/lib/ai-agents.functions";
import { buildSlotScheduler, extractBestHoursFromChannels } from "@/lib/scheduling";

// One-Click Monthly Plan Orchestrator
// -----------------------------------------------------------------------------
// Loads system prompts from `agent_prompts`, hydrates the Brand Context
// Blueprint, then runs:
//   1) planner_strategic  -> N concepts
//   2) copywriter_senior  -> caption per concept (parallel)
// Each concept é inserido em `posts` no stage "idea" do pipeline padrão (ou
// escolhido) do cliente, e com `scheduled_at` distribuído nos dias úteis do
// período — garantindo aparição imediata no calendário editorial.
// Retorna 202 com o id do ai_jobs.

const BodySchema = z.object({
  brandId: z.string().uuid(),
  clientId: z.string().uuid(),
  pipelineId: z.string().uuid().nullable().optional(),
  quantidade: z.number().int().min(3).max(180).default(12),
  periodo: z.string().default("próximo mês"),
  meses: z.number().int().min(1).max(6).optional(),
  channelMix: z.record(z.string(), z.number().int().min(0).max(180)).optional(),
  direction: z.string().max(2000).optional(),
  startFrom: z.enum(["current-remaining", "next-month"]).optional(),
  assigneeId: z.string().uuid().optional(),
});

const STRATEGIC_MODEL = "google/gemini-2.5-flash";
const OPERATIONAL_MODEL = "google/gemini-2.5-flash";

const PlannerSchema = z.object({
  concepts: z.array(
    z.object({
      titulo: z.string(),
      pilar: z.string(),
      formato: z.string(),
      plataforma: z.string(),
      gancho: z.string(),
      objetivo: z.string(),
      cta: z.string(),
    }),
  ),
});
const CopySchema = z.object({
  titulo: z.string(),
  caption: z.string(),
  hook: z.string(),
  hashtags: z.array(z.string()),
});

const CHANNEL_MAP: Record<string, "instagram" | "tiktok" | "linkedin" | "x" | "youtube" | "blog"> = {
  instagram: "instagram",
  tiktok: "tiktok",
  linkedin: "linkedin",
  x: "x",
  twitter: "x",
  youtube: "youtube",
  blog: "blog",
};

// Volumetria pode incluir "facebook" — mantemos como valor livre ao gravar.
function normalizeChannel(raw: string): string {
  const k = (raw ?? "").toLowerCase().trim();
  return CHANNEL_MAP[k] ?? (k === "facebook" ? "facebook" : "instagram");
}

function buildUserClient(token: string) {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  return createClient<Database>(url, key, {
    global: { headers: { Authorization: `Bearer ${token}`, apikey: key } },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

async function runStructured<T extends z.ZodTypeAny>(opts: {
  system: string;
  prompt: string;
  schema: T;
  strategic: boolean;
}): Promise<{ output: z.infer<T>; raw?: string }> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");
  const gateway = createLovableAiGatewayProvider(key, undefined, {
    structuredOutputs: !opts.strategic,
  });
  const model = gateway(opts.strategic ? STRATEGIC_MODEL : OPERATIONAL_MODEL);
  try {
    const res = await generateText({
      model,
      system: opts.system,
      prompt: opts.prompt,
      output: Output.object({ schema: opts.schema }),
    });
    return { output: res.output as z.infer<T>, raw: res.text };
  } catch (err) {
    if (NoObjectGeneratedError.isInstance(err)) {
      const raw = (err.text ?? "")
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();
      try {
        return { output: JSON.parse(raw) as z.infer<T>, raw };
      } catch {
        return { output: {} as z.infer<T>, raw };
      }
    }
    throw err;
  }
}

// Extrai um array de conceitos aceitando chaves alternativas que o modelo
// eventualmente devolve quando structuredOutputs está desligado.
function extractConcepts(raw: unknown): unknown[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    const candidates = [
      "concepts", "conceitos", "calendario", "calendar",
      "posts", "pautas", "ideias", "ideas", "items", "itens", "content",
    ];
    for (const k of candidates) {
      const v = obj[k];
      if (Array.isArray(v)) return v;
    }
    // fallback: primeiro valor array encontrado
    for (const v of Object.values(obj)) {
      if (Array.isArray(v)) return v;
    }
  }
  return [];
}

function normalizeConcept(c: unknown): {
  titulo: string; pilar: string; formato: string; plataforma: string;
  gancho: string; objetivo: string; cta: string;
} | null {
  if (!c || typeof c !== "object") return null;
  const r = c as Record<string, unknown>;
  const pick = (...ks: string[]) => {
    for (const k of ks) {
      const v = r[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return "";
  };
  const titulo = pick("titulo", "title", "headline", "tema");
  const gancho = pick("gancho", "hook", "abertura");
  if (!titulo && !gancho) return null;
  return {
    titulo: titulo || gancho,
    pilar: pick("pilar", "pillar", "categoria", "tema"),
    formato: normalizeFormatKind(pick("formato", "format", "tipo")),
    plataforma: pick("plataforma", "canal", "platform", "channel") || "instagram",
    gancho: gancho || titulo,
    objetivo: pick("objetivo", "goal", "objective"),
    cta: pick("cta", "call_to_action", "acao"),
  };
}

function normalizeFormatKind(raw: string | null | undefined): "Feed" | "Reels" | "Story" | "Carrossel" {
  const s = (raw ?? "").toString().trim().toLowerCase();
  if (s.startsWith("reel")) return "Reels";
  if (s.startsWith("stor")) return "Story";
  if (s.startsWith("carr") || s.startsWith("carou")) return "Carrossel";
  return "Feed";
}

function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (_m, k) => vars[k] ?? "(não informado)");
}

async function runOrchestrator(params: {
  jobId: string;
  token: string;
  userId: string;
  input: z.infer<typeof BodySchema>;
}) {
  const { jobId, token, userId, input } = params;
  const supabase = buildUserClient(token);
  const patch = (fields: Partial<Database["public"]["Tables"]["ai_jobs"]["Update"]>) =>
    supabase.from("ai_jobs").update(fields).eq("id", jobId);

  try {
    await patch({
      status: "running",
      started_at: new Date().toISOString(),
      progress: 5,
      step_label: "Carregando prompts e contexto da marca",
    });

    // 1) Load prompts
    const { data: promptRows, error: promptErr } = await supabase
      .from("agent_prompts")
      .select("agent_id, system_prompt")
      .in("agent_id", ["planner_strategic", "copywriter_senior"]);
    if (promptErr) throw promptErr;
    const prompts = new Map((promptRows ?? []).map((r) => [r.agent_id, r.system_prompt]));
    const plannerPrompt = prompts.get("planner_strategic");
    const copyPrompt = prompts.get("copywriter_senior");
    if (!plannerPrompt || !copyPrompt) {
      throw new Error("agent_prompts incompletos — reexecute o seed do vault de prompts.");
    }

    // 2) Hydrate context
    const { blueprint } = await buildBrandContextBlueprint(
      supabase as never,
      input.brandId,
      input.clientId,
    );

    // Extra live pulls for template variables.
    const [{ data: personasRow }, { data: voiceRow }, { data: clientRow }, { data: competitorsRow }] =
      await Promise.all([
        supabase
          .from("brand_personas")
          .select("data")
          .eq("brand_id", input.brandId)
          .eq("client_id", input.clientId)
          .eq("is_active", true)
          .maybeSingle(),
        supabase
          .from("brand_voice_cards")
          .select("data")
          .eq("brand_id", input.brandId)
          .eq("client_id", input.clientId)
          .eq("is_active", true)
          .maybeSingle(),
        supabase
          .from("clients")
          .select("brand_hub, tone_of_voice, color")
          .eq("id", input.clientId)
          .maybeSingle(),
        supabase
          .from("brand_competitors")
          .select("handle")
          .eq("brand_id", input.brandId)
          .eq("client_id", input.clientId)
          .limit(6),
      ]);

    const hub = ((clientRow?.brand_hub ?? {}) as Record<string, unknown>) || {};
    const palette = Array.isArray(hub.palette) ? (hub.palette as { label: string; hex: string }[]) : [];
    const hashtags = Array.isArray(hub.hashtags) ? (hub.hashtags as string[]) : [];
    const primaryColors = palette.slice(0, 4).map((p) => `${p.label}: ${p.hex}`).join(", ") || "—";
    const personasStr = personasRow?.data
      ? JSON.stringify(personasRow.data).slice(0, 4000)
      : "(sem personas ativas)";
    const voiceStr = voiceRow?.data
      ? JSON.stringify(voiceRow.data).slice(0, 2500)
      : (clientRow?.tone_of_voice ?? "(sem voice card)");
    const competitorsStr = (competitorsRow ?? [])
      .map((c) => `- @${c.handle}`)
      .join("\n") || "(nenhum concorrente cadastrado)";
    // (identidade visual removida — pipeline é apenas texto)

    // 3) Planner
    await patch({ progress: 20, step_label: "Planejador estratégico — gerando conceitos" });
    const mixLines = input.channelMix
      ? Object.entries(input.channelMix)
          .filter(([, n]) => (n ?? 0) > 0)
          .map(([ch, n]) => `- ${ch}: ${n} peças`)
          .join("\n")
      : "";
    const mixInstruction = mixLines
      ? `\n\nDISTRIBUIÇÃO OBRIGATÓRIA POR CANAL (total = ${input.quantidade}):\n${mixLines}\nRespeite estritamente essa cota por plataforma — não gere mais peças por canal do que o indicado.`
      : "";
    const plannerSys = fillTemplate(plannerPrompt, {
      CONTEXT: blueprint,
      PERSONAS: personasStr,
      COMPETITORS: competitorsStr,
      PRIMARY_COLORS: primaryColors,
      QUANTIDADE: String(input.quantidade),
      PERIODO: input.periodo,
      CHANNEL_MIX: mixLines || "(livre — escolha o melhor mix)",
    }) + mixInstruction + (input.direction ? `\n\nDIRECIONAMENTO EXTRA DO USUÁRIO (prioridade máxima):\n${input.direction}` : "");
    const planned = await runStructured({
      system: plannerSys,
      prompt:
        `Gere ${input.quantidade} conceitos para o período "${input.periodo}".\n\n` +
        `Responda EXCLUSIVAMENTE com JSON válido no formato:\n` +
        `{"concepts":[{"titulo":"...","pilar":"...","formato":"Feed|Reels|Story|Carrossel",` +
        `"plataforma":"instagram|tiktok|linkedin|youtube|blog|x","gancho":"...",` +
        `"objetivo":"...","cta":"..."}]}\n` +
        `A chave raiz DEVE ser exatamente "concepts". Sem markdown, sem comentários.\n` +
        `IMPORTANTE: escolha o MELHOR formato por conceito combinando gancho, pilar e comportamento do cohort — Reels para alcance/entretenimento e demos rápidas, Carrossel para educar/listar passos/storytelling, Story para bastidores/enquetes/prova social, Feed para autoridade e posts atemporais. Nunca use o mesmo formato para todos.`,
      schema: PlannerSchema,
      strategic: true,
    });
    const rawConcepts = extractConcepts(planned.output);
    const concepts = rawConcepts
      .map(normalizeConcept)
      .filter((c): c is NonNullable<ReturnType<typeof normalizeConcept>> => c !== null)
      .slice(0, input.quantidade);
    if (!concepts.length) {
      const sample = (planned.raw ?? JSON.stringify(planned.output ?? {})).slice(0, 400);
      throw new Error(
        `Planejador não retornou conceitos válidos. Amostra da resposta: ${sample}`,
      );
    }

    // Aplica a cota por canal caso o planner tenha desviado.
    if (input.channelMix) {
      const remaining: Record<string, number> = { ...input.channelMix };
      for (const c of concepts) {
        const desired = normalizeChannel(c.plataforma ?? "");
        if ((remaining[desired] ?? 0) > 0) {
          remaining[desired] -= 1;
          c.plataforma = desired;
        } else {
          const fallback = Object.entries(remaining).find(([, n]) => (n ?? 0) > 0)?.[0];
          if (fallback) {
            remaining[fallback] -= 1;
            c.plataforma = fallback;
          }
        }
      }
    }

    // 4) Modo rápido: pular copywriter, injetar apenas as ideias (título + gancho).
    //    A legenda completa pode ser gerada sob demanda pelo Co-pilot de conteúdo.
    void copyPrompt;
    void voiceStr;
    const hashtagsStr = hashtags.slice(0, 20).join(" ");
    const results = concepts.map((concept) => ({
      concept,
      copy: {
        titulo: concept.titulo,
        caption: `${concept.gancho}\n\nObjetivo: ${concept.objetivo}\nCTA: ${concept.cta}`,
        hook: concept.gancho,
        hashtags: hashtagsStr ? hashtagsStr.split(/\s+/).filter(Boolean).slice(0, 8) : [],
      },
    }));

    // 5) Resolve pipeline + inject posts
    await patch({ progress: 85, step_label: "Injetando peças no pipeline" });
    let pipelineId = input.pipelineId ?? null;
    if (!pipelineId) {
      const { data: def } = await supabase
        .from("content_pipelines")
        .select("id")
        .eq("brand_id", input.brandId)
        .eq("client_id", input.clientId)
        .order("is_default", { ascending: false })
        .order("position", { ascending: true })
        .limit(1)
        .maybeSingle();
      pipelineId = def?.id ?? null;
    }
    let ideaStageId: string | null = null;
    if (pipelineId) {
      const { data: stage } = await supabase
        .from("content_pipeline_stages")
        .select("id")
        .eq("pipeline_id", pipelineId)
        .order("position", { ascending: true })
        .limit(1)
        .maybeSingle();
      ideaStageId = stage?.id ?? null;
    }

    let injected = 0;
    if (pipelineId && ideaStageId) {
      const { data: maxRow } = await supabase
        .from("posts")
        .select("position")
        .eq("stage_id", ideaStageId)
        .order("position", { ascending: false })
        .limit(1);
      let nextPos = ((maxRow?.[0]?.position ?? -1) as number) + 1024;
      // Distribuição no calendário: dias úteis (seg–sex) a partir do 1º dia
      // do próximo mês, atravessando `input.meses` meses. Horários escalonados
      // 10:00 / 14:00 / 17:00 (UTC-3 armazenado como UTC).
      const totalMeses = Math.max(1, input.meses ?? 1);
      const start = new Date();
      if (input.startFrom === "current-remaining") {
        // Start tomorrow, stay within remaining days of the current month.
        start.setUTCDate(start.getUTCDate() + 1);
      } else {
        start.setUTCDate(1);
        start.setUTCMonth(start.getUTCMonth() + 1);
      }
      start.setUTCHours(12, 0, 0, 0); // base do cursor de dias úteis
      const businessDays: Date[] = [];
      const cursor = new Date(start);
      for (let m = 0; m < totalMeses; m++) {
        const monthEnd = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0));
        while (cursor <= monthEnd) {
          const dow = cursor.getUTCDay();
          if (dow !== 0 && dow !== 6) businessDays.push(new Date(cursor));
          cursor.setUTCDate(cursor.getUTCDate() + 1);
        }
      }
      // Horários preferenciais: Instagram Insights (se conectado) OU +6h padrão.
      const { data: connRow } = await supabase
        .from("brand_connections")
        .select("channels")
        .eq("brand_id", input.brandId)
        .maybeSingle();
      const bestHoursBRT = extractBestHoursFromChannels(connRow?.channels);
      const scheduleFor = buildSlotScheduler(businessDays, results.length, bestHoursBRT);
      const rows = results.map((r, idx) => {
        const channel = normalizeChannel(r.concept.plataforma ?? "");
        const captionMd = r.copy.caption ?? "";
        const tagsBlock = r.copy.hashtags?.length
          ? `\n\n${r.copy.hashtags.map((t) => `#${t.replace(/^#/, "")}`).join(" ")}`
          : "";
        const row = {
          brand_id: input.brandId,
          client_id: input.clientId,
          pipeline_id: pipelineId!,
          stage_id: ideaStageId!,
          title: (r.copy.titulo || r.concept.titulo).slice(0, 160),
          copy: `${captionMd}${tagsBlock}`,
          channels: [channel],
        format: normalizeFormatKind(r.concept.formato),
          stage: "idea" as const,
          position: nextPos,
          created_by: userId,
          assignee_id: input.assigneeId ?? userId,
          assignees: [input.assigneeId ?? userId],
          review_status: "pending",
          ai_phase: "idea",
          scheduled_at: scheduleFor(idx),
        };
        nextPos += 1024;
        return row;
      });
      const { error: insErr } = await supabase.from("posts").insert(rows as never);
      if (insErr) throw insErr;
      injected = rows.length;
    }

    await patch({
      status: "succeeded",
      progress: 100,
      step_label: null,
      finished_at: new Date().toISOString(),
      target_route: "/content",
      result: {
        title: `${injected} peças geradas no pipeline`,
        content: `Planejador + Copywriter concluídos para "${input.periodo}". Peças distribuídas no calendário.`,
        injected: injected > 0,
      } as never,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await patch({
      status: "failed",
      error: message,
      finished_at: new Date().toISOString(),
      step_label: null,
    });
  }
}

export const Route = createFileRoute("/api/jobs/monthly-plan")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        if (!auth.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401 });
        const token = auth.slice(7);
        if (token.split(".").length !== 3) return new Response("Unauthorized", { status: 401 });

        const raw = await request.json().catch(() => null);
        const parsed = BodySchema.safeParse(raw);
        if (!parsed.success) {
          return new Response(JSON.stringify(parsed.error.format()), { status: 400 });
        }
        const input = parsed.data;

        const supabase = buildUserClient(token);
        const { data: claims } = await supabase.auth.getClaims(token);
        const userId = claims?.claims?.sub;
        if (!userId) return new Response("Unauthorized", { status: 401 });

        // Guardrail: só gera conteúdo para um cliente com briefing salvo.
        const { data: briefing } = await supabase
          .from("brand_briefings")
          .select("id")
          .eq("brand_id", input.brandId)
          .eq("client_id", input.clientId)
          .limit(1)
          .maybeSingle();
        if (!briefing) {
          return new Response(
            "Este cliente ainda não possui briefing. Preencha o briefing na aba Brand Brain antes de gerar conteúdo.",
            { status: 422 },
          );
        }

        const { data: job, error: jobErr } = await supabase
          .from("ai_jobs")
          .insert({
            brand_id: input.brandId,
            client_id: input.clientId,
            user_id: userId,
            kind: "monthly_plan",
            title: "✨ Plano do Mês",
            subtitle: `Planejador → Copywriter · ${input.quantidade} peças`,
            status: "queued",
            progress: 0,
            input: input as unknown as Database["public"]["Tables"]["ai_jobs"]["Insert"]["input"],
          })
          .select("id")
          .single();
        if (jobErr || !job) {
          return new Response(jobErr?.message ?? "Failed to enqueue", { status: 500 });
        }

        waitUntil(runOrchestrator({ jobId: job.id, token, userId, input }));

        return new Response(JSON.stringify({ jobId: job.id }), {
          status: 202,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});