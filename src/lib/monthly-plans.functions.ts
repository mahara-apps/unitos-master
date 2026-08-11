import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText, NoObjectGeneratedError, Output } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getBrandAiModel } from "@/lib/ai-provider.server";
import { brain, type BrainContext } from "@/lib/brain/api";
import { loadBriefingContext } from "@/lib/monthly-plan-context.server";
import { PLAN_CHANNELS, PLAN_FORMATS } from "@/lib/monthly-plan-fields";

/* ---------- Types ---------- */

export type MonthlyPlanStatus =
  | "draft"
  | "pending_client"
  | "client_approved"
  | "changes_requested"
  | "approved"
  | "archived";
export type MonthlyPlanTopicStatus = "pending" | "approved" | "rejected";

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
  status: MonthlyPlanTopicStatus;
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
      }),
    )
    .min(4)
    .max(60),
});

function tryParseFallback(text: string | undefined) {
  if (!text) return null;
  try {
    const m = text.match(/\{[\s\S]*\}/);
    return JSON.parse(m ? m[0] : text);
  } catch {
    return null;
  }
}

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

    const prompt = [
      `Você é um estrategista de conteúdo sênior.`,
      `Crie uma pauta mensal de conteúdo para redes sociais em português (Brasil).`,
      ``,
      brainMarkdown
        ? `# Contexto do Brain (memórias, insights e métricas desta marca)\n${brainMarkdown}\n\nUse esse contexto para evitar repetir erros passados, reforçar o que já funcionou e respeitar diretrizes aprendidas.`
        : "",
      ``,
      `Marca: ${brand?.name ?? "—"}`,
      `# Briefing do cliente (contexto obrigatório)`,
      briefingCtx.text.slice(0, 12000),
      ``,
      data.theme
        ? `Tema do mês (input do usuário): ${data.theme}`
        : `Sem tema definido pelo usuário — derive o tema estratégico do mês diretamente do briefing acima, priorizando objetivos de negócio, público-alvo e oportunidades de conteúdo.`,
      ``,
      `Regras:`,
      `- title: uma headline curta (máx 90 chars) que resume a estratégia do mês.`,
      `- description: 2-3 frases explicando o contexto do mês.`,
      `- objectives: 2-4 objetivos claros, separados por quebras de linha.`,
      `- topics: EXATAMENTE ${totalTarget} ideias de posts, distribuídas por canal conforme a volumetria mensal do cliente:\n${distributionText}\n  Cada ideia deve ter:`,
      `  * topic_title: título curto e criativo do post`,
      `  * content_format: OBRIGATÓRIO — um de ${PLAN_FORMATS.map((f) => `"${f}"`).join(", ")}`,
      `  * channel: OBRIGATÓRIO — um de ${PLAN_CHANNELS.map((c) => `"${c}"`).join(", ")} (respeitar cotas acima)`,
      `  * angle: gancho estratégico / direcionamento para produção (1-2 frases)`,
      `- Balanceie formatos (não use só Reels).`,
      `- Sem markdown, sem prefixos numéricos.`,
      `- Retorne EXATAMENTE um objeto JSON no schema.`,
    ]
      .filter(Boolean)
      .join("\n");

    const { model } = await getBrandAiModel(context.supabase, data.brandId, "text");

    let parsed: z.infer<typeof AiPlanSchema> | null = null;
    try {
      const { output } = await generateText({
        model,
        output: Output.object({ schema: AiPlanSchema }),
        prompt,
      });
      parsed = output as z.infer<typeof AiPlanSchema>;
    } catch (error) {
      if (NoObjectGeneratedError.isInstance(error)) {
        const fb = tryParseFallback((error as { text?: string }).text);
        const safe = AiPlanSchema.safeParse(fb);
        if (safe.success) parsed = safe.data;
      }
      if (!parsed) {
        const msg = error instanceof Error ? error.message : "ai_generation_failed";
        throw new Error(msg);
      }
    }

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

