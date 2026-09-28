import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callRpc } from "@/lib/supabase-rpc";
import type { Json } from "@/integrations/supabase/types";

export type ProjectTemplate = {
  id: string;
  brand_id: string | null;
  name: string;
  description: string | null;
  icon: string | null;
  is_system: boolean;
  blueprint?: Json | null;
  archived_at?: string | null;
  source_client_id?: string | null;
  jobs_count?: number;
  tasks_count?: number;
};

export const listTemplatesFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ brandId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<ProjectTemplate[]> => {
    const { data: rows, error } = await context.supabase
      .from("project_templates")
      .select("id, brand_id, name, description, icon, is_system, blueprint, archived_at, source_client_id")
      .or(`is_system.eq.true,brand_id.eq.${data.brandId}`)
      .is("archived_at", null)
      .order("is_system", { ascending: false })
      .order("name", { ascending: true });
    if (error) throw error;
    const templates = (rows ?? []) as ProjectTemplate[];
    if (templates.length === 0) return [];
    const ids = templates.map((t) => t.id);
    const { data: jobs, error: jobsError } = await context.supabase
      .from("project_template_jobs")
      .select("id, template_id")
      .in("template_id", ids);
    if (jobsError) throw new Error(jobsError.message);
    const jobRows = (jobs ?? []) as Array<{ id: string; template_id: string }>;
    const jobIds = jobRows.map((j) => j.id);
    const { data: tasks, error: tasksError } = jobIds.length
      ? await context.supabase
          .from("project_template_tasks")
          .select("id, template_job_id")
          .in("template_job_id", jobIds)
      : { data: [], error: null };
    if (tasksError) throw new Error(tasksError.message);
    const taskRows = (tasks ?? []) as Array<{ id: string; template_job_id: string }>;
    const jobToTpl = new Map(jobRows.map((j) => [j.id, j.template_id]));
    const jobsCount = new Map<string, number>();
    const tasksCount = new Map<string, number>();
    for (const j of jobRows) jobsCount.set(j.template_id, (jobsCount.get(j.template_id) ?? 0) + 1);
    for (const t of taskRows) {
      const tplId = jobToTpl.get(t.template_job_id);
      if (tplId) tasksCount.set(tplId, (tasksCount.get(tplId) ?? 0) + 1);
    }
    return templates.map((t) => ({
      ...t,
      jobs_count: Array.isArray((t.blueprint as { jobs?: unknown } | null)?.jobs) ? ((t.blueprint as { jobs: Array<{ tasks?: unknown[] }> }).jobs).length : jobsCount.get(t.id) ?? 0,
      tasks_count: Array.isArray((t.blueprint as { jobs?: unknown } | null)?.jobs) ? ((t.blueprint as { jobs: Array<{ tasks?: unknown[] }> }).jobs).reduce((n, j) => n + (j.tasks?.length ?? 0), 0) : tasksCount.get(t.id) ?? 0,
    }));
  });

export const instantiateTemplateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        templateId: z.string().uuid(),
        brandId: z.string().uuid(),
        clientId: z.string().uuid().nullable().optional(),
        projectName: z.string().trim().min(2).max(120),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: projectId, error } = await callRpc<string>(context.supabase, "instantiate_project_template", {
      _template_id: data.templateId,
      _brand_id: data.brandId,
      _client_id: (data.clientId ?? null) as string,
      _project_name: data.projectName,
    });
    if (error) throw new Error(error.message);
    return { projectId: projectId ?? "" };
  });

