import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Materializa os itens aprovados de uma pauta em cards do Kanban de conteúdo.
 * Usado tanto pelo fluxo interno (botão "Enviar para produção") quanto pela
 * aprovação pública do cliente (automática). É idempotente: tópicos que já
 * possuem post não geram card novo.
 */

export type PlanTopicForKanban = {
  id: string;
  topic_title: string;
  content_format: string | null;
  channel: string | null;
  angle: string | null;
  target_audience?: string | null;
  rationale?: string | null;
  position: number;
};

export function isKanbanReady(t: Pick<PlanTopicForKanban, "channel" | "content_format">): boolean {
  return !!(t.channel && t.channel.trim() && t.content_format && t.content_format.trim());
}

export async function ensureDefaultPipeline(
  sb: SupabaseClient,
  brandId: string,
  clientId: string,
  userId: string | null,
): Promise<string> {
  const { data: pipes } = await sb
    .from("content_pipelines")
    .select("id")
    .eq("brand_id", brandId)
    .eq("client_id", clientId)
    .order("position", { ascending: true })
    .limit(1);
  const existing = (pipes ?? [])[0] as { id: string } | undefined;
  if (existing) return existing.id;

  const { data: newPipe, error } = await sb
    .from("content_pipelines")
    .insert({
      brand_id: brandId,
      client_id: clientId,
      name: "Pipeline principal",
      slug: "main",
      is_default: true,
      position: 0,
      created_by: userId,
    } as never)
    .select("id")
    .single();
  if (error) throw error;
  const pipelineId = (newPipe as unknown as { id: string }).id;

  await sb.from("content_pipeline_stages").insert([
    { pipeline_id: pipelineId, key: "briefing", label: "Ideia", color: "muted", position: 0, is_terminal: false },
    { pipeline_id: pipelineId, key: "writing", label: "Produção", color: "indigo", position: 1024, is_terminal: false },
    { pipeline_id: pipelineId, key: "review", label: "Revisão", color: "amber", position: 2048, is_terminal: false },
    { pipeline_id: pipelineId, key: "approved", label: "Aprovado", color: "emerald", position: 3072, is_terminal: false },
  ] as never);

  return pipelineId;
}

export async function materializePlanToKanban(
  sb: SupabaseClient,
  args: {
    planId: string;
    brandId: string;
    clientId: string;
    userId: string | null;
    /** Se informado, só estes tópicos são considerados. */
    topics?: PlanTopicForKanban[];
    /** Marca a pauta como "Em produção" ao final (default: true). */
    markPlanApproved?: boolean;
  },

): Promise<{ created: number; skipped: number }> {
  let list = args.topics ?? null;
  if (!list) {
    const { data, error } = await sb
      .from("monthly_plan_topics")
      .select(
        "id, topic_title, content_format, channel, angle, target_audience, rationale, position",
      )
      .eq("monthly_plan_id", args.planId)
      .eq("status", "approved")
      .not("client_status", "in", '("rejected","changes")')
      .order("position", { ascending: true });
    if (error) throw error;
    list = (data ?? []) as unknown as PlanTopicForKanban[];
  }
  if (list.length === 0) return { created: 0, skipped: 0 };
  if (list.some((t) => !isKanbanReady(t))) throw new Error("topics_incomplete");

  // Idempotência: ignora tópicos que já viraram card.
  const { data: existingPosts } = await sb
    .from("posts")
    .select("monthly_plan_topic_id")
    .in(
      "monthly_plan_topic_id",
      list.map((t) => t.id),
    );
  const already = new Set(
    ((existingPosts ?? []) as unknown as { monthly_plan_topic_id: string | null }[])
      .map((p) => p.monthly_plan_topic_id)
      .filter(Boolean) as string[],
  );
  const pending = list.filter((t) => !already.has(t.id));
  if (pending.length === 0) return { created: 0, skipped: list.length };

  const pipelineId = await ensureDefaultPipeline(sb, args.brandId, args.clientId, args.userId);

  // Garante o projeto da pauta e vincula as peças a ele (projeto = execução da pauta).
  let projectId: string | null = null;
  try {
    const { ensurePlanProject } = await import("@/lib/monthly-plan-project.server");
    const { data: planRow } = await sb
      .from("monthly_plans")
      .select("title")
      .eq("id", args.planId)
      .maybeSingle();
    const res = await ensurePlanProject(sb, {
      planId: args.planId,
      brandId: args.brandId,
      clientId: args.clientId,
      title: (planRow as unknown as { title: string | null } | null)?.title ?? null,
      userId: args.userId,
    });
    projectId = res.projectId;
  } catch {
    projectId = null;
  }

  const { data: stages } = await sb
    .from("content_pipeline_stages")
    .select("id, position, is_terminal")
    .eq("pipeline_id", pipelineId)
    .order("position", { ascending: true });
  const stageList = (stages ?? []) as unknown as {
    id: string;
    position: number;
    is_terminal: boolean;
  }[];
  const stage = stageList.find((s) => !s.is_terminal) ?? stageList[0];
  if (!stage) throw new Error("no_stage_available");

  const { data: maxPost } = await sb
    .from("posts")
    .select("position")
    .eq("stage_id", stage.id)
    .order("position", { ascending: false })
    .limit(1);
  let nextPos = (((maxPost ?? [])[0] as { position: number } | undefined)?.position ?? -1) + 1024;

  const rows = pending.map((t) => {
    const pos = nextPos;
    nextPos += 1024;
    return {
      brand_id: args.brandId,
      client_id: args.clientId,
      project_id: projectId,
      pipeline_id: pipelineId,
      stage_id: stage.id,
      stage: "idea",
      title: t.topic_title,
      format: t.content_format,
      internal_briefing: [
        t.angle,
        t.target_audience ? `Público-alvo: ${t.target_audience}` : "",
        t.rationale ? `Por quê: ${t.rationale}` : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
      monthly_plan_topic_id: t.id,
      position: pos,
      created_by: args.userId,
      assignee_id: args.userId,
      assignees: args.userId ? [args.userId] : [],
    };
  });

  const { error: insErr } = await sb.from("posts").insert(rows as never);
  if (insErr) throw insErr;

  if (args.markPlanApproved !== false) {
    await sb
      .from("monthly_plans")
      .update({ status: "approved" } as never)
      .eq("id", args.planId);
  }


  return { created: rows.length, skipped: list.length - rows.length };
}
