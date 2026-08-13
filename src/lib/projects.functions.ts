import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadStageMap, effectiveStage } from "@/lib/post-stage.server";


const ProjectStatus = z.enum(["planning", "active", "in_progress", "paused", "done", "archived"]);

export type ProjectPlanRef = { id: string; title: string | null; status: string };

type ProjectListRow = {
  id: string;
  brand_id: string;
  client_id: string | null;
  name: string;
  description: string | null;
  status: string;
  color: string | null;
  progress: number | null;
  start_date: string | null;
  due_at: string | null;
  goals: string | null;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
  monthly_plan_id: string | null;
  monthly_plans: ProjectPlanRef | null;
};

export const listProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        brandId: z.string().uuid(),
        clientId: z.string().uuid().nullable().optional(),
        status: ProjectStatus.nullable().optional(),
        ownerId: z.string().uuid().nullable().optional(),
        q: z.string().max(200).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("projects")
      .select(
        "id, brand_id, client_id, name, description, status, color, progress, start_date, due_at, goals, owner_id, created_at, updated_at, monthly_plan_id, monthly_plans!projects_monthly_plan_id_fkey(id, title, status)",
      )
      .eq("brand_id", data.brandId)
      .order("created_at", { ascending: false });

    if (data.clientId) query = query.eq("client_id", data.clientId);
    if (data.status) query = query.eq("status", data.status);
    if (data.ownerId) query = query.eq("owner_id", data.ownerId);
    if (data.q && data.q.trim()) query = query.ilike("name", `%${data.q.trim()}%`);

    const { data: rawRows, error } = await query;
    if (error) throw error;
    const projects = ((rawRows ?? []) as unknown as ProjectListRow[]).map((p) => ({
      ...p,
      plan: p.monthly_plans
        ? { id: p.monthly_plans.id, title: p.monthly_plans.title, status: p.monthly_plans.status }
        : null,
    }));
    if (projects.length === 0) return { projects: [], stats: {} as Record<string, ProjectStats> };

    const ids = projects.map((p) => p.id);

    const { data: postRows, error: postErr } = await context.supabase
      .from("posts")
      .select("id, project_id, stage, stage_id, published_at, review_status")
      .eq("brand_id", data.brandId)
      .in("project_id", ids);
    if (postErr) throw postErr;

    // `stage_id` é a fonte operacional; o enum legado é só fallback.
    const stageMap = await loadStageMap(
      context.supabase,
      (postRows ?? []).map((p) => p.stage_id as string | null),
    );

    const stats: Record<string, ProjectStats> = {};
    for (const id of ids) stats[id] = { total: 0, approved: 0, published: 0, pending: 0 };
    for (const p of postRows ?? []) {
      const s = stats[p.project_id as string];
      if (!s) continue;
      s.total += 1;
      const stage = effectiveStage(p.stage_id as string | null, p.stage as string | null, stageMap);
      const review = String(p.review_status ?? "").toLowerCase();
      const published = !!p.published_at || stage === "published";
      if (published) s.published += 1;
      if (review === "approved" || stage === "approved") s.approved += 1;
      if (!published && review !== "approved" && stage !== "approved") s.pending += 1;
    }

    return { projects, stats };
  });

export type ProjectStats = { total: number; approved: number; published: number; pending: number };

export type ProjectPlanItem = {
  topic_id: string;
  title: string;
  channel: string | null;
  format: string | null;
  topic_status: string | null;
  client_status: string | null;
  post: {
    id: string;
    stage: string | null;
    review_status: string | null;
    published_at: string | null;
    scheduled_at: string | null;
    assignee_id: string | null;
    cover_url: string | null;
  } | null;
  tasks: {
    count: number;
    open: number;
    assignee_id: string | null;
    assignee_name: string | null;
    due_at: string | null;
  };
};

