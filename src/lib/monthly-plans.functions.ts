import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { brain, type BrainContext } from "@/lib/brain/api";
import { loadBriefingContext } from "@/lib/monthly-plan-context.server";
import { loadStrategyContext } from "@/lib/monthly-plan-strategy.server";
import { loadPerformanceContext } from "@/lib/monthly-plan-performance.server";
import { runPlanAgent } from "@/lib/monthly-plan-agent.server";
import { PLAN_CHANNELS, PLAN_FORMATS } from "@/lib/monthly-plan-fields";

/* ---------- Types ---------- */

export type MonthlyPlanStatus =
  | "draft"
  | "pending_client"
  | "client_approved"
  | "changes_requested"
  | "client_rejected"
  | "approved"
  | "archived";
export type MonthlyPlanTopicStatus = "pending" | "approved" | "rejected";
export type TopicClientStatus = "pending" | "approved" | "rejected" | "changes";


export type MonthlyPlan = {
  id: string;
  brand_id: string;
  client_id: string;
  input_theme: string | null;
  input_briefing_id: string | null;
  title: string;
  description: string | null;
  objectives: string | null;
  status: MonthlyPlanStatus;
  internal_approved_at: string | null;
  internal_approved_by: string | null;
  client_decision_at: string | null;
  client_feedback: string | null;
  client_decision_mode?: string | null;

  /** Fontes cruzadas na geração (estratégia IA, métricas por canal, brain). */
  context_sources?: {
    model?: string;
    strategy_blocks?: string[];
    strategy_generated_at?: string | null;
    metrics_channels?: string[];
    channels_without_account?: string[];
    brain_context?: boolean;
    agent?: string;
    generated_at?: string;
  } | null;
  created_at: string;
  updated_at: string;
};

export type MonthlyPlanTopic = {
  id: string;
  monthly_plan_id: string;
  topic_title: string;
  content_format: string | null;
  angle: string | null;
  channel: string | null;
  target_audience?: string | null;
  rationale?: string | null;
  status: MonthlyPlanTopicStatus;
  client_status?: TopicClientStatus;
  client_comment?: string | null;
  client_decision_at?: string | null;
  previous_title: string | null;
  previous_angle: string | null;
  position: number;

};

export type MonthlyPlanWithTopics = {
  plan: MonthlyPlan;
  topics: MonthlyPlanTopic[];
};

/** Itens só podem virar card quando têm plataforma e formato definidos. */
export function isTopicComplete(t: Pick<MonthlyPlanTopic, "channel" | "content_format">): boolean {
  return !!(t.channel && t.channel.trim() && t.content_format && t.content_format.trim());
}

/* ---------- Briefings dropdown ---------- */

export const listBriefingsForPlanFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ brandId: z.string().uuid(), clientId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("brand_briefings")
      .select("id, created_at, data")
      .eq("brand_id", data.brandId)
      .eq("client_id", data.clientId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (rows ?? []).map((r) => {
      const d = (r.data as Record<string, unknown> | null) ?? {};
      const label =
        (typeof d.title === "string" && d.title.trim()) ||
        (typeof d.mission === "string" && d.mission.slice(0, 60)) ||
        `Briefing de ${new Date(r.created_at as string).toLocaleDateString("pt-BR")}`;
      return { id: r.id as string, label };
    });
  });

/* ---------- AI generation ---------- */

const GenerateInput = z.object({
  brandId: z.string().uuid(),
  clientId: z.string().uuid(),
  theme: z.string().trim().max(500).optional().default(""),
  briefingId: z.string().uuid().nullable().optional(),
  /** Seleção opcional do wizard: canais, quantidade e formatos permitidos. */
  selection: z
    .array(
      z.object({
        channel: z.enum(PLAN_CHANNELS),
        quantity: z.number().int().min(1).max(60),
        formats: z.array(z.string()).default([]),
      }),
    )
    .min(1)
    .optional(),
});

