import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ProjectStatus = z.enum(["planning", "active", "in_progress", "paused", "done", "archived"]);

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
        "id, brand_id, client_id, name, description, status, color, progress, start_date, due_at, goals, owner_id, created_at, updated_at, monthly_plan_id, monthly_plans(id, title, status)",
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
      .select("id, project_id, stage, published_at, review_status")
      .eq("brand_id", data.brandId)
      .in("project_id", ids);
    if (postErr) throw postErr;

    const stats: Record<string, ProjectStats> = {};
    for (const id of ids) stats[id] = { total: 0, approved: 0, published: 0, pending: 0 };
    for (const p of postRows ?? []) {
      const s = stats[p.project_id as string];
      if (!s) continue;
      s.total += 1;
      const stage = String(p.stage ?? "").toLowerCase();
      const review = String(p.review_status ?? "").toLowerCase();
      const published = !!p.published_at || stage === "published";
      if (published) s.published += 1;
      if (review === "approved" || stage === "approved") s.approved += 1;
      if (!published && review !== "approved" && stage !== "approved") s.pending += 1;
    }
    return { projects, stats };
  });

export type ProjectStats = { total: number; approved: number; published: number; pending: number };

export const getProject = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ brandId: z.string().uuid(), projectId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: project, error } = await context.supabase
      .from("projects")
      .select(
        "id, brand_id, client_id, name, description, status, color, progress, start_date, due_at, goals, owner_id, created_at, updated_at",
      )
      .eq("brand_id", data.brandId)
      .eq("id", data.projectId)
      .maybeSingle();
    if (error) throw error;
    if (!project) throw new Error("Projeto não encontrado");

    const { data: postRows } = await context.supabase
      .from("posts")
      .select("id, title, stage, review_status, published_at, scheduled_at, channels, cover_url, created_at, updated_at")
      .eq("brand_id", data.brandId)
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false });

    const posts = postRows ?? [];
    const stats: ProjectStats = { total: posts.length, approved: 0, published: 0, pending: 0 };
    for (const p of posts) {
      const stage = String(p.stage ?? "").toLowerCase();
      const review = String(p.review_status ?? "").toLowerCase();
      const published = !!p.published_at || stage === "published";
      if (published) stats.published += 1;
      if (review === "approved" || stage === "approved") stats.approved += 1;
      if (!published && review !== "approved" && stage !== "approved") stats.pending += 1;
    }
    return { project, posts, stats };
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