export const getProject = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ brandId: z.string().uuid(), projectId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: projectRaw, error } = await context.supabase
      .from("projects")
      .select(
        "id, brand_id, client_id, name, description, status, color, progress, start_date, due_at, goals, owner_id, created_at, updated_at, monthly_plan_id, monthly_plans!projects_monthly_plan_id_fkey(id, title, status)",
      )
      .eq("brand_id", data.brandId)
      .eq("id", data.projectId)
      .maybeSingle();
    if (error) throw error;
    if (!projectRaw) throw new Error("Projeto não encontrado");
    const projectRow = projectRaw as unknown as ProjectListRow;
    const project = {
      ...projectRow,
      plan: projectRow.monthly_plans
        ? {
            id: projectRow.monthly_plans.id,
            title: projectRow.monthly_plans.title,
            status: projectRow.monthly_plans.status,
          }
        : null,
    };


    const { data: postRows } = await context.supabase
      .from("posts")
      .select(
        "id, title, stage, stage_id, review_status, published_at, scheduled_at, channels, cover_url, created_at, updated_at, monthly_plan_topic_id, assignee_id, format",
      )
      .eq("brand_id", data.brandId)
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false });

    const posts = postRows ?? [];
    const stageMap = await loadStageMap(
      context.supabase,
      posts.map((p) => p.stage_id as string | null),
    );
    const stageOf = (p: { stage_id?: string | null; stage?: string | null }) =>
      effectiveStage(p.stage_id ?? null, p.stage ?? null, stageMap);
    const stats: ProjectStats = { total: posts.length, approved: 0, published: 0, pending: 0 };
    for (const p of posts) {
      const stage = stageOf(p);
      const review = String(p.review_status ?? "").toLowerCase();
      const published = !!p.published_at || stage === "published";
      if (published) stats.published += 1;
      if (review === "approved" || stage === "approved") stats.approved += 1;
      if (!published && review !== "approved" && stage !== "approved") stats.pending += 1;
    }


    // Itens da pauta vinculada (inclui os que ainda não viraram peça).
    const items: ProjectPlanItem[] = [];
    if (projectRow.monthly_plan_id) {
      const { data: topicRows } = await context.supabase
        .from("monthly_plan_topics" as never)
        .select("id, topic_title, channel, content_format, status, client_status, position")
        .eq("monthly_plan_id", projectRow.monthly_plan_id)
        .order("position", { ascending: true });
      const topics = (topicRows ?? []) as unknown as Array<{
        id: string;
        topic_title: string;
        channel: string | null;
        content_format: string | null;
        status: string | null;
        client_status: string | null;
        position: number;
      }>;
      const byTopic = new Map<string, (typeof posts)[number]>();
      for (const p of posts) {
        const tid = (p as { monthly_plan_topic_id?: string | null }).monthly_plan_topic_id;
        if (tid) byTopic.set(tid, p);
      }
      // Tarefas de produção vinculadas às peças (execução operacional).
      const postIds = posts.map((p) => p.id as string);
      const tasksByPost = new Map<
        string,
        { count: number; open: number; assignee_id: string | null; due_at: string | null }
      >();
      const assigneeNames = new Map<string, string>();
      if (postIds.length > 0) {
        const { data: taskRows } = await context.supabase
          .from("tasks")
          .select("id, post_id, status, assignee_id, due_at")
          .eq("brand_id", data.brandId)
          .in("post_id", postIds);
        const tasks = (taskRows ?? []) as unknown as Array<{
          post_id: string | null;
          status: string | null;
          assignee_id: string | null;
          due_at: string | null;
        }>;
        for (const t of tasks) {
          if (!t.post_id) continue;
          const cur =
            tasksByPost.get(t.post_id) ?? { count: 0, open: 0, assignee_id: null, due_at: null };
          cur.count += 1;
          if (String(t.status ?? "") !== "done") cur.open += 1;
          if (!cur.assignee_id && t.assignee_id) cur.assignee_id = t.assignee_id;
          if (!cur.due_at && t.due_at) cur.due_at = t.due_at;
          tasksByPost.set(t.post_id, cur);
        }
        const ids = Array.from(
          new Set(Array.from(tasksByPost.values()).map((v) => v.assignee_id).filter(Boolean)),
        ) as string[];
        if (ids.length > 0) {
          const { data: profiles } = await context.supabase
            .from("user_profiles")
            .select("id, full_name")
            .in("id", ids);
          for (const pr of (profiles ?? []) as unknown as Array<{
            id: string;
            full_name: string | null;
          }>) {
            if (pr.full_name) assigneeNames.set(pr.id, pr.full_name);
          }
        }
      }

      for (const t of topics) {
        const post = byTopic.get(t.id) ?? null;
        const agg = post ? tasksByPost.get(post.id as string) ?? null : null;
        items.push({
          topic_id: t.id,
          title: t.topic_title,
          channel: t.channel,
          format: t.content_format,
          topic_status: t.status,
          client_status: t.client_status,
          post: post
            ? {
                id: post.id,
                stage: stageOf(post as { stage_id?: string | null; stage?: string | null }),
                review_status: (post.review_status as string | null) ?? null,
                published_at: (post.published_at as string | null) ?? null,
                scheduled_at: (post.scheduled_at as string | null) ?? null,
                assignee_id: (post as { assignee_id?: string | null }).assignee_id ?? null,
                cover_url: (post.cover_url as string | null) ?? null,
              }
            : null,
          tasks: {
            count: agg?.count ?? 0,
            open: agg?.open ?? 0,
            assignee_id: agg?.assignee_id ?? null,
            assignee_name: agg?.assignee_id ? assigneeNames.get(agg.assignee_id) ?? null : null,
            due_at: agg?.due_at ?? null,
          },
        });
      }
    }

    return { project, posts, stats, items };
  });