const AiPlanSchema = z.object({
  title: z.string(),
  description: z.string(),
  objectives: z.string(),
  topics: z
    .array(
      z.object({
        topic_title: z.string(),
        content_format: z.string(),
        angle: z.string(),
        channel: z.string().optional().nullable(),
        target_audience: z.string().optional().nullable(),
        rationale: z.string().optional().nullable(),
      }),
    )
    .min(4)
    .max(60),
});

export const generateMonthlyPlanFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => GenerateInput.parse(i))
  .handler(async ({ data, context }): Promise<MonthlyPlanWithTopics> => {
    const [{ data: brand }, briefingCtx] = await Promise.all([
      context.supabase.from("brands").select("name").eq("id", data.brandId).maybeSingle(),
      loadBriefingContext(context.supabase, data.clientId, {
        briefingId: data.briefingId ?? null,
      }),
    ]);

    // Volumetria é obrigatória — sem ela não há como definir quantas peças gerar.
    if (briefingCtx.totalTarget <= 0) throw new Error("volumetry_required");

    // Cotas efetivas: seleção do wizard quando houver, senão a volumetria do briefing.
    const quota: Record<string, number> = data.selection?.length
      ? data.selection.reduce<Record<string, number>>((acc, s) => {
          acc[s.channel] = (acc[s.channel] ?? 0) + s.quantity;
          return acc;
        }, {})
      : { ...briefingCtx.monthlyQuota };
    const allowedFormats: Record<string, string[]> = {};
    for (const s of data.selection ?? []) {
      const fmts = s.formats.filter((f) => (PLAN_FORMATS as readonly string[]).includes(f));
      if (fmts.length) allowedFormats[s.channel] = fmts;
    }
    const activeChannels = PLAN_CHANNELS.filter((c) => (quota[c] ?? 0) > 0);
    const totalTarget = activeChannels.reduce((s, c) => s + (quota[c] ?? 0), 0);
    if (totalTarget <= 0) throw new Error("volumetry_required");

    // Estratégia IA ativa + desempenho real das contas conectadas (por canal).
    const [strategy, performance] = await Promise.all([
      loadStrategyContext(context.supabase, data.brandId, data.clientId).catch((err) => {
        console.warn("[monthly-plan] strategy context failed", err);
        return null;
      }),
      loadPerformanceContext(context.supabase, {
        brandId: data.brandId,
        clientId: data.clientId,
        channels: activeChannels,
        cacheScopeToken: context.userId,
      }).catch((err) => {
        console.warn("[monthly-plan] performance context failed", err);
        return null;
      }),
    ]);

    // Brain: enrich prompt with consolidated knowledge for this brand/client.
    let brainMarkdown = "";
    try {
      const brainCtx: BrainContext = {
        supabase: context.supabase,
        userId: context.userId,
        brandId: data.brandId,
        clientId: data.clientId,
        module: "monthly-plan",
      };
      const pack = await brain.getContext(brainCtx, {
        topic: `planejamento mensal ${data.theme ?? ""}`.trim(),
        nicheHint: briefingCtx.niche,
      });
      brainMarkdown = pack.markdown ?? "";
    } catch (err) {
      console.warn("[monthly-plan] brain.getContext failed:", err);
    }

    const distributionText = activeChannels
      .map((c) => {
        const fmts = allowedFormats[c];
        return `  * ${c}: ${quota[c]} posts${fmts?.length ? ` (formatos permitidos: ${fmts.join(", ")})` : ""}`;
      })
      .join("\n");

    const audienceOptions = [
      ...(strategy?.personaNames ?? []),
      ...(strategy?.cohortNames ?? []),
    ].filter(Boolean);

    const extraContext = [
      strategy?.markdown,
      performance?.markdown,
      brainMarkdown
        ? `## Contexto do Brain (memórias, insights e métricas desta marca)\n${brainMarkdown}\n\nUse esse contexto para evitar repetir erros passados e reforçar o que já funcionou.`
        : "",
      `## Briefing consolidado do cliente (contexto obrigatório)\n${briefingCtx.text.slice(0, 12000)}`,
    ]
      .filter((s): s is string => !!s && s.trim().length > 0)
      .join("\n\n");

    const prompt = [
      `Você é um estrategista de conteúdo sênior.`,
      `Crie uma pauta mensal de conteúdo para redes sociais em português (Brasil).`,
      `Cruze OBRIGATORIAMENTE: (1) Estratégia IA ativa (voice, personas, cohorts, SWOT),`,
      `(2) desempenho real das contas conectadas por canal e (3) o briefing consolidado.`,
      `Não invente dados: quando um canal estiver sem métricas, baseie-se em briefing e estratégia.`,
      ``,
      `Marca: ${brand?.name ?? "—"}`,
      data.theme
        ? `Tema do mês (input do usuário): ${data.theme}`
        : `Sem tema definido pelo usuário — derive o tema estratégico do mês do briefing e da estratégia ativa.`,
      ``,
      `Regras:`,
      `- title: uma headline curta (máx 90 chars) que resume a estratégia do mês.`,
      `- description: 2-3 frases explicando o contexto do mês.`,
      `- objectives: 2-4 objetivos claros, separados por quebras de linha.`,
      `- topics: EXATAMENTE ${totalTarget} ideias de posts, distribuídas por canal conforme a volumetria:\n${distributionText}\n  Cada ideia deve ter:`,
      `  * topic_title: título curto e criativo do post`,
      `  * content_format: OBRIGATÓRIO — um de ${PLAN_FORMATS.map((f) => `"${f}"`).join(", ")}`,
      `  * channel: OBRIGATÓRIO — um de ${PLAN_CHANNELS.map((c) => `"${c}"`).join(", ")} (respeitar cotas acima)`,
      `  * angle: gancho estratégico / direcionamento para produção (1-2 frases)`,
      audienceOptions.length
        ? `  * target_audience: OBRIGATÓRIO — persona ou cohort da estratégia ativa (${audienceOptions.slice(0, 8).join(", ")})`
        : `  * target_audience: público-alvo principal da ideia, derivado do briefing`,
      `  * rationale: 1 frase citando a evidência usada (métrica do canal, insight do briefing ou item da estratégia)`,
      `- Priorize formatos que performaram melhor em cada canal e reduza os que performaram mal.`,
      `- Balanceie formatos (não use só Reels).`,
      `- Sem markdown, sem prefixos numéricos.`,
      `- Retorne EXATAMENTE um objeto JSON no schema.`,
    ]
      .filter(Boolean)
      .join("\n");

    const { output, modelId } = await runPlanAgent({
      agent: "pauta.suggest",
      supabase: context.supabase,
      brandId: data.brandId,
      clientId: data.clientId,
      userId: context.userId,
      prompt,
      extraContext,
      schema: AiPlanSchema,
    });
    const parsed = output;

    const contextSources = {
      model: modelId,
      briefing_id: data.briefingId ?? null,
      strategy_blocks: strategy?.blocks ?? [],
      strategy_generated_at: strategy?.generatedAt ?? null,
      metrics_channels: performance?.channelsWithMetrics ?? [],
      channels_without_account: performance?.channelsWithoutAccount ?? [],
      brain_context: !!brainMarkdown,
      agent: "pauta.suggest",
      generated_at: new Date().toISOString(),
    };

    const { data: planRow, error: planErr } = await context.supabase
      .from("monthly_plans" as never)
      .insert({
        brand_id: data.brandId,
        client_id: data.clientId,
        input_theme: data.theme || null,
        input_briefing_id: data.briefingId ?? null,
        title: parsed.title.slice(0, 200),
        description: parsed.description.slice(0, 4000),
        objectives: parsed.objectives.slice(0, 4000),
        status: "draft",
        created_by: context.userId,
        context_sources: contextSources,
      } as never)
      .select("*")
      .single();
    if (planErr) throw planErr;
    const plan = planRow as unknown as MonthlyPlan;

    // Normaliza canal/formato contra as cotas — nunca deixa item incompleto.
    const remaining: Record<string, number> = { ...quota };
    const nextChannelWithQuota = (): string => {
      const found = activeChannels.find((c) => (remaining[c] ?? 0) > 0);
      return found ?? activeChannels[0] ?? "instagram";
    };
    const topicRows = parsed.topics.slice(0, totalTarget).map((t, i) => {
      const raw = (t.channel ?? "").toString().trim().toLowerCase();
      const channel =
        (activeChannels as readonly string[]).includes(raw) && (remaining[raw] ?? 0) > 0
          ? raw
          : nextChannelWithQuota();
      remaining[channel] = (remaining[channel] ?? 0) - 1;
      const fmt = (t.content_format ?? "").trim();
      const allowed = allowedFormats[channel];
      const format = allowed?.length
        ? (allowed.includes(fmt) ? fmt : allowed[i % allowed.length]!)
        : (PLAN_FORMATS as readonly string[]).includes(fmt)
          ? fmt
          : "Post estático";
      return {
        monthly_plan_id: plan.id,
        topic_title: t.topic_title.slice(0, 240),
        content_format: format,
        angle: t.angle.slice(0, 1000),
        channel,
        target_audience: (t.target_audience ?? "").toString().trim().slice(0, 240) || null,
        rationale: (t.rationale ?? "").toString().trim().slice(0, 600) || null,
        status: "pending" as const,
        position: i * 1024,
      };
    });
    const { data: inserted, error: topErr } = await context.supabase
      .from("monthly_plan_topics" as never)
      .insert(topicRows as never)
      .select("*");
    if (topErr) throw topErr;

    return {
      plan,
      topics: (inserted as unknown as MonthlyPlanTopic[]).sort(
        (a, b) => a.position - b.position,
      ),
    };
  });

