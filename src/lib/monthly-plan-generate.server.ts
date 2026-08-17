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
import {
  logPlanEvent,
  setPlanJobCheckpoint,
  setPlanJobStep,
} from "@/lib/monthly-plan-observability.server";
import { findResumableGeneration } from "@/lib/monthly-plan-resume.server";
import type { FailureKind } from "@/lib/ai-failures.server";
import type {
  GenerateFailureCode,
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
        // Formato canônico obrigatório — sem vocabulário legado na escrita.
        content_format: z.enum(["feed", "stories", "reels", "carrossel"]),
        angle: z.string(),
        // Nullable (sem `.optional()`): provedores com JSON Schema estrito
        // (Groq/OpenAI) rejeitam o `not` que o `.optional()` gera.
        channel: z.string().nullable(),
        target_audience: z.string().nullable(),
        rationale: z.string().nullable(),
      }),
    )
    .min(1)
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

/** Traduz a classificação de falha da IA no código devolvido à UI. */
function codeForFailure(kind: FailureKind): GenerateFailureCode {
  switch (kind) {
    case "provider_quota":
      return "ai_provider_quota";
    case "provider_rate_limit":
      return "ai_provider_rate_limit";
    case "provider_unavailable":
      return "ai_provider_unavailable";
    case "invalid_output":
      return "ai_invalid_output";
    case "config":
      return "ai_provider_not_configured";
    default:
      return "ai_generation_failed";
  }
}