const ProjectPayload = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().max(2000).nullable().optional(),
  status: ProjectStatus.optional(),
  color: z.string().max(20).nullable().optional(),
  client_id: z.string().uuid().nullable().optional(),
  owner_id: z.string().uuid().nullable().optional(),
  start_date: z.string().nullable().optional(),
  due_at: z.string().nullable().optional(),
  goals: z.string().max(4000).nullable().optional(),
});

export const createProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ brandId: z.string().uuid(), values: ProjectPayload }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const v = data.values;
    const { data: row, error } = await context.supabase
      .from("projects")
      .insert({
        brand_id: data.brandId,
        name: v.name,
        description: v.description ?? null,
        status: v.status ?? "active",
        color: v.color ?? "#8b5cf6",
        client_id: v.client_id ?? null,
        owner_id: v.owner_id ?? null,
        start_date: v.start_date ?? null,
        due_at: v.due_at ?? null,
        goals: v.goals ?? null,
      } as never)
      .select("id")
      .single();
    if (error) throw error;
    return { id: (row as { id: string }).id };
  });

export const updateProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        brandId: z.string().uuid(),
        projectId: z.string().uuid(),
        patch: ProjectPayload.partial(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("projects")
      .update(data.patch as never)
      .eq("id", data.projectId)
      .eq("brand_id", data.brandId);
    if (error) throw error;
    return { ok: true };
  });

export const archiveProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ brandId: z.string().uuid(), projectId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("projects")
      .update({ status: "archived" } as never)
      .eq("id", data.projectId)
      .eq("brand_id", data.brandId);
    if (error) throw error;
    return { ok: true };
  });

export const deleteProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ brandId: z.string().uuid(), projectId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    // unlink posts to avoid FK issues
    await context.supabase
      .from("posts")
      .update({ project_id: null } as never)
      .eq("brand_id", data.brandId)
      .eq("project_id", data.projectId);
    const { error } = await context.supabase
      .from("projects")
      .delete()
      .eq("id", data.projectId)
      .eq("brand_id", data.brandId);
    if (error) throw error;
    return { ok: true };
  });