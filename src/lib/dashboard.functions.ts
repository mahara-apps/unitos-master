import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText, NoObjectGeneratedError, Output } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type SupaCtx = { supabase: SupabaseClient<Database>; userId: string };

const BrandInput = z.object({
  brandId: z.string().uuid(),
  clientId: z.string().uuid().nullable().optional(),
});

async function ignore<T>(p: PromiseLike<T>): Promise<T | null> {
  try {
    return await p;
  } catch {
    return null;
  }
}

function sinceIso(days: number) {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}
function untilIso(days: number) {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

export type ActivityEvent = {
  id: string;
  verb: string;
  entity_type: string;
  payload: { title?: string; from?: string; to?: string } | null;
  created_at: string;
  actor_id: string | null;
  client_id: string | null;
};

export type DashboardStats = {
  counts: {
    clients: number;
    projects_active: number;
    tasks_open: number;
    tasks_overdue: number;
    tasks_done_7d: number;
    posts_total: number;
    approvals_pending: number;
    posts_approved_30d: number;
  };
  tasksByStatus: Record<string, number>;
  postsByStage: Record<string, number>;
  myTasks: Array<{
    id: string;
    title: string;
    due_at: string | null;
    priority: string;
    status: string;
    client_id: string | null;
  }>;
  upcomingPosts: Array<{
    id: string;
    title: string;
    scheduled_at: string | null;
    channels: string[];
    client_id: string;
    stage: string;
  }>;
  sparkline: number[];
  recentActivity: ActivityEvent[];
};

async function computeStats(
  ctx: SupaCtx,
  brandId: string,
  clientId?: string | null,
): Promise<DashboardStats> {
  const { supabase, userId } = ctx;
  const scope = <
    Q extends { eq: (col: string, val: string) => Q },
  >(
    q: Q,
  ): Q => (clientId ? q.eq("client_id", clientId) : q);

  const [
    clientsRes,
    projectsRes,
    tasksOpenRes,
    tasksOverdueRes,
    tasksDone7dRes,
    postsRes,
    approvalsRes,
    myTasksRes,
    upcomingPostsRes,
    activityRes,
    tasksStatusRes,
    postsStageRes,
    postsApproved30dRes,
  ] = await Promise.all([
    ignore(
      supabase
        .from("clients")
        .select("id", { count: "exact", head: true })
        .eq("brand_id", brandId)
        .is("archived_at", null),
    ),
    ignore(
      scope(
        supabase
          .from("projects")
          .select("id", { count: "exact", head: true })
          .eq("brand_id", brandId)
          .in("status", ["planning", "in_progress", "active"]),
      ),
    ),
    ignore(
      scope(
        supabase
          .from("tasks")
          .select("id", { count: "exact", head: true })
          .eq("brand_id", brandId)
          .eq("done", false),
      ),
    ),
    ignore(
      scope(
        supabase
          .from("tasks")
          .select("id", { count: "exact", head: true })
          .eq("brand_id", brandId)
          .eq("done", false)
          .lt("due_at", new Date().toISOString()),
      ),
    ),
    ignore(
      scope(
        supabase
          .from("tasks")
          .select("id", { count: "exact", head: true })
          .eq("brand_id", brandId)
          .eq("done", true)
          .gte("done_at", sinceIso(7)),
      ),
    ),
    ignore(
      scope(
        supabase
          .from("posts")
          .select("id", { count: "exact", head: true })
          .eq("brand_id", brandId),
      ),
    ),
    ignore(
      scope(
        supabase
          .from("posts")
          .select("id", { count: "exact", head: true })
          .eq("brand_id", brandId)
          .eq("stage", "review"),
      ),
    ),
    ignore(
      scope(
        supabase
          .from("tasks")
          .select("id,title,due_at,priority,status,client_id")
          .eq("brand_id", brandId)
          .eq("assignee_id", userId)
          .eq("done", false)
          .order("due_at", { ascending: true, nullsFirst: false })
          .limit(8),
      ),
    ),
    ignore(
      scope(
        supabase
          .from("posts")
          .select("id,title,scheduled_at,channels,client_id,stage")
          .eq("brand_id", brandId)
          .in("stage", ["scheduled", "approved"])
          .gte("scheduled_at", new Date().toISOString())
          .lte("scheduled_at", untilIso(7))
          .order("scheduled_at", { ascending: true })
          .limit(8),
      ),
    ),
    ignore(
      supabase
        .from("activity_events")
        .select("id,verb,entity_type,payload,created_at,actor_id,client_id")
        .eq("brand_id", brandId)
        .gte("created_at", sinceIso(14))
        .order("created_at", { ascending: false })
        .limit(200),
    ),
    ignore(
      scope(
        supabase.from("tasks").select("status").eq("brand_id", brandId).eq("done", false),
      ),
    ),
    ignore(scope(supabase.from("posts").select("stage").eq("brand_id", brandId))),
    ignore(
      scope(
        supabase
          .from("posts")
          .select("id", { count: "exact", head: true })
          .eq("brand_id", brandId)
          .eq("stage", "approved")
          .gte("updated_at", sinceIso(30)),
      ),
    ),
  ]);

  const activityAll = (activityRes?.data ?? []) as ActivityEvent[];
  const activity = clientId ? activityAll.filter((a) => a.client_id === clientId) : activityAll;

  const sparkline = Array.from({ length: 14 }, (_, i) => {
    const start = Date.now() - (13 - i) * 86_400_000;
    const end = start + 86_400_000;
    return activity.filter((a) => {
      const t = new Date(a.created_at).getTime();
      return t >= start && t < end;
    }).length;
  });

  const tasksByStatus = ((tasksStatusRes?.data ?? []) as Array<{ status: string }>).reduce<
    Record<string, number>
  >((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});
  const postsByStage = ((postsStageRes?.data ?? []) as Array<{ stage: string }>).reduce<
    Record<string, number>
  >((acc, r) => {
    acc[r.stage] = (acc[r.stage] ?? 0) + 1;
    return acc;
  }, {});

  return {
    counts: {
      clients: clientsRes?.count ?? 0,
      projects_active: projectsRes?.count ?? 0,
      tasks_open: tasksOpenRes?.count ?? 0,
      tasks_overdue: tasksOverdueRes?.count ?? 0,
      tasks_done_7d: tasksDone7dRes?.count ?? 0,
      posts_total: postsRes?.count ?? 0,
      approvals_pending: approvalsRes?.count ?? 0,
      posts_approved_30d: postsApproved30dRes?.count ?? 0,
    },
    tasksByStatus,
    postsByStage,
    myTasks: (myTasksRes?.data ?? []) as DashboardStats["myTasks"],
    upcomingPosts: (upcomingPostsRes?.data ?? []) as DashboardStats["upcomingPosts"],
    sparkline,
    recentActivity: activity.slice(0, 20),
  };
}

export const getDashboardStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => BrandInput.parse(input))
  .handler(async ({ data, context }) =>
    computeStats(context, data.brandId, data.clientId ?? null),
  );

