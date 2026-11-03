import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PostNavLinks = {
  task: { projectId: string; jobId: string | null; title: string } | null;
  plan: { planId: string } | null;
};

/**
 * Atalhos da peça: a tarefa ligada a ela (tasks.post_id) e a pauta de onde veio.
 * Lê como o próprio usuário (RLS): sem acesso, o atalho simplesmente não aparece.
 */
export const getPostNavLinksFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ postId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<PostNavLinks> => {
    const sb = context.supabase;
    const [{ data: post }, { data: tasks }] = await Promise.all([
      sb.from("posts").select("monthly_plan_topic_id").eq("id", data.postId).maybeSingle(),
      sb
        .from("tasks")
        .select("project_id, job_id, title")
        .eq("post_id", data.postId)
        .is("archived_at", null)
        .not("project_id", "is", null)
        .order("created_at", { ascending: true })
        .limit(1),
    ]);
    const t = (tasks ?? [])[0] as { project_id: string; job_id: string | null; title: string } | undefined;
    let plan: PostNavLinks["plan"] = null;
    const topicId = (post as { monthly_plan_topic_id: string | null } | null)?.monthly_plan_topic_id;
    if (topicId) {
      const { data: topic } = await sb
        .from("monthly_plan_topics" as never)
        .select("monthly_plan_id")
        .eq("id", topicId)
        .maybeSingle();
      const planId = (topic as { monthly_plan_id: string } | null)?.monthly_plan_id;
      if (planId) plan = { planId };
    }
    return {
      task: t ? { projectId: t.project_id, jobId: t.job_id, title: t.title } : null,
      plan,
    };
  });