/* ---------- Volumetria (pré-geração) ---------- */

export const getPlanVolumetryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ clientId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = await loadBriefingContext(context.supabase, data.clientId);

    // Quantidade já gerada no mês corrente (todas as pautas do cliente).
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    const generatedThisMonth = PLAN_CHANNELS.reduce<Record<string, number>>((acc, c) => {
      acc[c] = 0;
      return acc;
    }, {});
    let generatedTotal = 0;
    const { data: planRows } = await context.supabase
      .from("monthly_plans" as never)
      .select("id")
      .eq("client_id", data.clientId)
      .gte("created_at", monthStart);
    const planIds = ((planRows ?? []) as Array<{ id: string }>).map((p) => p.id);
    if (planIds.length) {
      const { data: topicRows } = await context.supabase
        .from("monthly_plan_topics" as never)
        .select("channel")
        .in("monthly_plan_id", planIds);
      for (const t of (topicRows ?? []) as Array<{ channel: string | null }>) {
        const c = (t.channel ?? "").toLowerCase();
        if (c in generatedThisMonth) generatedThisMonth[c] = (generatedThisMonth[c] ?? 0) + 1;
        generatedTotal += 1;
      }
    }

    return {
      weekly: ctx.weekly,
      monthlyQuota: ctx.monthlyQuota,
      totalTarget: ctx.totalTarget,
      hasBriefing: ctx.text.trim().length > 0,
      formatsByChannel: ctx.formatsByChannel,
      generatedThisMonth,
      generatedTotal,
    };
  });