const RegenSchema = z.object({ topic_title: z.string(), angle: z.string() });

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

    const [{ data: siblings }, briefingCtx] = await Promise.all([
      context.supabase
        .from("monthly_plan_topics" as never)
        .select("topic_title, id")
        .eq("monthly_plan_id", plan.id),
      loadBriefingContext(context.supabase, plan.client_id, {
        briefingId: plan.input_briefing_id,
      }),
    ]);
    const others = ((siblings ?? []) as Array<{ id: string; topic_title: string }>)
      .filter((s) => s.id !== topic.id)
      .map((s) => `- ${s.topic_title}`)
      .join("\n");

    const prompt = [
      `Você é um estrategista de conteúdo sênior.`,
      `Reescreva UMA ideia de post de uma pauta mensal, em português (Brasil).`,
      ``,
      `# Briefing do cliente`,
      briefingCtx.text.slice(0, 8000),
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
      `- Sem markdown. Retorne EXATAMENTE um objeto JSON no schema.`,
    ]
      .filter(Boolean)
      .join("\n");

    const { model } = await getBrandAiModel(context.supabase, plan.brand_id, "text");
    let parsed: z.infer<typeof RegenSchema> | null = null;
    try {
      const { output } = await generateText({
        model,
        output: Output.object({ schema: RegenSchema }),
        prompt,
      });
      parsed = output as z.infer<typeof RegenSchema>;
    } catch (error) {
      if (NoObjectGeneratedError.isInstance(error)) {
        const safe = RegenSchema.safeParse(tryParseFallback((error as { text?: string }).text));
        if (safe.success) parsed = safe.data;
      }
      if (!parsed) {
        throw new Error(error instanceof Error ? error.message : "ai_generation_failed");
      }
    }

    const { data: updated, error: uErr } = await context.supabase
      .from("monthly_plan_topics" as never)
      .update({
        topic_title: parsed.topic_title.slice(0, 240),
        angle: parsed.angle.slice(0, 1000),
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
      } as never)
      .eq("id", plan.id);
    if (upErr) throw upErr;

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
    const { data: planRow, error: planErr } = await context.supabase
      .from("monthly_plans" as never)
      .select("id, brand_id, status")
      .eq("id", data.planId)
      .maybeSingle();
    if (planErr) throw planErr;
    if (!planRow) throw new Error("plan_not_found");
    const planStatus = (planRow as unknown as { status: MonthlyPlanStatus }).status;
    if (planStatus !== "client_approved") throw new Error("client_approval_required");

    const { data: topics, error: topErr } = await context.supabase
      .from("monthly_plan_topics" as never)
      .select("*")
      .eq("monthly_plan_id", data.planId)
      .eq("status", "approved")
      .order("position", { ascending: true });
    if (topErr) throw topErr;
    const list = (topics ?? []) as unknown as MonthlyPlanTopic[];
    if (list.length === 0) return { created: 0 };
    if (list.some((t) => !isTopicComplete(t))) throw new Error("topics_incomplete");

    // Pipeline + stage inicial
    let { data: pipes } = await context.supabase
      .from("content_pipelines")
      .select("id")
      .eq("brand_id", data.brandId)
      .eq("client_id", data.clientId)
      .order("position", { ascending: true })
      .limit(1);
    let pipelineId = pipes?.[0]?.id as string | undefined;
    if (!pipelineId) {
      const { data: newPipe, error: pErr } = await context.supabase
        .from("content_pipelines")
        .insert({
          brand_id: data.brandId,
          client_id: data.clientId,
          name: "Pipeline principal",
          slug: "main",
          is_default: true,
          position: 0,
          created_by: context.userId,
        })
        .select("id")
        .single();
      if (pErr) throw pErr;
      pipelineId = newPipe.id as string;
      await context.supabase.from("content_pipeline_stages").insert([
        { pipeline_id: pipelineId, key: "briefing", label: "Ideia", color: "muted", position: 0, is_terminal: false },
        { pipeline_id: pipelineId, key: "writing", label: "Produção", color: "indigo", position: 1024, is_terminal: false },
        { pipeline_id: pipelineId, key: "review", label: "Revisão", color: "amber", position: 2048, is_terminal: false },
        { pipeline_id: pipelineId, key: "approved", label: "Aprovado", color: "emerald", position: 3072, is_terminal: false },
      ] as never);
    }

    const { data: stages } = await context.supabase
      .from("content_pipeline_stages")
      .select("id, position, is_terminal")
      .eq("pipeline_id", pipelineId)
      .order("position", { ascending: true });
    const stage = (stages ?? []).find((s) => !s.is_terminal) ?? stages?.[0];
    if (!stage) throw new Error("no_stage_available");
    const stageId = stage.id as string;

    const { data: maxPost } = await context.supabase
      .from("posts")
      .select("position")
      .eq("stage_id", stageId)
      .order("position", { ascending: false })
      .limit(1);
    let nextPos = (((maxPost?.[0]?.position ?? -1) as number) + 1024) as number;

    const rows = list.map((t) => {
      const pos = nextPos;
      nextPos += 1024;
      return {
        brand_id: data.brandId,
        client_id: data.clientId,
        pipeline_id: pipelineId,
        stage_id: stageId,
        stage: "idea",
        title: t.topic_title,
        format: t.content_format,
        internal_briefing: t.angle,
        monthly_plan_topic_id: t.id,
        position: pos,
        created_by: context.userId,
        assignee_id: context.userId,
        assignees: [context.userId],
      };
    });
    const { error: insErr } = await context.supabase.from("posts").insert(rows as never);
    if (insErr) throw insErr;

    // Marca a pauta como approved e os tópicos como approved (que não estavam rejeitados)
    await Promise.all([
      context.supabase
        .from("monthly_plans" as never)
        .update({ status: "approved" } as never)
        .eq("id", data.planId),
      context.supabase
        .from("monthly_plan_topics" as never)
        .update({ status: "approved" } as never)
        .eq("monthly_plan_id", data.planId)
        .neq("status", "rejected"),
    ]);

    return { created: rows.length };
  });