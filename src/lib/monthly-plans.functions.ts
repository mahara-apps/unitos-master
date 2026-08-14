import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { brain, type BrainContext } from "@/lib/brain/api";
import { loadBriefingContext } from "@/lib/monthly-plan-context.server";
import { loadStrategyContext } from "@/lib/monthly-plan-strategy.server";
import { loadPerformanceContext } from "@/lib/monthly-plan-performance.server";
import { runPlanAgent } from "@/lib/monthly-plan-agent.server";
import { PLAN_CHANNELS, getWeeksInMonth, type PlanChannel } from "@/lib/monthly-plan-fields";
import {
  CONTENT_FORMATS,
  CONTENT_FORMAT_LABEL,
  describeDistribution,
  normalizeContentFormat,
  formatsForChannel,
  type ContentFormat,
} from "@/lib/content-formats";
import {
  createSlotAllocator,
  channelTotals,
  totalSlots,
  type ChannelFormatQuota,
} from "@/lib/monthly-plan-distribution";
import { currentPeriodMonth, loadApprovedOverage } from "@/lib/plan-overage.server";
import {
  acquirePlanGenerationLock,
  releasePlanGenerationLock,
} from "@/lib/monthly-plan-lock.server";
import { runPlanGeneration } from "@/lib/monthly-plan-generate.server";
import { countGeneratedThisMonth } from "@/lib/monthly-plan-generated-count.server";


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

/** Códigos de falha "esperada" da geração — sempre com mensagem em pt-BR. */
export type GenerateFailureCode =
  | "ai_provider_not_configured"
  | "ai_provider_key_missing"
  | "ai_model_unavailable"
  | "ai_provider_quota"
  | "ai_provider_rate_limit"
  | "ai_provider_unavailable"
  | "ai_invalid_output"
  | "ai_generation_failed"
  | "incomplete_generation"
  | "generation_in_progress";

export type GenerateMonthlyPlanResult =
  | { ok: true; data: MonthlyPlanWithTopics; resumed?: boolean }
  | {
      ok: false;
      code: GenerateFailureCode;
      /** Falha transitória: a mesma geração pode ser retomada depois. */
      retryable?: boolean;
    }
  | {
      ok: false;
      code: "overage_not_authorized";
      overage: Array<{ channel: PlanChannel; quota: number; requested: number; overage: number }>;
    };




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
  project_id?: string | null;
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
  /** Seleção opcional do wizard: canais, quantidade e cotas por formato. */
  selection: z
    .array(
      z.object({
        channel: z.enum(PLAN_CHANNELS),
        quantity: z.number().int().min(1).max(60),
        /** Formatos permitidos (legado/compatibilidade). */
        formats: z.array(z.string()).default([]),
        /** Cota por formato canônico: { feed: 4, stories: 4, reels: 2 }. */
        formatQuotas: z.record(z.string(), z.number().int().min(0).max(60)).optional(),
      }),
    )
    .min(1)
    .optional(),
  /** Semanas de produção no mês-alvo (4 ou 5 conforme o calendário). */
  weeksPerMonth: z.number().int().min(1).max(6).optional(),
});

export const generateMonthlyPlanFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => GenerateInput.parse(i))
  .handler(async ({ data, context }): Promise<GenerateMonthlyPlanResult> => {
    const period = currentPeriodMonth();
    // Trava server-side: uma geração por marca + cliente + período.
    const lock = await acquirePlanGenerationLock(context.supabase, {
      brandId: data.brandId,
      clientId: data.clientId,
      userId: context.userId,
      period,
    });
    if ("conflict" in lock) return { ok: false, code: "generation_in_progress" };
    try {
      const result = await runPlanGeneration({
        supabase: context.supabase,
        userId: context.userId,
        input: data,
        period,
        jobId: lock.jobId,
      });
      await releasePlanGenerationLock(context.supabase, lock.jobId, {
        ok: result.ok,
        ...(result.ok ? { planId: result.data.plan.id } : { error: result.code }),
      });
      return result;
    } catch (err) {
      await releasePlanGenerationLock(context.supabase, lock.jobId, {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  });

/* ---------- Volumetria (pré-geração) ---------- */

export const getPlanVolumetryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ clientId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    // Usa o número real de semanas do mês corrente para exibir a cota correta.
    const now = new Date();
    const ctx = await loadBriefingContext(context.supabase, data.clientId, {
      weeksPerMonth: getWeeksInMonth(now.getFullYear(), now.getMonth()),
    });

    // Quantidade já gerada no mês corrente (todas as pautas do cliente).
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    const generatedThisMonth = await countGeneratedThisMonth(
      context.supabase,
      data.clientId,
      monthStart,
    );
    const generatedTotal = PLAN_CHANNELS.reduce((s, c) => s + (generatedThisMonth[c] ?? 0), 0);
    const approvedOverage = await loadApprovedOverage(context.supabase, {
      clientId: data.clientId,
    });

    return {
      weekly: ctx.weekly,
      monthlyQuota: ctx.monthlyQuota,
      volumetryBasis: ctx.volumetryBasis,
      totalTarget: ctx.totalTarget,
      hasBriefing: ctx.text.trim().length > 0,
      formatsByChannel: ctx.formatsByChannel,
      /** canal → formato → quantidade MENSAL (fonte da distribuição da pauta). */
      formatQuota: ctx.formatQuota,
      /** canais com breakdown explícito salvo no briefing. */
      channelsWithBreakdown: ctx.channelsWithBreakdown,
      generatedThisMonth,
      generatedTotal,
      approvedOverage,
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
      .select("id, brand_id, client_id, status, title, project_id")
      .eq("id", data.planId)
      .maybeSingle();
    if (!planRow) throw new Error("plan_not_found");
    const plan = planRow as unknown as {
      id: string;
      brand_id: string;
      client_id: string;
      status: MonthlyPlanStatus;
      title: string | null;
      project_id: string | null;
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

    // Aprovação interna → a pauta passa a existir como projeto ativo (idempotente).
    const { ensurePlanProject } = await import("@/lib/monthly-plan-project.server");
    await ensurePlanProject(context.supabase as never, {
      planId: plan.id,
      brandId: plan.brand_id,
      clientId: plan.client_id,
      title: plan.title,
      userId: context.userId,
    });

    return { token, url: `/pauta/${plan.id}?token=${token}`, expires_at: expiresAt };
  });

/** Cria/vincula o projeto ativo da pauta aprovada internamente (idempotente). */
export const ensurePlanProjectFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ planId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<{ projectId: string | null; created: boolean }> => {
    const { data: planRow } = await context.supabase
      .from("monthly_plans" as never)
      .select("id, brand_id, client_id, title, status, internal_approved_at, project_id")
      .eq("id", data.planId)
      .maybeSingle();
    if (!planRow) throw new Error("plan_not_found");
    const plan = planRow as unknown as {
      id: string;
      brand_id: string;
      client_id: string | null;
      title: string | null;
      status: MonthlyPlanStatus;
      internal_approved_at: string | null;
      project_id: string | null;
    };
    if (!plan.internal_approved_at) return { projectId: plan.project_id, created: false };

    const { ensurePlanProject } = await import("@/lib/monthly-plan-project.server");
    return await ensurePlanProject(context.supabase as never, {
      planId: plan.id,
      brandId: plan.brand_id,
      clientId: plan.client_id,
      title: plan.title,
      userId: context.userId,
    });
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
