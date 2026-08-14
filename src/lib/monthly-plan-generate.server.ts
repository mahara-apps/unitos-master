import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { brain, type BrainContext } from "@/lib/brain/api";
import { loadBriefingContext } from "@/lib/monthly-plan-context.server";
import { loadStrategyContext } from "@/lib/monthly-plan-strategy.server";
import { loadPerformanceContext } from "@/lib/monthly-plan-performance.server";
import { runPlanAgent } from "@/lib/monthly-plan-agent.server";
import { PLAN_CHANNELS, type PlanChannel } from "@/lib/monthly-plan-fields";
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
import { loadApprovedOverage } from "@/lib/plan-overage.server";
import { countGeneratedThisMonth } from "@/lib/monthly-plan-generated-count.server";
import type {
  GenerateMonthlyPlanResult,
  MonthlyPlan,
  MonthlyPlanTopic,
} from "@/lib/monthly-plans.functions";

/**
 * Núcleo ÚNICO de geração de pauta (canal + formato + quantidade).
 * Extraído de `monthly-plans.functions.ts` para permitir a trava contra
 * execução duplicada sem duplicar lógica de geração.
 */

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

export type GeneratePlanInput = {
  brandId: string;
  clientId: string;
  theme?: string;
  briefingId?: string | null;
  weeksPerMonth?: number;
  selection?: Array<{
    channel: PlanChannel;
    quantity: number;
    formats: string[];
    formatQuotas?: Record<string, number>;
  }>;
};

