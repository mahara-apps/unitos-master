import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { generateText, NoObjectGeneratedError, Output } from "ai";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

// Two-phase pipeline — Phase 1 (Idea Generation).
// Runs briefing → voice → personas → cohorts → SWOT → pauta suggestion,
// then injects each pauta as a `posts` row at stage "idea" with
// review_status='pending'. Executes fully in background; the HTTP handler
// returns 202 immediately with the ai_jobs id so the UI can navigate away.

const BodySchema = z.object({
  brandId: z.string().uuid(),
  clientId: z.string().uuid(),
  pipelineId: z.string().uuid().nullable().optional(),
  texto: z.string().trim().min(20).max(20000),
  pautasQuantidade: z.number().int().min(1).max(20).default(8),
  pautasPeriodo: z.string().default("próximos 15 dias"),
});

function buildUserClient(token: string) {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  return createClient<Database>(url, key, {
    global: { headers: { Authorization: `Bearer ${token}`, apikey: key } },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

const STRATEGIC_MODEL = "google/gemini-3.1-pro-preview";
const OPERATIONAL_MODEL = "openai/gpt-5.4-mini";

const BriefingSchema = z.object({
  publico_alvo: z.string().nullable(),
  tom_de_voz: z.string().nullable(),
  dores_do_cliente_final: z.array(z.string()),
  diferenciais: z.array(z.string()),
  hashtags_sugeridas: z.array(z.string()),
  concorrentes_mencionados: z.array(z.string()),
  volume_semanal_estimado: z.number().nullable(),
  completude_percentual: z.number(),
});
const VoiceSchema = z.object({
  voice_card: z.object({
    brand_personality: z.string(),
    tone_characteristics: z.array(z.string()),
    vocabulary_rules: z.object({
      words_to_use: z.array(z.string()),
      words_to_avoid: z.array(z.string()),
    }),
    brand_phrases_examples: z.array(z.string()),
  }),
});
const PersonasSchema = z.object({
  personas: z.array(
    z.object({
      nome: z.string(),
      descricao: z.string(),
      dores: z.array(z.string()),
      desejos: z.array(z.string()),
      canais_preferidos: z.array(z.string()),
      gatilhos_de_decisao: z.array(z.string()),
      objecoes_comuns: z.array(z.string()),
    }),
  ),
});
const CohortsSchema = z.object({
  cohorts: z.array(
    z.object({
      name: z.string(),
      target_personas: z.array(z.string()),
      behavioral_traits: z.string(),
      content_strategy: z.string(),
      conversion_criteria: z.string(),
    }),
  ),
});
const SwotSchema = z.object({
  swot_analysis: z.object({
    strengths: z.array(z.string()),
    weaknesses: z.array(z.string()),
    opportunities: z.array(z.string()),
    threats: z.array(z.string()),
  }),
  competitive_matrix: z.array(
    z.object({
      competitor_name: z.string(),
      our_advantages: z.string(),
      vulnerabilities: z.string(),
    }),
  ),
});
const PautasSchema = z.object({
  pautas: z.array(
    z.object({
      titulo: z.string(),
      pilar_type: z.string(),
      cohort_alvo: z.string(),
      formato: z.string(),
      plataforma: z.string(),
      gancho: z.string(),
    }),
  ),
});

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

const P = {
  briefing:
    "Você é um estrategista de marketing sênior. Estruture o briefing bruto em JSON limpo. Nunca invente informação. Responda SOMENTE JSON.",
  voice:
    "Você é um redator sênior. A partir do briefing estruturado, gere um Voice Card. Responda SOMENTE JSON.",
  personas:
    "Você é um estrategista sênior. Gere 3–5 personas acionáveis a partir do briefing. Responda SOMENTE JSON.",
  cohorts:
    "Você é estrategista sênior. Gere 3–5 cohorts comportamentais. Responda SOMENTE JSON.",
  swot:
    "Você é estrategista sênior. Gere SWOT + matriz competitiva. Responda SOMENTE JSON.",
  pauta:
    "Você é estrategista de conteúdo. Gere pautas diversificadas por pilar, plataforma e cohort. Responda SOMENTE JSON.",
};

const CHANNEL_MAP: Record<string, "instagram" | "tiktok" | "linkedin" | "x" | "youtube" | "blog"> = {
  instagram: "instagram",
  tiktok: "tiktok",
  linkedin: "linkedin",
  x: "x",
  twitter: "x",
  youtube: "youtube",
  blog: "blog",
};

async function runPhase1(params: {
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
    await patch({ status: "running", started_at: new Date().toISOString(), progress: 5, step_label: "Estruturando briefing" });

    const briefing = await runStructured({
      system: P.briefing,
      prompt: `Texto bruto do briefing:\n"""\n${input.texto}\n"""`,
      schema: BriefingSchema,
      strategic: false,
    });
    await supabase.from("brand_briefings").insert({
      brand_id: input.brandId,
      client_id: input.clientId,
      raw_text: input.texto,
      data: briefing,
      completude: briefing.completude_percentual ?? 0,
      created_by: userId,
    });

    await patch({ progress: 20, step_label: "Modelando tom de voz" });
    const voice = await runStructured({
      system: P.voice,
      prompt: `Briefing estruturado:\n${JSON.stringify(briefing, null, 2)}`,
      schema: VoiceSchema,
      strategic: true,
    });
    await supabase
      .from("brand_voice_cards")
      .update({ is_active: false })
      .eq("brand_id", input.brandId)
      .eq("client_id", input.clientId)
      .eq("is_active", true);
    await supabase.from("brand_voice_cards").insert({
      brand_id: input.brandId,
      client_id: input.clientId,
      data: voice,
      created_by: userId,
    });

    await patch({ progress: 35, step_label: "Mapeando personas" });
    const personas = await runStructured({
      system: P.personas,
      prompt: `Briefing:\n${JSON.stringify(briefing, null, 2)}`,
      schema: PersonasSchema,
      strategic: true,
    });
    await supabase
      .from("brand_personas")
      .update({ is_active: false })
      .eq("brand_id", input.brandId)
      .eq("client_id", input.clientId)
      .eq("is_active", true);
    await supabase.from("brand_personas").insert({
      brand_id: input.brandId,
      client_id: input.clientId,
      data: personas,
      created_by: userId,
    });

    await patch({ progress: 50, step_label: "Construindo cohorts" });
    const cohorts = await runStructured({
      system: P.cohorts,
      prompt: `Briefing:\n${JSON.stringify(briefing, null, 2)}\n\nPersonas:\n${JSON.stringify(personas, null, 2)}`,
      schema: CohortsSchema,
      strategic: true,
    });
    await supabase
      .from("brand_cohorts")
      .update({ is_active: false })
      .eq("brand_id", input.brandId)
      .eq("client_id", input.clientId)
      .eq("is_active", true);
    await supabase.from("brand_cohorts").insert({
      brand_id: input.brandId,
      client_id: input.clientId,
      data: cohorts,
      created_by: userId,
    });

    await patch({ progress: 65, step_label: "Analisando SWOT" });
    const swot = await runStructured({
      system: P.swot,
      prompt: [
        `Briefing:\n${JSON.stringify(briefing, null, 2)}`,
        `Personas:\n${JSON.stringify(personas, null, 2)}`,
        `Cohorts:\n${JSON.stringify(cohorts, null, 2)}`,
      ].join("\n\n"),
      schema: SwotSchema,
      strategic: true,
    });
    await supabase
      .from("brand_swot")
      .update({ is_active: false })
      .eq("brand_id", input.brandId)
      .eq("client_id", input.clientId)
      .eq("is_active", true);
    await supabase.from("brand_swot").insert({
      brand_id: input.brandId,
      client_id: input.clientId,
      data: swot,
      created_by: userId,
    });

    await patch({ progress: 80, step_label: "Gerando ideias de pauta" });
    const pautas = await runStructured({
      system: P.pauta,
      prompt: [
        `Briefing: ${JSON.stringify(briefing)}`,
        `Personas: ${JSON.stringify(personas)}`,
        `Cohorts: ${JSON.stringify(cohorts)}`,
        `SWOT: ${JSON.stringify(swot)}`,
        `Quantidade: ${input.pautasQuantidade}`,
        `Período: ${input.pautasPeriodo}`,
      ].join("\n"),
      schema: PautasSchema,
      strategic: false,
    });

    // Persist pautas for the strategy panel.
    if (Array.isArray(pautas.pautas) && pautas.pautas.length) {
      await supabase.from("brand_pautas").insert(
        pautas.pautas.map((p) => ({
          brand_id: input.brandId,
          client_id: input.clientId,
          titulo: p.titulo,
          pilar: p.pilar_type,
          pilar_type: p.pilar_type,
          status: "sent_to_content",
          cohort_alvo: p.cohort_alvo,
          formato_recomendado: p.formato,
          formato: p.formato,
          plataforma: p.plataforma,
          gancho: p.gancho,
          data: p,
          created_by: userId,
        })),
      );
    }

    await patch({ progress: 92, step_label: "Injetando ideias no pipeline" });

    // Resolve pipeline + first stage.
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
    if (pipelineId && ideaStageId && pautas.pautas?.length) {
      const { data: maxRow } = await supabase
        .from("posts")
        .select("position")
        .eq("stage_id", ideaStageId)
        .order("position", { ascending: false })
        .limit(1);
      let nextPos = ((maxRow?.[0]?.position ?? -1) as number) + 1024;
      const rows = pautas.pautas.map((p) => {
        const platform = (p.plataforma ?? "").toLowerCase().trim();
        const channel = CHANNEL_MAP[platform] ?? "instagram";
        const row = {
          brand_id: input.brandId,
          client_id: input.clientId,
          pipeline_id: pipelineId!,
          stage_id: ideaStageId!,
          title: p.titulo.slice(0, 160),
          copy: p.gancho,
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
        title: `${injected} ideias aguardando aprovação`,
        content: `Fase 1 concluída. Aprove cada ideia no pipeline para acionar Copy + Design Brief.`,
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

export const Route = createFileRoute("/api/jobs/customer-pipeline")({
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
            kind: "customer_pipeline_phase1",
            title: "Pipeline de onboarding — Fase 1",
            subtitle: "Briefing · Voz · Personas · Cohorts · SWOT · Ideias",
            status: "queued",
            progress: 0,
            input: input as unknown as Database["public"]["Tables"]["ai_jobs"]["Insert"]["input"],
          })
          .select("id")
          .single();
        if (jobErr || !job) {
          return new Response(jobErr?.message ?? "Failed to enqueue", { status: 500 });
        }

        void runPhase1({ jobId: job.id, token, userId, input });

        return new Response(JSON.stringify({ jobId: job.id }), {
          status: 202,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});