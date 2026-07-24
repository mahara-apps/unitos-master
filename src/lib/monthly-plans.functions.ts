import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText, NoObjectGeneratedError, Output } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getBrandAiModel } from "@/lib/ai-provider.server";

/* ---------- Types ---------- */

export type MonthlyPlanStatus = "draft" | "approved" | "archived";
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
  position: number;
};

export type MonthlyPlanWithTopics = {
  plan: MonthlyPlan;
  topics: MonthlyPlanTopic[];
};

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
}).refine((v) => (v.theme && v.theme.length >= 3) || !!v.briefingId, {
  message: "Informe um tema ou vincule um briefing.",
  path: ["theme"],
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
    const [{ data: brand }, { data: client }, { data: briefing }] = await Promise.all([
      context.supabase.from("brands").select("name").eq("id", data.brandId).maybeSingle(),
      context.supabase
        .from("clients")
        .select("name, niche, tone_of_voice, brand_hub")
        .eq("id", data.clientId)
        .maybeSingle(),
      data.briefingId
        ? context.supabase
            .from("brand_briefings")
            .select("data")
            .eq("id", data.briefingId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const briefingText = (() => {
      const raw = (briefing as { data?: unknown } | null)?.data;
      if (!raw) return "";
      try {
        return typeof raw === "string" ? raw : JSON.stringify(raw);
      } catch {
        return "";
      }
    })();

    // Volumetria semanal por canal (posts/semana) → cotas mensais (×4.3 semanas)
    const CHANNELS = ["instagram", "tiktok", "linkedin", "youtube", "facebook"] as const;
    type Channel = (typeof CHANNELS)[number];
    const hub = (client?.brand_hub ?? {}) as { volumetry?: Partial<Record<Channel, number>> };
    const weekly = hub.volumetry ?? {};
    const monthlyQuota: Record<Channel, number> = {
      instagram: Math.round(((weekly.instagram ?? 0) as number) * 4.3),
      tiktok: Math.round(((weekly.tiktok ?? 0) as number) * 4.3),
      linkedin: Math.round(((weekly.linkedin ?? 0) as number) * 4.3),
      youtube: Math.round(((weekly.youtube ?? 0) as number) * 4.3),
      facebook: Math.round(((weekly.facebook ?? 0) as number) * 4.3),
    };
    const totalTarget = CHANNELS.reduce((s, k) => s + monthlyQuota[k], 0);
    const hasVolumetry = totalTarget > 0;
    const distributionText = hasVolumetry
      ? CHANNELS.filter((c) => monthlyQuota[c] > 0)
          .map((c) => `  * ${c}: ${monthlyQuota[c]} posts`)
          .join("\n")
      : "";

    const prompt = [
      `Você é um estrategista de conteúdo sênior.`,
      `Crie uma pauta mensal de conteúdo para redes sociais em português (Brasil).`,
      ``,
      `Marca: ${brand?.name ?? "—"}`,
      `Cliente: ${client?.name ?? "—"}${client?.niche ? ` (${client.niche})` : ""}`,
      client?.tone_of_voice ? `Tom de voz: ${client.tone_of_voice}` : "",
      briefingText ? `Briefing base:\n${briefingText.slice(0, 4000)}` : "",
      ``,
      data.theme
        ? `Tema do mês (input do usuário): ${data.theme}`
        : `Sem tema definido pelo usuário — derive o tema estratégico do mês diretamente do briefing acima, priorizando objetivos de negócio, público-alvo e oportunidades de conteúdo.`,
      ``,
      `Regras:`,
      `- title: uma headline curta (máx 90 chars) que resume a estratégia do mês.`,
      `- description: 2-3 frases explicando o contexto do mês.`,
      `- objectives: 2-4 objetivos claros, separados por quebras de linha.`,
      hasVolumetry
        ? `- topics: EXATAMENTE ${totalTarget} ideias de posts, distribuídas por canal conforme a volumetria mensal do cliente:\n${distributionText}\n  Cada ideia deve ter:`
        : `- topics: entre 8 e 12 ideias de posts, cada uma com:`,
      `  * topic_title: título curto e criativo do post`,
      `  * content_format: um de "Reels", "Carrossel", "Storie", "Post estático", "Vídeo curto"`,
      hasVolumetry
        ? `  * channel: OBRIGATÓRIO — um de "instagram", "tiktok", "linkedin", "youtube", "facebook" (respeitar cotas acima)`
        : `  * channel: opcional`,
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

    const topicRows = parsed.topics.slice(0, Math.max(totalTarget || 16, 16)).map((t, i) => ({
      monthly_plan_id: plan.id,
      topic_title: t.topic_title.slice(0, 240),
      content_format: t.content_format.slice(0, 60),
      angle: t.angle.slice(0, 1000),
      channel: t.channel ? String(t.channel).slice(0, 40) : null,
      status: "pending" as const,
      position: i * 1024,
    }));
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
        content_format: z.string().max(60).optional().default("Post"),
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
        content_format: data.content_format,
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
        angle: z.string().max(1000).nullable().optional(),
        status: z.enum(["pending", "approved", "rejected"]).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {};
    for (const k of ["topic_title", "content_format", "angle", "status"] as const) {
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

/* ---------- Approve → Kanban ---------- */

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
      .select("id, brand_id")
      .eq("id", data.planId)
      .maybeSingle();
    if (planErr) throw planErr;
    if (!planRow) throw new Error("plan_not_found");

    const { data: topics, error: topErr } = await context.supabase
      .from("monthly_plan_topics" as never)
      .select("*")
      .eq("monthly_plan_id", data.planId)
      .neq("status", "rejected")
      .order("position", { ascending: true });
    if (topErr) throw topErr;
    const list = (topics ?? []) as unknown as MonthlyPlanTopic[];
    if (list.length === 0) return { created: 0 };

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