/* ---------- CRUD ---------- */

export type MonthlyPlanListItem = {
  id: string;
  title: string;
  status: MonthlyPlanStatus;
  created_at: string;
  created_by: string | null;
  author_name: string | null;
  topics_count: number;
};

export const listMonthlyPlansFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ brandId: z.string().uuid(), clientId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }): Promise<MonthlyPlanListItem[]> => {
    const { data: rows, error } = await context.supabase
      .from("monthly_plans" as never)
      .select("id, title, status, created_at, created_by")
      .eq("brand_id", data.brandId)
      .eq("client_id", data.clientId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    const list = (rows ?? []) as unknown as Array<{
      id: string;
      title: string;
      status: MonthlyPlanStatus;
      created_at: string;
      created_by: string | null;
    }>;
    if (list.length === 0) return [];

    const userIds = Array.from(new Set(list.map((r) => r.created_by).filter((v): v is string => !!v)));
    const authorMap = new Map<string, string>();
    if (userIds.length) {
      const { data: profs } = await context.supabase
        .from("user_profiles")
        .select("id, full_name")
        .in("id", userIds);
      for (const p of profs ?? []) {
        authorMap.set(p.id as string, (p.full_name as string | null) ?? "");
      }
    }

    const planIds = list.map((r) => r.id);
    const countMap = new Map<string, number>();
    if (planIds.length) {
      const { data: tops } = await context.supabase
        .from("monthly_plan_topics" as never)
        .select("monthly_plan_id")
        .in("monthly_plan_id", planIds);
      for (const t of (tops ?? []) as Array<{ monthly_plan_id: string }>) {
        countMap.set(t.monthly_plan_id, (countMap.get(t.monthly_plan_id) ?? 0) + 1);
      }
    }

    return list.map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      created_at: r.created_at,
      created_by: r.created_by,
      author_name: r.created_by ? authorMap.get(r.created_by) || null : null,
      topics_count: countMap.get(r.id) ?? 0,
    }));
  });