// ==================== Agency dashboard ====================

export type AgencyAlert = {
  id: string;
  severity: "info" | "warning" | "critical";
  title: string;
  description: string;
  count: number;
  href?: string;
};

export type ClientHealth = {
  id: string;
  name: string;
  color: string | null;
  score: number;
  breakdown: { onTime: number; approvals: number; briefing: number; schedule: number };
  openTasks: number;
  overdueTasks: number;
  approvalsPending: number;
  lastPostAt: string | null;
};

export type AgencyDashboard = {
  counts: DashboardStats["counts"];
  sparkline: number[];
  alerts: AgencyAlert[];
  healths: ClientHealth[];
  approvalsQueue: Array<{
    id: string;
    title: string;
    client_id: string;
    client_name: string;
    channels: string[];
    waiting_since: string;
  }>;
  upcoming: Array<{
    kind: "task" | "post";
    id: string;
    title: string;
    when: string;
    client_id: string | null;
    client_name: string | null;
  }>;
  heatmap: number[];
};

async function computeAgency(ctx: SupaCtx, brandId: string): Promise<AgencyDashboard> {
  const { supabase } = ctx;
  const [clientsRes, tasksRes, postsRes, briefingsRes, activityRes, upcomingRes, approvalsRes] =
    await Promise.all([
      ignore(
        supabase
          .from("clients")
          .select("id,name,color")
          .eq("brand_id", brandId)
          .is("archived_at", null),
      ),
      ignore(
        supabase
          .from("tasks")
          .select("id,title,status,done,done_at,due_at,client_id")
          .eq("brand_id", brandId),
      ),
      ignore(
        supabase
          .from("posts")
          .select("id,title,stage,channels,scheduled_at,published_at,client_id,updated_at")
          .eq("brand_id", brandId),
      ),
      ignore(supabase.from("client_briefings").select("client_id,updated_at")),
      ignore(
        supabase
          .from("activity_events")
          .select("id,created_at,client_id")
          .eq("brand_id", brandId)
          .gte("created_at", sinceIso(60))
          .order("created_at", { ascending: false })
          .limit(1000),
      ),
      ignore(
        supabase
          .from("posts")
          .select("id,title,scheduled_at,client_id,channels")
          .eq("brand_id", brandId)
          .in("stage", ["scheduled", "approved"])
          .gte("scheduled_at", new Date().toISOString())
          .lte("scheduled_at", untilIso(7))
          .order("scheduled_at", { ascending: true })
          .limit(20),
      ),
      ignore(
        supabase
          .from("posts")
          .select("id,title,client_id,channels,updated_at")
          .eq("brand_id", brandId)
          .eq("stage", "review")
          .order("updated_at", { ascending: true })
          .limit(12),
      ),
    ]);

  const clients = (clientsRes?.data ?? []) as Array<{ id: string; name: string; color: string | null }>;
  const tasks = (tasksRes?.data ?? []) as Array<{
    id: string;
    title: string;
    status: string;
    done: boolean;
    done_at: string | null;
    due_at: string | null;
    client_id: string | null;
  }>;
  const posts = (postsRes?.data ?? []) as Array<{
    id: string;
    title: string;
    stage: string;
    channels: string[] | null;
    scheduled_at: string | null;
    published_at: string | null;
    client_id: string;
    updated_at: string | null;
  }>;
  const briefings = new Map<string, string>(
    ((briefingsRes?.data ?? []) as Array<{ client_id: string; updated_at: string }>).map((b) => [
      b.client_id,
      b.updated_at,
    ]),
  );
  const activity = (activityRes?.data ?? []) as Array<{ id: string; created_at: string; client_id: string | null }>;

  const now = Date.now();
  const nameById = new Map(clients.map((c) => [c.id, c.name] as const));

  const counts: DashboardStats["counts"] = {
    clients: clients.length,
    projects_active: 0,
    tasks_open: tasks.filter((t) => !t.done).length,
    tasks_overdue: tasks.filter(
      (t) => !t.done && t.due_at && new Date(t.due_at).getTime() < now,
    ).length,
    tasks_done_7d: tasks.filter(
      (t) => t.done && t.done_at && new Date(t.done_at).getTime() > now - 7 * 86_400_000,
    ).length,
    posts_total: posts.length,
    approvals_pending: posts.filter((p) => p.stage === "review").length,
  };

  const sparkline = Array.from({ length: 14 }, (_, i) => {
    const start = now - (13 - i) * 86_400_000;
    const end = start + 86_400_000;
    return activity.filter((a) => {
      const t = new Date(a.created_at).getTime();
      return t >= start && t < end;
    }).length;
  });

  const heatmap = Array.from({ length: 60 }, (_, i) => {
    const start = now - (59 - i) * 86_400_000;
    const end = start + 86_400_000;
    return posts.filter((p) => {
      if (!p.published_at) return false;
      const t = new Date(p.published_at).getTime();
      return t >= start && t < end;
    }).length;
  });

  const alerts: AgencyAlert[] = [];
  if (counts.tasks_overdue > 0) {
    alerts.push({
      id: "overdue_tasks",
      severity: counts.tasks_overdue > 5 ? "critical" : "warning",
      title: "Tarefas atrasadas",
      description: `${counts.tasks_overdue} tarefa(s) com prazo vencido.`,
      count: counts.tasks_overdue,
      href: "/content",
    });
  }
  const briefingless = clients.filter((c) => !briefings.has(c.id));
  if (briefingless.length > 0) {
    alerts.push({
      id: "clients_without_briefing",
      severity: "warning",
      title: "Clientes sem briefing",
      description: `${briefingless.length} cliente(s) precisam de briefing.`,
      count: briefingless.length,
      href: "/customers",
    });
  }
  const noScheduleClients = clients.filter(
    (c) =>
      !posts.some(
        (p) => p.client_id === c.id && p.scheduled_at && new Date(p.scheduled_at).getTime() > now,
      ),
  );
  if (noScheduleClients.length > 0) {
    alerts.push({
      id: "clients_without_schedule",
      severity: "info",
      title: "Sem publicações agendadas",
      description: `${noScheduleClients.length} cliente(s) sem posts futuros.`,
      count: noScheduleClients.length,
      href: "/customers",
    });
  }
  if (counts.approvals_pending > 0) {
    alerts.push({
      id: "approvals",
      severity: counts.approvals_pending > 6 ? "warning" : "info",
      title: "Aprovações pendentes",
      description: `${counts.approvals_pending} publicação(ões) aguardando aprovação.`,
      count: counts.approvals_pending,
      href: "/customers",
    });
  }

  const healths: ClientHealth[] = clients.map((c) => {
    const cTasks = tasks.filter((t) => t.client_id === c.id);
    const openTasks = cTasks.filter((t) => !t.done).length;
    const overdueTasks = cTasks.filter(
      (t) => !t.done && t.due_at && new Date(t.due_at).getTime() < now,
    ).length;
    const closedRecent = cTasks.filter(
      (t) => t.done && t.done_at && new Date(t.done_at).getTime() > now - 30 * 86_400_000,
    );
    const onTimeRatio =
      closedRecent.length === 0
        ? 1
        : closedRecent.filter(
            (t) => !t.due_at || new Date(t.done_at!).getTime() <= new Date(t.due_at).getTime(),
          ).length / closedRecent.length;

    const cPosts = posts.filter((p) => p.client_id === c.id);
    const inCycle = cPosts.filter(
      (p) => p.updated_at && new Date(p.updated_at).getTime() > now - 30 * 86_400_000,
    );
    const approvedRatio =
      inCycle.length === 0
        ? 1
        : inCycle.filter((p) => ["approved", "scheduled", "published"].includes(p.stage)).length /
          inCycle.length;

    const briefingAt = briefings.get(c.id);
    const briefingScore = !briefingAt
      ? 0
      : Math.max(0, 1 - (now - new Date(briefingAt).getTime()) / (60 * 86_400_000));

    const scheduleScore = cPosts.some(
      (p) => p.scheduled_at && new Date(p.scheduled_at).getTime() > now,
    )
      ? 1
      : 0;

    const onTime = Math.round(onTimeRatio * 40);
    const approvals = Math.round(approvedRatio * 30);
    const briefing = Math.round(briefingScore * 15);
    const schedule = Math.round(scheduleScore * 15);
    const score = onTime + approvals + briefing + schedule;
    const lastPost =
      cPosts.filter((p) => p.published_at).map((p) => p.published_at as string).sort().at(-1) ??
      null;

    return {
      id: c.id,
      name: c.name,
      color: c.color,
      score,
      breakdown: { onTime, approvals, briefing, schedule },
      openTasks,
      overdueTasks,
      approvalsPending: cPosts.filter((p) => p.stage === "review").length,
      lastPostAt: lastPost,
    };
  });

  const approvalsQueue = ((approvalsRes?.data ?? []) as Array<{
    id: string;
    title: string;
    client_id: string;
    channels: string[] | null;
    updated_at: string;
  }>).map((p) => ({
    id: p.id,
    title: p.title,
    client_id: p.client_id,
    client_name: nameById.get(p.client_id) ?? "—",
    channels: (p.channels ?? []) as string[],
    waiting_since: p.updated_at,
  }));

  const upcomingTasks = tasks
    .filter(
      (t) =>
        !t.done &&
        t.due_at &&
        new Date(t.due_at).getTime() > now &&
        new Date(t.due_at).getTime() < now + 7 * 86_400_000,
    )
    .map((t) => ({
      kind: "task" as const,
      id: t.id,
      title: t.title,
      when: t.due_at as string,
      client_id: t.client_id,
      client_name: t.client_id ? nameById.get(t.client_id) ?? null : null,
    }));
  const upcomingPosts = ((upcomingRes?.data ?? []) as Array<{
    id: string;
    title: string;
    scheduled_at: string;
    client_id: string;
  }>).map((p) => ({
    kind: "post" as const,
    id: p.id,
    title: p.title,
    when: p.scheduled_at,
    client_id: p.client_id,
    client_name: nameById.get(p.client_id) ?? null,
  }));
  const upcoming = [...upcomingTasks, ...upcomingPosts]
    .sort((a, b) => new Date(a.when).getTime() - new Date(b.when).getTime())
    .slice(0, 12);

  return { counts, sparkline, alerts, healths, approvalsQueue, upcoming, heatmap };
}

