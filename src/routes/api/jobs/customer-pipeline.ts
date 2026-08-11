import { createFileRoute } from "@tanstack/react-router";
import { waitUntil } from "@/lib/wait-until.server";
import { createClient } from "@supabase/supabase-js";
import { generateText, NoObjectGeneratedError, Output } from "ai";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { getBrandAiModelAdmin } from "@/lib/ai-provider.server";

// Two-phase pipeline — Phase 1 (Idea Generation).
// Runs briefing → voice → personas → cohorts → SWOT → pauta suggestion,
// then injects each pauta as a `posts` row at stage "idea" with
// review_status='pending'. Executes fully in background; the HTTP handler
// returns 202 immediately with the ai_jobs id so the UI can navigate away.

const BodySchema = z.object({
  brandId: z.string().uuid(),
  clientId: z.string().uuid(),
  // `texto` é opcional: o backend compõe o briefing a partir de
  // `clients` + `clients.brand_hub`. Quando enviado, é anexado como
  // "Notas adicionais do usuário" ao final — nunca substitui.
  texto: z.string().trim().max(20000).optional(),
});

function buildUserClient(token: string) {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  return createClient<Database>(url, key, {
    global: { headers: { Authorization: `Bearer ${token}`, apikey: key } },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

// ---------- Server-side briefing composition ----------
// Reads clients + clients.brand_hub and assembles the raw briefing that will
// feed the pipeline. Front-end no longer sends free-form text (the free-form
// `texto` field is accepted only as an optional complement).
type ClientRow = {
  name: string | null;
  niche: string | null;
  color: string | null;
  logo_url: string | null;
  tone_of_voice: string | null;
  contact_name: string | null;
  contact_email: string | null;
  socials: Record<string, string | null | undefined> | null;
  brand_hub: Record<string, unknown> | null;
};

function composeBriefingFromRecord(row: ClientRow, extraNotes?: string): string {
  const lines: string[] = [];
  const push = (label: string, value: unknown) => {
    if (value == null) return;
    if (Array.isArray(value)) {
      const arr = value.map((v) => (typeof v === "string" ? v.trim() : v)).filter(Boolean);
      if (arr.length === 0) return;
      lines.push(`${label}: ${arr.join(", ")}`);
      return;
    }
    if (typeof value === "string") {
      const t = value.trim();
      if (t) lines.push(`${label}: ${t}`);
      return;
    }
    if (typeof value === "number") {
      lines.push(`${label}: ${value}`);
    }
  };

  const hub = (row.brand_hub ?? {}) as Record<string, unknown>;
  const socials = (row.socials ?? {}) as Record<string, string | null | undefined>;

  // Identidade
  push("Marca", row.name);
  push("Nicho", row.niche);
  push("Cor da marca", row.color);
  push("Tom de voz", (hub.tone_text as string | undefined) ?? row.tone_of_voice);
  push("Missão", hub.mission);
  push("Posicionamento", hub.positioning);
  push("Valores", hub.values);

  // Produto
  push("Oferta / produtos", hub.offer);
  push("Faixa de preço", hub.price_range);
  push("Diferenciais", hub.differentials);
  push("Objeções", hub.objections);

  // Público
  push("Público", hub.audience);
  push("Jornada", hub.journey);
  push("Dores", hub.pain_points);
  push("Desejos", hub.desires);

  // Concorrentes / inspirações
  const competitors = Array.isArray(hub.competitors) ? (hub.competitors as Array<Record<string, unknown>>) : [];
  const compHandles = competitors.map((c) => (typeof c.handle === "string" ? c.handle : "")).filter(Boolean);
  push("Concorrentes / referências", compHandles);
  push("Inspirações", hub.inspirations as unknown);

  // Estética
  const palette = Array.isArray(hub.palette) ? (hub.palette as Array<Record<string, unknown>>) : [];
  const paletteHex = palette
    .map((p) => (typeof p.hex === "string" ? p.hex : ""))
    .filter(Boolean);
  push("Paleta", paletteHex);
  const hashtags = (hub.hashtags as unknown) as string[] | undefined;
  push("Hashtags", hashtags?.map((h) => (h.startsWith("#") ? h : `#${h}`)));
  const doDont = (hub.do_dont ?? {}) as { do?: string; dont?: string };
  push("Do", doDont.do);
  push("Don't", doDont.dont);

  // Volumetria & metas
  const vol = (hub.volumetry ?? {}) as Record<string, number | undefined>;
  const volStr = Object.entries(vol)
    .filter(([, n]) => typeof n === "number" && (n as number) > 0)
    .map(([k, n]) => `${k}: ${n}/sem`)
    .join(", ");
  push("Volumetria semanal", volStr);
  push("Metas", hub.goals);

  // Contato + canais reais capturados no cadastro
  push("Contato principal", [row.contact_name, row.contact_email].filter(Boolean).join(" · "));
  const socialLinks = Object.entries(socials)
    .filter(([, v]) => typeof v === "string" && (v as string).trim())
    .map(([k, v]) => `${k}: ${v}`);
  push("Canais sociais informados", socialLinks);

  const base = lines.join("\n");
  const notes = (extraNotes ?? "").trim();
  if (notes) return `${base}\n\nNotas adicionais do usuário:\n${notes}`;
  return base;
}

// Modelos de geração atual — os prior-gen 2.5-pro/2.5-flash batiam no teto
// de subrequest do Cloudflare Worker (~30s) e causavam cancelamento HTTP 499.
const STRATEGIC_MODEL = "google/gemini-3.1-pro-preview";
const OPERATIONAL_MODEL = "google/gemini-3.6-flash";

// Falha rápido em vez de esperar o reaper de 5min. 60s cobre com folga o
// tempo típico das chamadas atuais e ainda deixa headroom no Worker.
const LLM_TIMEOUT_MS = 60_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timeout de ${ms}ms em ${label}`)), ms);
    promise.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

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
// Pauta generation moved to /api/jobs/generate-ideas — Phase 2, human-gated.

async function runStructured<T extends z.ZodTypeAny>(opts: {
  system: string;
  prompt: string;
  schema: T;
  strategic: boolean;
  brandId: string;
}): Promise<z.infer<T>> {
  const { model } = await getBrandAiModelAdmin(
    opts.brandId,
    "text",
    opts.strategic ? "strategic" : "operational",
  );
  try {
    const res = await withTimeout(
      generateText({
        model,
        system: opts.system,
        prompt: opts.prompt,
        output: Output.object({ schema: opts.schema }),
      }),
      LLM_TIMEOUT_MS,
      opts.modelOverride ?? (opts.strategic ? STRATEGIC_MODEL : OPERATIONAL_MODEL),
    );
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
    "Você é um redator sênior. A partir do briefing estruturado, gere um Voice Card. Use EXATAMENTE as chaves do schema em inglês: voice_card.brand_personality, tone_characteristics, vocabulary_rules.words_to_use, vocabulary_rules.words_to_avoid, brand_phrases_examples. Não traduza nomes de campos. Responda SOMENTE JSON.",
  personas:
    "Você é um estrategista sênior. Gere 3–5 personas acionáveis a partir do briefing. Use EXATAMENTE as chaves do schema em inglês/português combinado: personas[] com nome, descricao, dores, desejos, canais_preferidos, gatilhos_de_decisao, objecoes_comuns. Não use nome_persona nem biografia. Responda SOMENTE JSON.",
  cohorts:
    "Você é estrategista sênior. Gere 3–5 cohorts comportamentais. Use EXATAMENTE as chaves do schema em inglês: cohorts[] com name, target_personas, behavioral_traits, content_strategy, conversion_criteria. Não traduza chaves. Responda SOMENTE JSON.",
  swot:
    "Você é estrategista sênior. Gere SWOT + matriz competitiva. Use EXATAMENTE as chaves em inglês: swot_analysis.strengths, weaknesses, opportunities, threats; competitive_matrix[] com competitor_name, our_advantages, vulnerabilities. Não traduza chaves. Responda SOMENTE JSON.",
};

// ---------------- Normalizers ----------------
// Coerce PT-BR aliases into the canonical shape before persisting so the
// strategy panel always finds what it expects.

type AnyRec = Record<string, unknown>;
const asStr = (v: unknown, d = ""): string => (typeof v === "string" ? v : d);
const asArr = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]).filter((x) => typeof x === "string") : []);

function normalizeVoicePayload(raw: unknown): z.infer<typeof VoiceSchema> {
  const r = (raw ?? {}) as AnyRec;
  const vc = (r.voice_card as AnyRec | undefined) ?? r;
  const persona = vc.persona as AnyRec | undefined;
  const tom = vc.tom_de_voz as AnyRec | undefined;
  const lingu = vc.guia_linguistico as AnyRec | undefined;
  const ex = vc.exemplos_praticos as AnyRec | undefined;
  const vr = vc.vocabulary_rules as AnyRec | undefined;
  return {
    voice_card: {
      brand_personality:
        asStr(vc.brand_personality) ||
        asStr(persona?.arquetipo) ||
        asStr(persona?.descricao) ||
        asStr(tom?.descricao_detalhada),
      tone_characteristics: asArr(vc.tone_characteristics).length
        ? asArr(vc.tone_characteristics)
        : asArr(tom?.principais),
      vocabulary_rules: {
        words_to_use: asArr(vr?.words_to_use).length
          ? asArr(vr?.words_to_use)
          : asArr(lingu?.vocabulario_usar),
        words_to_avoid: asArr(vr?.words_to_avoid).length
          ? asArr(vr?.words_to_avoid)
          : asArr(lingu?.vocabulario_evitar),
      },
      brand_phrases_examples: asArr(vc.brand_phrases_examples).length
        ? asArr(vc.brand_phrases_examples)
        : [ex?.post_instagram_certo, ex?.resposta_cliente_certo].filter(
            (s): s is string => typeof s === "string" && s.length > 0,
          ),
    },
  };
}

function normalizePersonasPayload(raw: unknown): z.infer<typeof PersonasSchema> {
  const r = raw as AnyRec | AnyRec[] | undefined;
  const arr: AnyRec[] = Array.isArray(r)
    ? (r as AnyRec[])
    : Array.isArray((r as AnyRec | undefined)?.personas)
      ? ((r as AnyRec).personas as AnyRec[])
      : [];
  return {
    personas: arr.map((p) => ({
      nome: asStr(p.nome) || asStr(p.nome_persona) || asStr(p.name) || "Persona",
      descricao: asStr(p.descricao) || asStr(p.biografia) || asStr(p.perfil) || "",
      dores: asArr(p.dores),
      desejos: asArr(p.desejos).length ? asArr(p.desejos) : asArr(p.objetivos),
      canais_preferidos: asArr(p.canais_preferidos).length
        ? asArr(p.canais_preferidos)
        : asArr(p.canais),
      gatilhos_de_decisao: asArr(p.gatilhos_de_decisao).length
        ? asArr(p.gatilhos_de_decisao)
        : asArr(p.gatilhos),
      objecoes_comuns: asArr(p.objecoes_comuns).length
        ? asArr(p.objecoes_comuns)
        : asArr(p.objecoes),
    })),
  };
}

function normalizeCohortsPayload(raw: unknown): z.infer<typeof CohortsSchema> {
  const r = raw as AnyRec | AnyRec[] | undefined;
  const arr: AnyRec[] = Array.isArray(r)
    ? (r as AnyRec[])
    : Array.isArray((r as AnyRec | undefined)?.cohorts)
      ? ((r as AnyRec).cohorts as AnyRec[])
      : [];
  return {
    cohorts: arr.map((c) => ({
      name: asStr(c.name) || asStr(c.nome) || "Cohort",
      target_personas: asArr(c.target_personas).length
        ? asArr(c.target_personas)
        : asArr(c.personas_alvo).length
          ? asArr(c.personas_alvo)
          : asArr(c.personas),
      behavioral_traits:
        asStr(c.behavioral_traits) || asStr(c.comportamento) || asStr(c.tracos_comportamentais),
      content_strategy:
        asStr(c.content_strategy) || asStr(c.estrategia_conteudo) || asStr(c.estrategia_de_conteudo),
      conversion_criteria:
        asStr(c.conversion_criteria) || asStr(c.criterio_conversao) || asStr(c.criterio_de_conversao),
    })),
  };
}

function normalizeSwotPayload(raw: unknown): z.infer<typeof SwotSchema> {
  const r = (raw ?? {}) as AnyRec;
  const a = (r.swot_analysis as AnyRec | undefined) ?? r;
  const matrixRaw = Array.isArray(r.competitive_matrix)
    ? (r.competitive_matrix as AnyRec[])
    : Array.isArray(r.matriz_competitiva)
      ? (r.matriz_competitiva as AnyRec[])
      : [];
  return {
    swot_analysis: {
      strengths: asArr(a.strengths).length ? asArr(a.strengths) : asArr(a.forcas),
      weaknesses: asArr(a.weaknesses).length ? asArr(a.weaknesses) : asArr(a.fraquezas),
      opportunities: asArr(a.opportunities).length ? asArr(a.opportunities) : asArr(a.oportunidades),
      threats: asArr(a.threats).length ? asArr(a.threats) : asArr(a.ameacas),
    },
    competitive_matrix: matrixRaw.map((c) => ({
      competitor_name: asStr(c.competitor_name) || asStr(c.nome) || asStr(c.concorrente) || "—",
      our_advantages: asStr(c.our_advantages) || asStr(c.vantagens) || asStr(c.nossas_vantagens),
      vulnerabilities: asStr(c.vulnerabilities) || asStr(c.vulnerabilidades),
    })),
  };
}

async function runPhase1(params: {
  jobId: string;
  token: string;
  userId: string;
  input: z.infer<typeof BodySchema> & { texto: string };
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
      brandId: input.brandId,
    });
    await supabase.from("brand_briefings").insert({
      brand_id: input.brandId,
      client_id: input.clientId,
      raw_text: input.texto,
      data: briefing,
      completude: briefing.completude_percentual ?? 0,
      created_by: userId,
    });

    // Voice + Personas run in parallel (both depend only on the briefing).
    await patch({ progress: 20, step_label: "Modelando voz e personas" });
    const settled = await Promise.allSettled([
      runStructured({
        system: P.voice,
        prompt: `Briefing estruturado:\n${JSON.stringify(briefing, null, 2)}`,
        schema: VoiceSchema,
        strategic: true,
        brandId: input.brandId,
      }),
      runStructured({
        system: P.personas,
        prompt: `Briefing:\n${JSON.stringify(briefing, null, 2)}`,
        schema: PersonasSchema,
        strategic: true,
        brandId: input.brandId,
      }),
    ]);
    if (settled[0].status === "rejected") {
      throw new Error(`Falha ao gerar voz: ${(settled[0].reason as Error)?.message ?? settled[0].reason}`);
    }
    if (settled[1].status === "rejected") {
      throw new Error(`Falha ao gerar personas: ${(settled[1].reason as Error)?.message ?? settled[1].reason}`);
    }
    const voiceRaw = settled[0].value;
    const personasRaw = settled[1].value;
    const voice = normalizeVoicePayload(voiceRaw);
    const personas = normalizePersonasPayload(personasRaw);
    if (!personas.personas.length) throw new Error("Nenhuma persona gerada — tente novamente.");

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

    await patch({ progress: 55, step_label: "Construindo cohorts" });
    const cohortsRaw = await runStructured({
      system: P.cohorts,
      prompt: `Briefing:\n${JSON.stringify(briefing, null, 2)}\n\nPersonas:\n${JSON.stringify(personas, null, 2)}`,
      schema: CohortsSchema,
      strategic: true,
      brandId: input.brandId,
    });
    const cohorts = normalizeCohortsPayload(cohortsRaw);
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

    await patch({ progress: 70, step_label: "Analisando SWOT" });
    const swotRaw = await runStructured({
      system: P.swot,
      prompt: [
        `Briefing:\n${JSON.stringify(briefing, null, 2)}`,
        `Personas:\n${JSON.stringify(personas, null, 2)}`,
        `Cohorts:\n${JSON.stringify(cohorts, null, 2)}`,
      ].join("\n\n"),
      schema: SwotSchema,
      strategic: true,
      brandId: input.brandId,
    });
    const swot = normalizeSwotPayload(swotRaw);
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

    // Strategy is done. Notify the user so they can review before generating ideas.
    const reviewRoute = `/customers/${input.clientId}/briefing`;
    const { error: notifErr } = await supabase.from("notifications").insert({
      user_id: userId,
      brand_id: input.brandId,
      kind: "system",
      title: "Estratégia gerada — revise antes de criar ideias",
      body: "Voice card, personas, cohorts e SWOT prontos. Confira, ajuste e depois clique em Gerar ideias.",
      href: reviewRoute,
      payload: { event: "strategy_ready", client_id: input.clientId },
    });
    if (notifErr) console.warn("[notifications] insert failed", notifErr);

    await patch({
      status: "succeeded",
      progress: 100,
      step_label: null,
      finished_at: new Date().toISOString(),
      target_route: reviewRoute,
      result: {
        title: "Estratégia pronta para revisão",
        content: "Revise voice, personas, cohorts e SWOT. Depois clique em Gerar ideias.",
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

        // Fonte de verdade: dados do cadastro + Cérebro da Marca.
        const { data: clientRow, error: clientErr } = await supabase
          .from("clients")
          .select(
            "name, niche, color, logo_url, tone_of_voice, contact_name, contact_email, socials, brand_hub" as never,
          )
          .eq("id", input.clientId)
          .maybeSingle();
        if (clientErr || !clientRow) {
          return new Response(
            clientErr?.message ?? "Cliente não encontrado",
            { status: 404 },
          );
        }
        const composed = composeBriefingFromRecord(clientRow as unknown as ClientRow, input.texto);
        if (composed.length < 40) {
          return new Response(
            "Preencha ao menos Nome + Nicho e um bloco do Cérebro da Marca antes de gerar a estratégia.",
            { status: 400 },
          );
        }
        const composedInput = { ...input, texto: composed };

        const { data: job, error: jobErr } = await supabase
          .from("ai_jobs")
          .insert({
            brand_id: input.brandId,
            client_id: input.clientId,
            user_id: userId,
            kind: "customer_strategy",
            title: "Estratégia do cliente",
            subtitle: "Briefing · Voz · Personas · Cohorts · SWOT",
            status: "queued",
            progress: 0,
            input: composedInput as unknown as Database["public"]["Tables"]["ai_jobs"]["Insert"]["input"],
          })
          .select("id")
          .single();
        if (jobErr || !job) {
          return new Response(jobErr?.message ?? "Failed to enqueue", { status: 500 });
        }

        waitUntil(runPhase1({ jobId: job.id, token, userId, input: composedInput }));

        return new Response(JSON.stringify({ jobId: job.id }), {
          status: 202,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});