export const getMonthlyPlanFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ planId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<MonthlyPlanWithTopics | null> => {
    const { data: planRow } = await context.supabase
      .from("monthly_plans" as never)
      .select("*")
      .eq("id", data.planId)
      .maybeSingle();
    if (!planRow) return null;
    const { data: topics } = await context.supabase
      .from("monthly_plan_topics" as never)
      .select("*")
      .eq("monthly_plan_id", data.planId)
      .order("position", { ascending: true });
    return {
      plan: planRow as unknown as MonthlyPlan,
      topics: (topics ?? []) as unknown as MonthlyPlanTopic[],
    };
  });

export const updateMonthlyPlanFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        planId: z.string().uuid(),
        title: z.string().trim().min(1).max(240).optional(),
        description: z.string().max(4000).nullable().optional(),
        objectives: z.string().max(4000).nullable().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {};
    if (data.title !== undefined) patch.title = data.title;
    if (data.description !== undefined) patch.description = data.description;
    if (data.objectives !== undefined) patch.objectives = data.objectives;
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await context.supabase
      .from("monthly_plans" as never)
      .update(patch as never)
      .eq("id", data.planId);
    if (error) throw error;
    return { ok: true };
  });

export const createTopicFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        planId: z.string().uuid(),
        topic_title: z.string().trim().min(1).max(240),
        content_format: z.string().max(60).nullable().optional(),
        channel: z.string().max(40).nullable().optional(),
        angle: z.string().max(1000).optional().default(""),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<MonthlyPlanTopic> => {
    const { data: max } = await context.supabase
      .from("monthly_plan_topics" as never)
      .select("position")
      .eq("monthly_plan_id", data.planId)
      .order("position", { ascending: false })
      .limit(1);
    const nextPos =
      (((max as unknown as { position: number }[] | null)?.[0]?.position ?? -1) as number) + 1024;
    const { data: row, error } = await context.supabase
      .from("monthly_plan_topics" as never)
      .insert({
        monthly_plan_id: data.planId,
        topic_title: data.topic_title,
        content_format: data.content_format ?? null,
        channel: data.channel ?? null,
        angle: data.angle,
        status: "pending",
        position: nextPos,
      } as never)
      .select("*")
      .single();
    if (error) throw error;
    return row as unknown as MonthlyPlanTopic;
  });

export const updateTopicFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        topicId: z.string().uuid(),
        topic_title: z.string().trim().min(1).max(240).optional(),
        content_format: z.string().max(60).nullable().optional(),
        channel: z.string().max(40).nullable().optional(),
        angle: z.string().max(1000).nullable().optional(),
        status: z.enum(["pending", "approved", "rejected"]).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {};
    for (const k of ["topic_title", "content_format", "channel", "angle", "status"] as const) {
      if (data[k] !== undefined) patch[k] = data[k];
    }
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await context.supabase
      .from("monthly_plan_topics" as never)
      .update(patch as never)
      .eq("id", data.topicId);
    if (error) throw error;
    return { ok: true };
  });

/* ---------- Regeneração de um item específico ---------- */

const RegenSchema = z.object({
  topic_title: z.string(),
  angle: z.string(),
  target_audience: z.string().optional().nullable(),
  rationale: z.string().optional().nullable(),
});