export async function runPlanGeneration(args: {
  supabase: SupabaseClient;
  userId: string;
  input: GeneratePlanInput;
  period: string;
  /** Job da trava — usado para progresso, etapa e checkpoint de retomada. */
  jobId?: string | null;
}): Promise<GenerateMonthlyPlanResult> {
  const { supabase, userId, input, period } = args;
  const jobId = args.jobId ?? null;
  const scope = { brandId: input.brandId, clientId: input.clientId, userId };

  await setPlanJobStep(supabase, jobId, "contexto");
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

  await setPlanJobStep(supabase, jobId, "volumetria");
  const quota = channelTotals(formatQuota);
  const activeChannels = PLAN_CHANNELS.filter((c) => (quota[c] ?? 0) > 0);
  const totalTarget = totalSlots(formatQuota);
  if (totalTarget <= 0) throw new Error("volumetry_required");

  // ---- Retomada idempotente -------------------------------------------------
  // Execução anterior que morreu depois de criar a pauta: reaproveita o
  // rascunho e gera SOMENTE as vagas que faltam.
  const resume = await findResumableGeneration(supabase, {
    brandId: input.brandId,
    clientId: input.clientId,
    period,
  });
  let existingTopics: MonthlyPlanTopic[] = [];
  if (resume) {
    const { data: rows } = await supabase
      .from("monthly_plan_topics" as never)
      .select("*")
      .eq("monthly_plan_id", resume.planId);
    existingTopics = (rows ?? []) as unknown as MonthlyPlanTopic[];
    await logPlanEvent(
      supabase,
      { ...scope, planId: resume.planId },
      {
        step: "retomada",
        ok: true,
        detail: { topics_saved: resume.topicsSaved, total_target: totalTarget },
      },
    );
    // Geração já concluída: devolve o que existe, sem gastar tokens de novo.
    if (resume.topicsSaved >= totalTarget) {
      const { data: planRow } = await supabase
        .from("monthly_plans" as never)
        .select("*")
        .eq("id", resume.planId)
        .maybeSingle();
      if (planRow) {
        await setPlanJobCheckpoint(supabase, jobId, {
          monthly_plan_id: resume.planId,
          topics_saved: resume.topicsSaved,
          period,
        });
        return {
          ok: true,
          resumed: true,
          data: {
            plan: planRow as unknown as MonthlyPlan,
            topics: existingTopics.sort((a, b) => a.position - b.position),
          },
        };
      }
    }
    // Desconta as vagas já preenchidas das cotas restantes.
    for (const t of existingTopics) {
      const ch = (t.channel ?? "").toString();
      const f = normalizeContentFormat(t.content_format);
      const bucket = formatQuota[ch];
      if (!f || !bucket || !(bucket[f] ?? 0)) continue;
      bucket[f] = (bucket[f] ?? 0) - 1;
      if ((bucket[f] ?? 0) <= 0) delete bucket[f];
    }
  }
  const remainingTarget = totalSlots(formatQuota);

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
    // Tópicos da pauta retomada já entram em `generated`: não contam duas vezes.
    const alreadyMine = resume?.channelCounts[c] ?? 0;
    const allowance =
      (briefingCtx.monthlyQuota[c] ?? 0) +
      (approvedOverage[c] ?? 0) -
      Math.max(0, (generated[c] ?? 0) - alreadyMine);
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
  await setPlanJobStep(supabase, jobId, "estrategia");
  const [strategy, performance] = await Promise.all([
    loadStrategyContext(supabase, input.brandId, input.clientId).catch(async (err) => {
      console.warn("[monthly-plan] strategy context failed", err);
      await logPlanEvent(supabase, scope, {
        step: "estrategia",
        ok: false,
        retryable: true,
        message: `strategy_context_failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      return null;
    }),
    loadPerformanceContext(supabase, {
      brandId: input.brandId,
      clientId: input.clientId,
      channels: activeChannels,
      cacheScopeToken: userId,
    }).catch(async (err) => {
      console.warn("[monthly-plan] performance context failed", err);
      await logPlanEvent(supabase, scope, {
        step: "estrategia",
        ok: false,
        retryable: true,
        message: `performance_context_failed: ${err instanceof Error ? err.message : String(err)}`,
      });
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

  // Aprendizado consolidado (padrões minerados), com orçamento próprio.
  const brainLearnings = await loadBrainAgentContext(supabase, {
    brandId: input.brandId,
    clientId: input.clientId,
    agent: "pauta",
  });

  await setPlanJobStep(supabase, jobId, "prompt");
  const audienceOptions = [
    ...(strategy?.personaNames ?? []),
    ...(strategy?.cohortNames ?? []),
  ].filter(Boolean);

  const extraContext = [
    strategy?.markdown,
    performance?.markdown,
    brainLearnings.markdown,
    brainMarkdown
      ? `## Contexto do Brain (memórias, insights e métricas desta marca)\n${brainMarkdown}\n\nUse esse contexto para evitar repetir erros passados e reforçar o que já funcionou.`
      : "",
    `## Briefing consolidado do cliente (contexto obrigatório)\n${briefingCtx.text.slice(0, 12000)}`,
  ]
    .filter((s): s is string => !!s && s.trim().length > 0)
    .join("\n\n");

  /**
   * Monta o prompt para um conjunto de vagas restantes. Usado tanto na primeira
   * chamada quanto no complemento das vagas que a IA não preencheu.
   */
  const buildPrompt = (pending: ChannelFormatQuota, count: number, avoid: string[]) => {
    const pendingTotals = channelTotals(pending);
    const distributionText = describeDistribution(
      Object.keys(pending).map((c) => ({
        channel: c,
        formats: pending[c] ?? {},
        total: pendingTotals[c] ?? 0,
      })),
    );
    return [
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
      `- topics: EXATAMENTE ${count} ideias de posts, distribuídas por CANAL e FORMATO conforme a volumetria contratada (não altere as quantidades):\n${distributionText}\n  Cada ideia deve ter:`,
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
      avoid.length
        ? `- NÃO repita nem reescreva estas ideias já existentes nesta pauta: ${avoid.slice(0, 40).join(" | ")}`
        : "",
      `- Sem markdown, sem prefixos numéricos.`,
      `- Retorne EXATAMENTE um objeto JSON no schema.`,
    ]
      .filter(Boolean)
      .join("\n");
  };

  type AiPlan = z.infer<typeof AiPlanSchema>;

  /** Chamada única ao agente, com observabilidade por tentativa. */
  const callAgent = async (prompt: string) =>
    runPlanAgent({
      agent: "pauta.suggest",
      supabase: supabase,
      brandId: input.brandId,
      clientId: input.clientId,
      userId: userId,
      prompt,
      extraContext,
      schema: AiPlanSchema,
      onAttempt: (info) =>
        logPlanEvent(
          supabase,
          { ...scope, planId: resume?.planId ?? null },
          {
            step: "ia",
            ok: info.ok,
            ...(info.attempt != null ? { attempt: info.attempt } : {}),
            ...(info.kind ? { kind: info.kind } : {}),
            ...(info.retryable != null ? { retryable: info.retryable } : {}),
            ...(info.message ? { message: info.message } : {}),
          },
        ),
    });

  await setPlanJobStep(supabase, jobId, "ia");
  let agentResult: Awaited<ReturnType<typeof callAgent>>;
  try {
    agentResult = await callAgent(
      buildPrompt(formatQuota, remainingTarget, resume?.existingTitles ?? []),
    );
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
    const kind = (error as { failureKind?: FailureKind }).failureKind;
    if (kind) {
      return {
        ok: false,
        code: codeForFailure(kind),
        retryable: kind !== "config",
      };
    }
    throw error;
  }
  const { output, modelId } = agentResult;
  const parsed = output as AiPlan;

  await setPlanJobStep(supabase, jobId, "normalizacao");
  // Aloca canal + formato por vaga real da volumetria (determinístico).
  const allocator = createSlotAllocator(formatQuota);
  const allocated: Array<{
    topic_title: string;
    content_format: ContentFormat;
    angle: string;
    channel: string;
    target_audience: string | null;
    rationale: string | null;
  }> = [];

  const consume = (topics: AiPlan["topics"]) => {
    for (const t of topics) {
      if (allocator.left() <= 0) break;
      const wanted = normalizeContentFormat(t.content_format);
      const { channel, format } = allocator.allocate(t.channel, t.content_format);
      if (!wanted || wanted !== format) {
        // Correção determinística registrada — a vaga contratada sempre vence.
        void logPlanEvent(supabase, scope, {
          step: "normalizacao",
          ok: false,
          kind: "invalid_output",
          retryable: false,
          message: `formato_corrigido: "${String(t.content_format)}" → "${format}" (${channel})`,
        });
      }
      allocated.push({
        topic_title: t.topic_title.slice(0, 240),
        content_format: format,
        angle: t.angle.slice(0, 1000),
        channel,
        target_audience: (t.target_audience ?? "").toString().trim().slice(0, 240) || null,
        rationale: (t.rationale ?? "").toString().trim().slice(0, 600) || null,
      });
    }
  };
  consume(parsed.topics);

  // Insuficiência: a IA devolveu menos ideias que as vagas contratadas.
  // Faz UMA rodada de complemento apenas para as vagas que sobraram.
  if (allocator.left() > 0) {
    const missing = allocator.left();
    await logPlanEvent(supabase, scope, {
      step: "ia",
      ok: false,
      kind: "invalid_output",
      retryable: true,
      message: `insuficiencia: faltaram ${missing} de ${remainingTarget} vagas`,
    });
    try {
      const fill = await callAgent(
        buildPrompt({ ...allocator.remaining }, missing, [
          ...(resume?.existingTitles ?? []),
          ...allocated.map((a) => a.topic_title),
        ]),
      );
      consume((fill.output as AiPlan).topics);
    } catch (err) {
      console.warn("[monthly-plan] complemento falhou", err);
    }
  }

  if (allocator.left() > 0) {
    // Nada incompleto é persistido: a geração fica retomável.
    await logPlanEvent(supabase, scope, {
      step: "conclusao",
      ok: false,
      kind: "invalid_output",
      retryable: true,
      message: `incomplete_generation: ${allocator.left()} vagas sem ideia`,
    });
    return { ok: false, code: "incomplete_generation", retryable: true };
  }

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
    resumed: !!resume,
  };

  await setPlanJobStep(supabase, jobId, "persistencia");
  let plan: MonthlyPlan;
  if (resume) {
    const { data: planRow, error: upErr } = await supabase
      .from("monthly_plans" as never)
      .update({ context_sources: contextSources } as never)
      .eq("id", resume.planId)
      .select("*")
      .single();
    if (upErr) throw upErr;
    plan = planRow as unknown as MonthlyPlan;
  } else {
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
    plan = planRow as unknown as MonthlyPlan;
  }

  // Checkpoint antes de inserir: se cair aqui, a próxima execução retoma.
  await setPlanJobCheckpoint(supabase, jobId, {
    monthly_plan_id: plan.id,
    topics_saved: existingTopics.length,
    period,
  });

  const basePosition = (resume?.maxPosition ?? -1) + 1;
  const topicRows = allocated.map((t, i) => ({
    monthly_plan_id: plan.id,
    ...t,
    status: "pending" as const,
    position: basePosition + i * 1024,
  }));
  const { data: inserted, error: topErr } = await supabase
    .from("monthly_plan_topics" as never)
    .insert(topicRows as never)
    .select("*");
  if (topErr) throw topErr;

  const topics = [...existingTopics, ...((inserted ?? []) as unknown as MonthlyPlanTopic[])].sort(
    (a, b) => a.position - b.position,
  );

  await setPlanJobCheckpoint(supabase, jobId, {
    monthly_plan_id: plan.id,
    topics_saved: topics.length,
    period,
  });
  await logPlanEvent(
    supabase,
    { ...scope, planId: plan.id },
    {
      step: "conclusao",
      ok: true,
      detail: { topics: topics.length, model: modelId, resumed: !!resume },
    },
  );

  return { ok: true, ...(resume ? { resumed: true } : {}), data: { plan, topics } };
}