export async function runPlanGeneration(args: {
  supabase: SupabaseClient;
  userId: string;
  input: GeneratePlanInput;
  period: string;
}): Promise<GenerateMonthlyPlanResult> {
  const { supabase, userId, input, period } = args;
  const [{ data: brand }, briefingCtx] = await Promise.all([
    supabase.from("brands").select("name").eq("id", input.brandId).maybeSingle(),
    loadBriefingContext(supabase, input.clientId, {
      briefingId: input.briefingId ?? null,
      weeksPerMonth: input.weeksPerMonth,
    }),
  ]);

  // Volumetria é obrigatória — sem ela não há como definir quantas peças gerar.
  if (briefingCtx.totalTarget <= 0) throw new Error("volumetry_required");

  // Cotas efetivas por canal + FORMATO.
  // Seleção do wizard quando houver; senão a volumetria do briefing.
  const formatQuota: ChannelFormatQuota = {};
  if (input.selection?.length) {
    for (const s of input.selection) {
      const allowed = formatsForChannel(s.channel);
      const bucket: Partial<Record<ContentFormat, number>> = {};
      for (const [rawF, qty] of Object.entries(s.formatQuotas ?? {})) {
        const f = normalizeContentFormat(rawF);
        if (!f || !allowed.includes(f)) continue;
        const n = Math.max(0, Math.round(Number(qty) || 0));
        if (n > 0) bucket[f] = (bucket[f] ?? 0) + n;
      }
      // Sem cota por formato: cai na cota por formato do briefing (ou total).
      if (!Object.keys(bucket).length) {
        const fromBriefing = briefingCtx.formatQuota[s.channel] ?? {};
        const briefingSum = CONTENT_FORMATS.reduce((t, f) => t + (fromBriefing[f] ?? 0), 0);
        if (briefingSum > 0) {
          // Reescala proporcionalmente para a quantidade escolhida no wizard.
          let left = s.quantity;
          const entries = CONTENT_FORMATS.filter((f) => (fromBriefing[f] ?? 0) > 0);
          entries.forEach((f, idx) => {
            const share =
              idx === entries.length - 1
                ? left
                : Math.min(left, Math.round((fromBriefing[f]! / briefingSum) * s.quantity));
            if (share > 0) bucket[f] = share;
            left -= share;
          });
        } else {
          bucket[allowed[0] ?? "feed"] = s.quantity;
        }
      }
      const existing = formatQuota[s.channel] ?? {};
      for (const f of CONTENT_FORMATS) {
        if (bucket[f]) existing[f] = (existing[f] ?? 0) + bucket[f]!;
      }
      formatQuota[s.channel] = existing;
    }
  } else {
    for (const c of PLAN_CHANNELS) {
      const bucket = briefingCtx.formatQuota[c] ?? {};
      if (CONTENT_FORMATS.some((f) => (bucket[f] ?? 0) > 0)) formatQuota[c] = { ...bucket };
    }
  }

  const quota = channelTotals(formatQuota);
  const activeChannels = PLAN_CHANNELS.filter((c) => (quota[c] ?? 0) > 0);
  const totalTarget = totalSlots(formatQuota);
  if (totalTarget <= 0) throw new Error("volumetry_required");

  // Respeita a volumetria do briefing: excedentes exigem autorização do gestor.
  const approvedOverage = await loadApprovedOverage(supabase, {
    brandId: input.brandId,
    clientId: input.clientId,
    periodMonth: period,
  });
  const generated = await countGeneratedThisMonth(supabase, input.clientId, period);
  const overageItems: Array<{
    channel: PlanChannel;
    quota: number;
    requested: number;
    overage: number;
  }> = [];
  for (const c of activeChannels) {
    const allowance =
      (briefingCtx.monthlyQuota[c] ?? 0) + (approvedOverage[c] ?? 0) - (generated[c] ?? 0);
    const requested = quota[c] ?? 0;
    if (requested > Math.max(0, allowance)) {
      overageItems.push({
        channel: c,
        quota: Math.max(0, allowance),
        requested,
        overage: requested - Math.max(0, allowance),
      });
    }
  }
  if (overageItems.length) {
    return { ok: false, code: "overage_not_authorized", overage: overageItems };
  }

  // Estratégia IA ativa + desempenho real das contas conectadas (por canal).
  const [strategy, performance] = await Promise.all([
    loadStrategyContext(supabase, input.brandId, input.clientId).catch((err) => {
      console.warn("[monthly-plan] strategy context failed", err);
      return null;
    }),
    loadPerformanceContext(supabase, {
      brandId: input.brandId,
      clientId: input.clientId,
      channels: activeChannels,
      cacheScopeToken: userId,
    }).catch((err) => {
      console.warn("[monthly-plan] performance context failed", err);
      return null;
    }),
  ]);

  // Brain: enrich prompt with consolidated knowledge for this brand/client.
  let brainMarkdown = "";
  try {
    const brainCtx: BrainContext = {
      supabase: supabase,
      userId: userId,
      brandId: input.brandId,
      clientId: input.clientId,
      module: "monthly-plan",
    };
    const pack = await brain.getContext(brainCtx, {
      topic: `planejamento mensal ${input.theme ?? ""}`.trim(),
      nicheHint: briefingCtx.niche,
    });
    brainMarkdown = pack.markdown ?? "";
  } catch (err) {
    console.warn("[monthly-plan] brain.getContext failed:", err);
  }

  // Distribuição canal → formato → quantidade (cotas exatas para a IA).
  const distributionText = describeDistribution(
    activeChannels.map((c) => ({
      channel: c,
      formats: formatQuota[c] ?? {},
      total: quota[c] ?? 0,
    })),
  );

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
    input.theme
      ? `Tema do mês (input do usuário): ${input.theme}`
      : `Sem tema definido pelo usuário — derive o tema estratégico do mês do briefing e da estratégia ativa.`,
    ``,
    `Regras:`,
    `- title: uma headline curta (máx 90 chars) que resume a estratégia do mês.`,
    `- description: 2-3 frases explicando o contexto do mês.`,
    `- objectives: 2-4 objetivos claros, separados por quebras de linha.`,
    `- topics: EXATAMENTE ${totalTarget} ideias de posts, distribuídas por CANAL e FORMATO conforme a volumetria contratada (não altere as quantidades):\n${distributionText}\n  Cada ideia deve ter:`,
    `  * topic_title: título curto e criativo do post`,
    `  * content_format: OBRIGATÓRIO — um de ${CONTENT_FORMATS.map((f) => `"${f}"`).join(", ")} (equivalências: ${CONTENT_FORMATS.map((f) => `${f} = ${CONTENT_FORMAT_LABEL[f]}`).join("; ")})`,
    `  * channel: OBRIGATÓRIO — um de ${PLAN_CHANNELS.map((c) => `"${c}"`).join(", ")} (respeitar cotas acima)`,
    `  * angle: gancho estratégico / direcionamento para produção (1-2 frases)`,
    audienceOptions.length
      ? `  * target_audience: OBRIGATÓRIO — persona ou cohort da estratégia ativa (${audienceOptions.slice(0, 8).join(", ")})`
      : `  * target_audience: público-alvo principal da ideia, derivado do briefing`,
    `  * rationale: 1 frase citando a evidência usada (métrica do canal, insight do briefing ou item da estratégia)`,
    `- A quantidade por canal + formato é contratual: cumpra exatamente, sem trocar formatos.`,
    `- Dentro de cada cota, priorize os temas que performaram melhor no canal.`,
    `- Sem markdown, sem prefixos numéricos.`,
    `- Retorne EXATAMENTE um objeto JSON no schema.`,
  ]
    .filter(Boolean)
    .join("\n");

  let agentResult: Awaited<ReturnType<typeof runPlanAgent>>;
  try {
    agentResult = await runPlanAgent({
      agent: "pauta.suggest",
      supabase: supabase,
      brandId: input.brandId,
      clientId: input.clientId,
      userId: userId,
      prompt,
      extraContext,
      schema: AiPlanSchema,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (message.includes("ai_provider_not_configured")) {
      return { ok: false, code: "ai_provider_not_configured" };
    }
    if (message.includes("ai_provider_key_missing")) {
      return { ok: false, code: "ai_provider_key_missing" };
    }
    if (message.includes("ai_model_unavailable")) {
      return { ok: false, code: "ai_model_unavailable" };
    }
    throw error;
  }
  const { output, modelId } = agentResult;
  const parsed = output as z.infer<typeof AiPlanSchema>;

  const contextSources = {
    model: modelId,
    briefing_id: input.briefingId ?? null,
    strategy_blocks: strategy?.blocks ?? [],
    strategy_generated_at: strategy?.generatedAt ?? null,
    metrics_channels: performance?.channelsWithMetrics ?? [],
    channels_without_account: performance?.channelsWithoutAccount ?? [],
    brain_context: !!brainMarkdown,
    agent: "pauta.suggest",
    generated_at: new Date().toISOString(),
  };

  const { data: planRow, error: planErr } = await supabase
    .from("monthly_plans" as never)
    .insert({
      brand_id: input.brandId,
      client_id: input.clientId,
      input_theme: input.theme || null,
      input_briefing_id: input.briefingId ?? null,
      title: parsed.title.slice(0, 200),
      description: parsed.description.slice(0, 4000),
      objectives: parsed.objectives.slice(0, 4000),
      status: "draft",
      created_by: userId,
      context_sources: contextSources,
    } as never)
    .select("*")
    .single();
  if (planErr) throw planErr;
  const plan = planRow as unknown as MonthlyPlan;

  // Aloca canal + formato por vaga real da volumetria (determinístico).
  const allocator = createSlotAllocator(formatQuota);
  const topicRows = parsed.topics.slice(0, totalTarget).map((t, i) => {
    const { channel, format } = allocator.allocate(t.channel, t.content_format);
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
  const { data: inserted, error: topErr } = await supabase
    .from("monthly_plan_topics" as never)
    .insert(topicRows as never)
    .select("*");
  if (topErr) throw topErr;

  return {
    ok: true,
    data: {
      plan,
      topics: (inserted as unknown as MonthlyPlanTopic[]).sort(
        (a, b) => a.position - b.position,
      ),
    },
  };
}