export const regenerateTopicFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        topicId: z.string().uuid(),
        instruction: z.string().trim().max(500).optional().default(""),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<MonthlyPlanTopic> => {
    const { data: topicRow, error: tErr } = await context.supabase
      .from("monthly_plan_topics" as never)
      .select("*")
      .eq("id", data.topicId)
      .maybeSingle();
    if (tErr) throw tErr;
    if (!topicRow) throw new Error("topic_not_found");
    const topic = topicRow as unknown as MonthlyPlanTopic;

    const { data: planRow } = await context.supabase
      .from("monthly_plans" as never)
      .select("*")
      .eq("id", topic.monthly_plan_id)
      .maybeSingle();
    if (!planRow) throw new Error("plan_not_found");
    const plan = planRow as unknown as MonthlyPlan;

    const channel = (topic.channel ?? "").toString().toLowerCase();
    const planChannels = (PLAN_CHANNELS as readonly string[]).includes(channel)
      ? [channel as (typeof PLAN_CHANNELS)[number]]
      : [];

    const [{ data: siblings }, briefingCtx, strategy, performance] = await Promise.all([
      context.supabase
        .from("monthly_plan_topics" as never)
        .select("topic_title, id")
        .eq("monthly_plan_id", plan.id),
      loadBriefingContext(context.supabase, plan.client_id, {
        briefingId: plan.input_briefing_id,
      }),
      loadStrategyContext(context.supabase, plan.brand_id, plan.client_id).catch((err: unknown) => {
        console.warn("[monthly-plan] strategy context failed", err);
        return null;
      }),
      planChannels.length
        ? loadPerformanceContext(context.supabase, {
            brandId: plan.brand_id,
            clientId: plan.client_id,
            channels: planChannels,
            cacheScopeToken: context.userId,
          }).catch((err: unknown) => {
            console.warn("[monthly-plan] performance context failed", err);
            return null;
          })
        : Promise.resolve(null),
    ]);
    const others = ((siblings ?? []) as Array<{ id: string; topic_title: string }>)
      .filter((s) => s.id !== topic.id)
      .map((s) => `- ${s.topic_title}`)
      .join("\n");

    const audienceOptions = [
      ...(strategy?.personaNames ?? []),
      ...(strategy?.cohortNames ?? []),
    ].filter(Boolean);

    const extraContext = [
      strategy?.markdown,
      performance?.markdown,
      `## Briefing consolidado do cliente\n${briefingCtx.text.slice(0, 8000)}`,
    ]
      .filter((s): s is string => !!s && s.trim().length > 0)
      .join("\n\n");

    const prompt = [
      `Você é um estrategista de conteúdo sênior.`,
      `Reescreva UMA ideia de post de uma pauta mensal, em português (Brasil).`,
      `Cruze a estratégia IA ativa, o desempenho real do canal e o briefing.`,
      ``,
      `# Pauta`,
      `Título: ${plan.title}`,
      plan.description ? `Contexto: ${plan.description}` : "",
      plan.objectives ? `Objetivos: ${plan.objectives}` : "",
      plan.input_theme ? `Tema do mês: ${plan.input_theme}` : "",
      ``,
      `# Item atual`,
      `Título: ${topic.topic_title}`,
      `Gancho: ${topic.angle ?? "—"}`,
      `Plataforma (NÃO alterar): ${topic.channel ?? "—"}`,
      `Formato (NÃO alterar): ${topic.content_format ?? "—"}`,
      data.instruction ? `\n# O que mudar (pedido do usuário)\n${data.instruction}` : "",
      ``,
      `# Outras ideias da pauta (NÃO repetir temas)`,
      others || "—",
      ``,
      `Regras:`,
      `- Mantenha a mesma plataforma e o mesmo formato.`,
      `- topic_title: título curto e criativo, diferente do atual.`,
      `- angle: gancho estratégico / direcionamento de produção (1-2 frases).`,
      audienceOptions.length
        ? `- target_audience: persona ou cohort da estratégia ativa (${audienceOptions.slice(0, 8).join(", ")}).`
        : `- target_audience: público-alvo principal derivado do briefing.`,
      `- rationale: 1 frase citando a evidência usada (métrica do canal, briefing ou estratégia).`,
      `- Sem markdown. Retorne EXATAMENTE um objeto JSON no schema.`,
    ]
      .filter(Boolean)
      .join("\n");

    const { output: parsed } = await runPlanAgent({
      agent: "content.generate",
      supabase: context.supabase,
      brandId: plan.brand_id,
      clientId: plan.client_id,
      userId: context.userId,
      prompt,
      extraContext,
      schema: RegenSchema,
    });

    const { data: updated, error: uErr } = await context.supabase
      .from("monthly_plan_topics" as never)
      .update({
        topic_title: parsed.topic_title.slice(0, 240),
        angle: parsed.angle.slice(0, 1000),
        target_audience:
          (parsed.target_audience ?? "").toString().trim().slice(0, 240) ||
          (topic as { target_audience?: string | null }).target_audience ||
          null,
        rationale: (parsed.rationale ?? "").toString().trim().slice(0, 600) || null,
        previous_title: topic.topic_title,
        previous_angle: topic.angle,
        status: "pending",
      } as never)
      .eq("id", topic.id)
      .select("*")
      .single();
    if (uErr) throw uErr;
    return updated as unknown as MonthlyPlanTopic;
  });

