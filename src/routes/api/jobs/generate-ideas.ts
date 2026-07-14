import { createFileRoute } from "@tanstack/react-router";
import { waitUntil } from "@/lib/wait-until.server";
import { createClient } from "@supabase/supabase-js";
import { generateText, NoObjectGeneratedError, Output } from "ai";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

// Phase 2 — Human-gated idea generation.
// Runs ONLY after the strategy artifacts (voice/personas/cohorts/swot) exist
// and have been reviewed by a human. Emits pautas into brand_pautas and
// injects `posts` rows at stage "idea" for the pipeline to consume.

const BodySchema = z.object({
  brandId: z.string().uuid(),
  clientId: z.string().uuid(),
  pipelineId: z.string().uuid().nullable().optional(),
  quantidade: z.number().int().min(1).max(20).default(8),
  periodo: z.string().default("próximos 15 dias"),
});

function buildUserClient(token: string) {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  return createClient<Database>(url, key, {
    global: { headers: { Authorization: `Bearer ${token}`, apikey: key } },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

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

const CHANNEL_MAP: Record<string, "instagram" | "tiktok" | "linkedin" | "x" | "youtube" | "blog"> = {
  instagram: "instagram",
  tiktok: "tiktok",
  linkedin: "linkedin",
  x: "x",
  twitter: "x",
  youtube: "youtube",
  blog: "blog",
};

async function runIdeas(params: {
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
    await patch({ status: "running", started_at: new Date().toISOString(), progress: 10, step_label: "Carregando estratégia" });

    const [briefingR, voiceR, personasR, cohortsR, swotR, hubR] = await Promise.all([
      supabase
        .from("brand_briefings")
        .select("data")
        .eq("brand_id", input.brandId)
        .eq("client_id", input.clientId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("brand_voice_cards")
        .select("data")
        .eq("brand_id", input.brandId)
        .eq("client_id", input.clientId)
        .eq("is_active", true)
        .maybeSingle(),
      supabase
        .from("brand_personas")
        .select("data")
        .eq("brand_id", input.brandId)
        .eq("client_id", input.clientId)
        .eq("is_active", true)
        .maybeSingle(),
      supabase
        .from("brand_cohorts")
        .select("data")
        .eq("brand_id", input.brandId)
        .eq("client_id", input.clientId)
        .eq("is_active", true)
        .maybeSingle(),
      supabase
        .from("brand_swot")
        .select("data")
        .eq("brand_id", input.brandId)
        .eq("client_id", input.clientId)
        .eq("is_active", true)
        .maybeSingle(),
      supabase
        .from("clients")
        .select("brand_hub")
        .eq("id", input.clientId)
        .eq("brand_id", input.brandId)
        .maybeSingle(),
    ]);

    if (!voiceR.data || !personasR.data || !cohortsR.data || !swotR.data) {
      throw new Error("Estratégia incompleta — gere a estratégia antes de criar ideias.");
    }

    // ---- Volumetria (posts/semana por canal) ---------------------------------
    const hub = ((hubR.data as { brand_hub?: Record<string, unknown> } | null)?.brand_hub ?? {}) as {
      volumetry?: Record<string, number>;
    };
    const CHANNELS = ["instagram", "tiktok", "linkedin", "youtube", "facebook"] as const;
    const perWeek: Record<string, number> = {};
    let weeklyTotal = 0;
    for (const c of CHANNELS) {
      const v = Math.max(0, Math.floor(Number(hub.volumetry?.[c] ?? 0)));
      perWeek[c] = v;
      weeklyTotal += v;
    }
    // Alocação por canal (largest remainder) para as N ideias.
    const channelAllocation: string[] = [];
    if (weeklyTotal > 0) {
      const raw = CHANNELS.map((c) => ({ c, exact: (perWeek[c] / weeklyTotal) * input.quantidade }));
      const base = raw.map((r) => ({ c: r.c, n: Math.floor(r.exact), rem: r.exact - Math.floor(r.exact) }));
      let remaining = input.quantidade - base.reduce((s, r) => s + r.n, 0);
      base.sort((a, b) => b.rem - a.rem);
      for (let i = 0; i < base.length && remaining > 0; i++, remaining--) base[i].n += 1;
      for (const b of base) for (let i = 0; i < b.n; i++) channelAllocation.push(b.c);
    }
    // Janela: quantas semanas úteis são necessárias respeitando a volumetria.
    const weeksNeeded = weeklyTotal > 0 ? Math.max(1, Math.ceil(input.quantidade / weeklyTotal)) : 1;
    const businessDaysNeeded = Math.max(1, weeksNeeded * 5);

    await patch({ progress: 35, step_label: "Gerando pautas" });

    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");
    const gateway = createLovableAiGatewayProvider(key, undefined, { structuredOutputs: true });

    const volumetriaBlock =
      weeklyTotal > 0
        ? `Volumetria semanal (respeitar proporção): ${CHANNELS.filter((c) => perWeek[c] > 0)
            .map((c) => `${c}=${perWeek[c]}/sem`)
            .join(", ")}. Total ${weeklyTotal}/semana, janela ~${weeksNeeded} semana(s).`
        : "Volumetria não definida — diversifique canais livremente.";

    let pautas: z.infer<typeof PautasSchema>;
    try {
      const res = await generateText({
        model: gateway("google/gemini-2.5-flash"),
        system:
          "Você é estrategista de conteúdo. Gere pautas diversificadas por pilar, plataforma e cohort. Responda SOMENTE JSON.",
        prompt: [
          `Briefing: ${JSON.stringify(briefingR.data?.data ?? {})}`,
          `Voice: ${JSON.stringify(voiceR.data.data)}`,
          `Personas: ${JSON.stringify(personasR.data.data)}`,
          `Cohorts: ${JSON.stringify(cohortsR.data.data)}`,
          `SWOT: ${JSON.stringify(swotR.data.data)}`,
          `Quantidade: ${input.quantidade}`,
          `Período: ${input.periodo}`,
          volumetriaBlock,
        ].join("\n"),
        output: Output.object({ schema: PautasSchema }),
      });
      pautas = res.output as z.infer<typeof PautasSchema>;
    } catch (err) {
      if (NoObjectGeneratedError.isInstance(err)) {
        const raw = (err.text ?? "").replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
        pautas = JSON.parse(raw) as z.infer<typeof PautasSchema>;
      } else {
        throw err;
      }
    }

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

    await patch({ progress: 75, step_label: "Injetando ideias no pipeline" });

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

      // ---- Distribuição no calendário (dias úteis, 10/14/17 BRT) -------------
      const businessDays: Date[] = [];
      const cursor = new Date();
      cursor.setUTCDate(cursor.getUTCDate() + 1);
      cursor.setUTCHours(13, 0, 0, 0);
      while (businessDays.length < businessDaysNeeded) {
        const dow = cursor.getUTCDay();
        if (dow !== 0 && dow !== 6) businessDays.push(new Date(cursor));
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
      const slotHours = [13, 17, 20]; // 10h / 14h / 17h BRT
      const N = pautas.pautas.length;
      const perDay = Math.max(1, Math.ceil(N / businessDays.length));
      const scheduleFor = (index: number) => {
        const dayIdx = Math.min(businessDays.length - 1, Math.floor(index / perDay));
        const slotIdx = index % perDay;
        const d = new Date(businessDays[dayIdx]);
        d.setUTCHours(slotHours[slotIdx % slotHours.length], 0, 0, 0);
        return d.toISOString();
      };

      const rows = pautas.pautas.map((p, idx) => {
        // Canal: se houver volumetria, respeita a alocação proporcional;
        // caso contrário, cai na plataforma sugerida pelo LLM.
        const fromAlloc = channelAllocation[idx];
        const platform = (fromAlloc ?? p.plataforma ?? "").toLowerCase().trim();
        const channel =
          CHANNEL_MAP[platform] ?? (platform === "facebook" ? ("facebook" as const) : "instagram");
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
          scheduled_at: scheduleFor(idx),
        };
        nextPos += 1024;
        return row;
      });
      const { error: insErr } = await supabase.from("posts").insert(rows as never);
      if (insErr) throw insErr;
      injected = rows.length;
    }

    const { error: notifErr } = await supabase.from("notifications").insert({
      user_id: userId,
      brand_id: input.brandId,
      kind: "system",
      title: `${injected} novas ideias no pipeline`,
      body: "Aprove cada ideia em /content para acionar Copy + Design Brief.",
      href: "/content",
      payload: { event: "ideas_ready", client_id: input.clientId, count: injected },
    });
    if (notifErr) console.warn("[notifications] insert failed", notifErr);

    await patch({
      status: "succeeded",
      progress: 100,
      step_label: null,
      finished_at: new Date().toISOString(),
      target_route: "/content",
      result: {
        title: `${injected} ideias aguardando aprovação`,
        content: "Aprove cada ideia no pipeline para acionar Copy + Design Brief.",
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

export const Route = createFileRoute("/api/jobs/generate-ideas")({
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

        // Preflight: strategy artifacts must exist.
        const [voiceR, personasR, cohortsR, swotR] = await Promise.all([
          supabase.from("brand_voice_cards").select("id").eq("brand_id", input.brandId).eq("client_id", input.clientId).eq("is_active", true).maybeSingle(),
          supabase.from("brand_personas").select("id").eq("brand_id", input.brandId).eq("client_id", input.clientId).eq("is_active", true).maybeSingle(),
          supabase.from("brand_cohorts").select("id").eq("brand_id", input.brandId).eq("client_id", input.clientId).eq("is_active", true).maybeSingle(),
          supabase.from("brand_swot").select("id").eq("brand_id", input.brandId).eq("client_id", input.clientId).eq("is_active", true).maybeSingle(),
        ]);
        if (!voiceR.data || !personasR.data || !cohortsR.data || !swotR.data) {
          return new Response(
            JSON.stringify({ error: "Gere a estratégia antes de criar ideias." }),
            { status: 409, headers: { "Content-Type": "application/json" } },
          );
        }

        const { data: job, error: jobErr } = await supabase
          .from("ai_jobs")
          .insert({
            brand_id: input.brandId,
            client_id: input.clientId,
            user_id: userId,
            kind: "generate_ideas",
            title: "Gerando ideias de conteúdo",
            subtitle: `${input.quantidade} pautas · ${input.periodo}`,
            status: "queued",
            progress: 0,
            input: input as unknown as Database["public"]["Tables"]["ai_jobs"]["Insert"]["input"],
          })
          .select("id")
          .single();
        if (jobErr || !job) {
          return new Response(jobErr?.message ?? "Failed to enqueue", { status: 500 });
        }

        waitUntil(runIdeas({ jobId: job.id, token, userId, input }));

        return new Response(JSON.stringify({ jobId: job.id }), {
          status: 202,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});