export const getAgencyDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ brandId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => computeAgency(context, data.brandId));

// ==================== AI Insights ====================

export type DashboardInsights = {
  headline: string;
  actions: Array<{ title: string; why: string; href?: string }>;
  risks: string[];
};

export const getDashboardInsights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => BrandInput.parse(input))
  .handler(async ({ data, context }): Promise<DashboardInsights | null> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) return null;

    const brief = data.clientId
      ? await computeStats(context, data.brandId, data.clientId).then((s) => ({
          mode: "client" as const,
          counts: s.counts,
          postsByStage: s.postsByStage,
          tasksByStatus: s.tasksByStatus,
          upcomingCount: s.upcomingPosts.length,
          myTasksCount: s.myTasks.length,
        }))
      : await computeAgency(context, data.brandId).then((a) => ({
          mode: "agency" as const,
          counts: a.counts,
          alerts: a.alerts.map((x) => ({ id: x.id, severity: x.severity, count: x.count })),
          worstHealth: a.healths
            .slice()
            .sort((x, y) => x.score - y.score)
            .slice(0, 3)
            .map((h) => ({ name: h.name, score: h.score })),
          approvalsQueueSize: a.approvalsQueue.length,
          upcomingCount: a.upcoming.length,
        }));

    try {
      const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
      const gateway = createLovableAiGatewayProvider(key);
      const model = gateway("google/gemini-2.5-flash");

      const { output } = await generateText({
        model,
        output: Output.object({
          schema: z.object({
            headline: z.string(),
            actions: z.array(
              z.object({
                title: z.string(),
                why: z.string(),
                href: z.string().nullable(),
              }),
            ),
            risks: z.array(z.string()),
          }),
        }),
        prompt: `Você é o chefe de operações de uma agência de conteúdo. Analise este resumo do dashboard e responda em português (BR).
Gere no máximo 3 ações prioritárias, cada uma com um "why" curto (menos de 20 palavras), e no máximo 3 riscos curtos (menos de 12 palavras).
A headline deve ter no máximo 12 palavras. hrefs válidos: "/content", "/customers", "/content" ou null.

RESUMO:
${JSON.stringify(brief, null, 2)}`,
      });
      return {
        headline: output.headline.slice(0, 140),
        actions: output.actions.slice(0, 3).map((a) => ({
          title: a.title.slice(0, 80),
          why: a.why.slice(0, 160),
          href: a.href ?? undefined,
        })),
        risks: output.risks.slice(0, 3).map((r) => r.slice(0, 140)),
      };
    } catch (error) {
      if (NoObjectGeneratedError.isInstance(error)) return null;
      console.error("[insights]", error);
      return null;
    }
  });