export const undoTopicRegenerationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ topicId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<MonthlyPlanTopic> => {
    const { data: row } = await context.supabase
      .from("monthly_plan_topics" as never)
      .select("*")
      .eq("id", data.topicId)
      .maybeSingle();
    if (!row) throw new Error("topic_not_found");
    const topic = row as unknown as MonthlyPlanTopic;
    if (!topic.previous_title) throw new Error("no_previous_version");
    const { data: updated, error } = await context.supabase
      .from("monthly_plan_topics" as never)
      .update({
        topic_title: topic.previous_title,
        angle: topic.previous_angle,
        previous_title: null,
        previous_angle: null,
      } as never)
      .eq("id", topic.id)
      .select("*")
      .single();
    if (error) throw error;
    return updated as unknown as MonthlyPlanTopic;
  });

/* ---------- Aprovação interna (item por item) ---------- */

export const setTopicDecisionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        topicId: z.string().uuid(),
        status: z.enum(["pending", "approved", "rejected"]),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    if (data.status === "approved") {
      const { data: row } = await context.supabase
        .from("monthly_plan_topics" as never)
        .select("channel, content_format")
        .eq("id", data.topicId)
        .maybeSingle();
      const t = (row ?? {}) as { channel: string | null; content_format: string | null };
      if (!isTopicComplete(t)) throw new Error("topic_incomplete");
    }
    const { error } = await context.supabase
      .from("monthly_plan_topics" as never)
      .update({ status: data.status } as never)
      .eq("id", data.topicId);
    if (error) throw error;
    return { ok: true };
  });

export const deleteTopicFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ topicId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("monthly_plan_topics" as never)
      .delete()
      .eq("id", data.topicId);
    if (error) throw error;
    return { ok: true };
  });

export const discardMonthlyPlanFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ planId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("monthly_plans" as never)
      .update({ status: "archived" } as never)
      .eq("id", data.planId);
    if (error) throw error;
    return { ok: true };
  });

/* ---------- Envio ao cliente ---------- */

function randomToken(len = 40): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, len);
}

export type PlanClientLink = {
  token: string;
  url: string;
  expires_at: string | null;
};