export const saveTemplateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    brandId: z.string().uuid(), templateId: z.string().uuid().nullable(),
    sourceProjectId: z.string().uuid().nullable(), name: z.string().trim().min(2).max(120),
    description: z.string().max(4000).nullable(),
    blueprint: z.object({
      description: z.string().max(4000).nullable(), ownerId: z.string().uuid().nullable(),
      participants: z.array(z.string().uuid()).max(100),
      texts: z.array(z.object({ level: z.enum(["project", "job", "task"]), kind: z.enum(["description", "comment"]), body: z.string().min(1).max(4000), jobIndex: z.number().int().optional(), taskIndex: z.number().int().optional() })).max(300),
      jobs: z.array(z.object({ name: z.string().trim().min(1).max(120), description: z.string().max(4000).nullable(), color: z.string().max(30).nullable(), estimatedMinutes: z.number().int().min(0).nullable(), assigneeId: z.string().uuid().nullable(), tasks: z.array(z.object({ title: z.string().trim().min(1).max(200), description: z.string().max(4000).nullable(), priority: z.enum(["low", "medium", "high", "urgent"]), estimatedMinutes: z.number().int().min(0).nullable(), assigneeId: z.string().uuid().nullable() })).max(300) })).max(100),
    }),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: id, error } = await callRpc<string>(context.supabase, "save_project_template", {
      _brand_id: data.brandId, _template_id: data.templateId, _name: data.name,
      _description: data.description, _blueprint: data.blueprint, _source_project_id: data.sourceProjectId,
    });
    if (error) throw new Error(error.message);
    if (!id) throw new Error("Não foi possível salvar o modelo.");
    return { id };
  });

export const archiveTemplateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ brandId: z.string().uuid(), templateId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.from("project_templates")
      .update({ archived_at: new Date().toISOString() }).eq("id", data.templateId)
      .eq("brand_id", data.brandId).eq("is_system", false).is("archived_at", null)
      .select("id").single();
    if (error || !row) throw new Error(error?.message ?? "Modelo indisponível.");
    return { id: row.id };
  });

export const captureProjectTemplateFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ brandId: z.string().uuid(), projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const db = context.supabase;
    const { data: project, error: projectError } = await db.from("projects").select("id,name,description,client_id,owner_id").eq("brand_id", data.brandId).eq("id", data.projectId).single();
    if (projectError || !project) throw new Error(projectError?.message ?? "Projeto indisponível.");
    const [jobs, tasks, participants, comments] = await Promise.all([
      db.from("project_jobs").select("id,name,description,color,assignee_id,estimated_minutes,position").eq("brand_id", data.brandId).eq("project_id", data.projectId).order("position"),
      db.from("tasks").select("id,job_id,title,description,priority,estimated_minutes,assignee_id,position").eq("brand_id", data.brandId).eq("project_id", data.projectId).order("position").limit(1000),
      db.from("project_participants").select("user_id").eq("brand_id", data.brandId).eq("project_id", data.projectId),
      db.from("work_comments").select("id,body,job_id").eq("brand_id", data.brandId).eq("project_id", data.projectId).order("created_at").limit(300),
    ]);
    for (const result of [jobs, tasks, participants, comments]) if (result.error) throw new Error(result.error.message);
    const jobRows = jobs.data ?? [];
    return {
      project, blueprint: { description: project.description, ownerId: project.owner_id,
        participants: (participants.data ?? []).map(p => p.user_id), texts: [] as Array<{ level: "project" | "job" | "task"; kind: "description" | "comment"; body: string; jobIndex?: number; taskIndex?: number }>,
        jobs: jobRows.map(j => ({ name: j.name, description: j.description, color: j.color, assigneeId: j.assignee_id, estimatedMinutes: j.estimated_minutes,
          tasks: (tasks.data ?? []).filter(t => t.job_id === j.id).map(t => ({ title: t.title, description: t.description, priority: t.priority, estimatedMinutes: t.estimated_minutes, assigneeId: t.assignee_id })) })),
      },
      candidates: (comments.data ?? []).map(c => ({ id: c.id, body: c.body, level: c.job_id ? "job" as const : "project" as const, jobIndex: c.job_id ? jobRows.findIndex(j => j.id === c.job_id) : undefined })),
    };
  });