// ==================== Command palette search ====================

export const searchWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ brandId: z.string().uuid(), q: z.string().trim().min(1).max(80) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const like = `%${data.q}%`;
    const [clients, projects, tasks, posts] = await Promise.all([
      ignore(
        context.supabase
          .from("clients")
          .select("id,name")
          .eq("brand_id", data.brandId)
          .ilike("name", like)
          .limit(5),
      ),
      ignore(
        context.supabase
          .from("projects")
          .select("id,name,client_id")
          .eq("brand_id", data.brandId)
          .ilike("name", like)
          .limit(5),
      ),
      ignore(
        context.supabase
          .from("tasks")
          .select("id,title,client_id")
          .eq("brand_id", data.brandId)
          .ilike("title", like)
          .limit(5),
      ),
      ignore(
        context.supabase
          .from("posts")
          .select("id,title,client_id")
          .eq("brand_id", data.brandId)
          .ilike("title", like)
          .limit(5),
      ),
    ]);
    return {
      clients: (clients?.data ?? []) as Array<{ id: string; name: string }>,
      projects: (projects?.data ?? []) as Array<{ id: string; name: string; client_id: string | null }>,
      tasks: (tasks?.data ?? []) as Array<{ id: string; title: string; client_id: string | null }>,
      posts: (posts?.data ?? []) as Array<{ id: string; title: string; client_id: string }>,
    };
  });