export const submitPlanToClientFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        planId: z.string().uuid(),
        expiresInDays: z.number().int().min(1).max(90).default(14),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<PlanClientLink> => {
    const { data: planRow } = await context.supabase
      .from("monthly_plans" as never)
      .select("id, brand_id, client_id, status")
      .eq("id", data.planId)
      .maybeSingle();
    if (!planRow) throw new Error("plan_not_found");
    const plan = planRow as unknown as {
      id: string;
      brand_id: string;
      client_id: string;
      status: MonthlyPlanStatus;
    };

    const { data: topics } = await context.supabase
      .from("monthly_plan_topics" as never)
      .select("id, status, channel, content_format")
      .eq("monthly_plan_id", plan.id);
    const list = (topics ?? []) as unknown as MonthlyPlanTopic[];
    if (list.length === 0) throw new Error("plan_has_no_topics");
    if (list.some((t) => t.status === "pending")) throw new Error("topics_pending_decision");
    const approved = list.filter((t) => t.status === "approved");
    if (approved.length === 0) throw new Error("no_approved_topics");
    if (approved.some((t) => !isTopicComplete(t))) throw new Error("topics_incomplete");

    // Reaproveita um link válido, se existir.
    const { data: existing } = await context.supabase
      .from("monthly_plan_tokens" as never)
      .select("token, expires_at, revoked_at")
      .eq("monthly_plan_id", plan.id)
      .is("revoked_at", null)
      .order("created_at", { ascending: false })
      .limit(1);
    const found = (existing ?? [])[0] as
      | { token: string; expires_at: string | null }
      | undefined;

    let token = found?.token ?? null;
    let expiresAt = found?.expires_at ?? null;
    if (!token || (expiresAt && new Date(expiresAt).getTime() < Date.now())) {
      token = randomToken(40);
      expiresAt = new Date(Date.now() + data.expiresInDays * 86_400_000).toISOString();
      const { error: insErr } = await context.supabase
        .from("monthly_plan_tokens" as never)
        .insert({
          monthly_plan_id: plan.id,
          brand_id: plan.brand_id,
          client_id: plan.client_id,
          token,
          expires_at: expiresAt,
          created_by: context.userId,
        } as never);
      if (insErr) throw insErr;
    }

    const { error: upErr } = await context.supabase
      .from("monthly_plans" as never)
      .update({
        status: "pending_client",
        internal_approved_at: new Date().toISOString(),
        internal_approved_by: context.userId,
        client_decision_at: null,
        client_feedback: null,
        client_decision_mode: null,
      } as never)
      .eq("id", plan.id);
    if (upErr) throw upErr;

    // Reenvio: limpa decisões anteriores dos itens que ainda não viraram card.
    await context.supabase
      .from("monthly_plan_topics" as never)
      .update({ client_status: "pending", client_comment: null, client_decision_at: null } as never)
      .eq("monthly_plan_id", plan.id)
      .neq("client_status", "approved");


    return { token, url: `/pauta/${plan.id}?token=${token}`, expires_at: expiresAt };
  });

export const getPlanClientLinkFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ planId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<PlanClientLink | null> => {
    const { data: rows } = await context.supabase
      .from("monthly_plan_tokens" as never)
      .select("token, expires_at")
      .eq("monthly_plan_id", data.planId)
      .is("revoked_at", null)
      .order("created_at", { ascending: false })
      .limit(1);
    const row = (rows ?? [])[0] as { token: string; expires_at: string | null } | undefined;
    if (!row) return null;
    return {
      token: row.token,
      url: `/pauta/${data.planId}?token=${row.token}`,
      expires_at: row.expires_at,
    };
  });

/* ---------- Approve → Kanban (após aprovação do cliente) ---------- */

export const approveMonthlyPlanFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        planId: z.string().uuid(),
        brandId: z.string().uuid(),
        clientId: z.string().uuid(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<{ created: number }> => {
    const { materializePlanToKanban } = await import("@/lib/monthly-plan-kanban.server");
    const { data: planRow, error: planErr } = await context.supabase
      .from("monthly_plans" as never)
      .select("id, brand_id, status")
      .eq("id", data.planId)
      .maybeSingle();
    if (planErr) throw planErr;
    if (!planRow) throw new Error("plan_not_found");
    const planStatus = (planRow as unknown as { status: MonthlyPlanStatus }).status;
    if (planStatus !== "client_approved" && planStatus !== "changes_requested") {
      throw new Error("client_approval_required");
    }

    const res = await materializePlanToKanban(
      context.supabase as unknown as import("@supabase/supabase-js").SupabaseClient,
      {
        planId: data.planId,
        brandId: data.brandId,
        clientId: data.clientId,
        userId: context.userId,
        markPlanApproved: planStatus === "client_approved",
      },
    );

    return { created: res.created };
  });
