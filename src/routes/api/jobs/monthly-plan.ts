import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { generateText, NoObjectGeneratedError, Output } from "ai";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { buildBrandContextBlueprint } from "@/lib/ai-agents.functions";

// One-Click Monthly Plan Orchestrator
// -----------------------------------------------------------------------------
// Loads system prompts from `agent_prompts`, hydrates the Brand Context
// Blueprint, then runs:
//   1) planner_strategic  -> N concepts
//   2) copywriter_senior  -> caption per concept (parallel)
//   3) art_director_social-> design brief per concept (parallel)
// Each concept is inserted into `posts` at stage "idea" of the client's default
// (or explicitly chosen) pipeline. Returns 202 with the ai_jobs id.

const BodySchema = z.object({
  brandId: z.string().uuid(),
  clientId: z.string().uuid(),
  pipelineId: z.string().uuid().nullable().optional(),
  quantidade: z.number().int().min(3).max(30).default(12),
  periodo: z.string().default("próximo mês"),
});

const STRATEGIC_MODEL = "google/gemini-2.5-pro";
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
const BriefSchema = z.object({ design_brief: z.string() });

const CHANNEL_MAP: Record<string, "instagram" | "tiktok" | "linkedin" | "x" | "youtube" | "blog"> = {
  instagram: "instagram",
  tiktok: "tiktok",
  linkedin: "linkedin",
  x: "x",
  twitter: "x",
  youtube: "youtube",
  blog: "blog",
};

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
}): Promise<z.infer<T>> {
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
    return res.output as z.infer<T>;
  } catch (err) {
    if (NoObjectGeneratedError.isInstance(err)) {
      const raw = (err.text ?? "")
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();
      return JSON.parse(raw) as z.infer<T>;
    }
    throw err;
  }
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
      .in("agent_id", ["planner_strategic", "copywriter_senior", "art_director_social"]);
    if (promptErr) throw promptErr;
    const prompts = new Map((promptRows ?? []).map((r) => [r.agent_id, r.system_prompt]));
    const plannerPrompt = prompts.get("planner_strategic");
    const copyPrompt = prompts.get("copywriter_senior");
    const briefPrompt = prompts.get("art_director_social");
    if (!plannerPrompt || !copyPrompt || !briefPrompt) {
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
    const visualIdentity = palette.length
      ? palette.map((p) => `- ${p.label}: ${p.hex}`).join("\n")
      : (clientRow?.color ?? "—");

    // 3) Planner
    await patch({ progress: 20, step_label: "Planejador estratégico — gerando conceitos" });
    const plannerSys = fillTemplate(plannerPrompt, {
      CONTEXT: blueprint,
      PERSONAS: personasStr,
      COMPETITORS: competitorsStr,
      PRIMARY_COLORS: primaryColors,
      QUANTIDADE: String(input.quantidade),
      PERIODO: input.periodo,
    });
    const planned = await runStructured({
      system: plannerSys,
      prompt: `Gere ${input.quantidade} conceitos para o período "${input.periodo}".`,
      schema: PlannerSchema,
      strategic: true,
    });
    const concepts = (planned.concepts ?? []).slice(0, input.quantidade);
    if (!concepts.length) throw new Error("Planejador não retornou conceitos.");

    // 4) Copywriter + Art Director in parallel per concept
    await patch({
      progress: 45,
      step_label: `Copywriter + Direção de arte (${concepts.length} peças)`,
    });

    const persona0 = personasRow?.data
      ? JSON.stringify(personasRow.data).slice(0, 1800)
      : "(persona não informada)";
    const hashtagsStr = hashtags.slice(0, 20).join(" ") || "(nenhuma hashtag oficial)";

    const results = await Promise.all(
      concepts.map(async (concept) => {
        const conceptStr = JSON.stringify(concept);
        try {
          const copySys = fillTemplate(copyPrompt, {
            TONE: voiceStr,
            PERSONA: persona0,
            HASHTAGS: hashtagsStr,
            CONCEPT: conceptStr,
          });
          const copy = await runStructured({
            system: copySys,
            prompt: `Gere a legenda para o conceito.`,
            schema: CopySchema,
            strategic: false,
          });
          let brief = "";
          try {
            const briefSys = fillTemplate(briefPrompt, {
              VISUAL_IDENTITY: visualIdentity,
              PRIMARY_COLORS: primaryColors,
              CONCEPT: conceptStr,
              COPY: copy.caption,
            });
            const briefRes = await runStructured({
              system: briefSys,
              prompt: "Gere o brief de design para o post.",
              schema: BriefSchema,
              strategic: false,
            });
            brief = briefRes.design_brief;
          } catch {
            /* design brief é opcional — segue sem bloquear */
          }
          return { concept, copy, brief };
        } catch (err) {
          return {
            concept,
            copy: {
              titulo: concept.titulo,
              caption: concept.gancho,
              hook: concept.gancho,
              hashtags: [] as string[],
            },
            brief: "",
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }),
    );

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
      const rows = results.map((r) => {
        const platform = (r.concept.plataforma ?? "").toLowerCase().trim();
        const channel = CHANNEL_MAP[platform] ?? "instagram";
        const captionMd = r.copy.caption ?? "";
        const briefBlock = r.brief ? `\n\n---\n\n### Design brief\n${r.brief}` : "";
        const tagsBlock = r.copy.hashtags?.length
          ? `\n\n${r.copy.hashtags.map((t) => `#${t.replace(/^#/, "")}`).join(" ")}`
          : "";
        const row = {
          brand_id: input.brandId,
          client_id: input.clientId,
          pipeline_id: pipelineId!,
          stage_id: ideaStageId!,
          title: (r.copy.titulo || r.concept.titulo).slice(0, 160),
          copy: `${captionMd}${tagsBlock}${briefBlock}`,
          channels: [channel],
          stage: "idea" as const,
          position: nextPos,
          created_by: userId,
          review_status: "pending",
          ai_phase: "idea",
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
        content: `Planejador + Copywriter + Direção de arte concluídos para "${input.periodo}".`,
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

        const { data: job, error: jobErr } = await supabase
          .from("ai_jobs")
          .insert({
            brand_id: input.brandId,
            client_id: input.clientId,
            user_id: userId,
            kind: "monthly_plan",
            title: "✨ Plano do Mês",
            subtitle: `Planejador → Copywriter → Direção de arte · ${input.quantidade} peças`,
            status: "queued",
            progress: 0,
            input: input as unknown as Database["public"]["Tables"]["ai_jobs"]["Insert"]["input"],
          })
          .select("id")
          .single();
        if (jobErr || !job) {
          return new Response(jobErr?.message ?? "Failed to enqueue", { status: 500 });
        }

        void runOrchestrator({ jobId: job.id, token, userId, input });

        return new Response(JSON.stringify({ jobId: job.id }), {
          status: 202,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});