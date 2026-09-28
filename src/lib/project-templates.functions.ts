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
  updated_at?: string | null;
  jobs_count?: number;
  tasks_count?: number;
};

export const listTemplatesFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ brandId: z.string().uuid(), includeArchived: z.boolean().optional() }).parse(i))
  .handler(async ({ data, context }): Promise<ProjectTemplate[]> => {
    const { data: rows, error } = await context.supabase
      .from("project_templates")
       .select("id, brand_id, name, description, icon, is_system, blueprint, archived_at, source_client_id, updated_at")
      .or(`is_system.eq.true,brand_id.eq.${data.brandId}`)
      .order("is_system", { ascending: false })
      .order("name", { ascending: true });
    if (error) throw error;
     const templates = ((rows ?? []) as ProjectTemplate[]).filter(t => data.includeArchived || !t.archived_at);
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
       tasks_count: Array.isArray((t.blueprint as { jobs?: unknown } | null)?.jobs) ? ((t.blueprint as { jobs: Array<{ tasks?: unknown[] }>; directTasks?: unknown[] }).jobs).reduce((n, j) => n + (j.tasks?.length ?? 0), (t.blueprint as { directTasks?: unknown[] }).directTasks?.length ?? 0) : tasksCount.get(t.id) ?? 0,
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
         requestId: z.string().uuid(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
     const { data: projectId, error } = await callRpc<string>(context.supabase, "instantiate_project_template_once", {
      _template_id: data.templateId,
      _brand_id: data.brandId,
      _client_id: (data.clientId ?? null) as string,
      _project_name: data.projectName,
       _request_id: data.requestId,
    });
    if (error) throw new Error(error.message);
    return { projectId: projectId ?? "" };
  });

export const reviewTemplateFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ brandId: z.string().uuid(), templateId: z.string().uuid(), clientId: z.string().uuid().nullable() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: model, error } = await context.supabase.from("project_templates").select("id,blueprint,source_client_id,is_system,brand_id").eq("id", data.templateId).is("archived_at",null).single();
    if (error || !model || (!model.is_system && model.brand_id !== data.brandId) || (model.source_client_id && model.source_client_id !== data.clientId)) throw new Error("Modelo indisponível para este cliente.");
    const blueprint = model.blueprint && typeof model.blueprint === "object" && !Array.isArray(model.blueprint) ? model.blueprint as Record<string, unknown> : {};
    const jobs = Array.isArray(blueprint.jobs) ? blueprint.jobs as Array<{assigneeId?: string;tasks?: Array<{assigneeId?: string}>}> : [];
    const people = [...new Set([blueprint.ownerId, ...(Array.isArray(blueprint.participants) ? blueprint.participants : []), ...jobs.flatMap(j => [j.assigneeId,...(j.tasks ?? []).map(t => t.assigneeId)]), ...(Array.isArray(blueprint.directTasks) ? (blueprint.directTasks as Array<{assigneeId?: string}>).map(t => t.assigneeId) : [])].filter((p): p is string => typeof p === "string" && z.string().uuid().safeParse(p).success))];
    const checks = await Promise.all(people.map(async person => {
      if (!data.clientId) return false;
      const { data: allowed, error: accessError } = await callRpc<boolean>(context.supabase, "can_access_client", { _client_id: data.clientId, _user_id: person });
      if (accessError) throw new Error(accessError.message);
      return allowed === true;
    }));
    return { texts: Array.isArray(blueprint.texts) ? blueprint.texts.length : 0, ineligible: checks.filter(ok => !ok).length };
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
       texts: z.array(z.object({ level: z.enum(["project", "job", "task"]), kind: z.enum(["description", "comment"]), body: z.string().min(1).max(4000), jobIndex: z.number().int().optional(), taskIndex: z.number().int().optional(), sourceId: z.string().uuid().optional(), sourceKind: z.enum(["work_comment", "task_comment", "client_briefing", "brand_briefing"]).optional() })).max(300),
      jobs: z.array(z.object({ name: z.string().trim().min(1).max(120), description: z.string().max(4000).nullable(), color: z.string().max(30).nullable(), estimatedMinutes: z.number().int().min(0).nullable(), assigneeId: z.string().uuid().nullable(), tasks: z.array(z.object({ title: z.string().trim().min(1).max(200), description: z.string().max(4000).nullable(), priority: z.enum(["low", "medium", "high", "urgent"]), estimatedMinutes: z.number().int().min(0).nullable(), assigneeId: z.string().uuid().nullable() })).max(300) })).max(100),
       directTasks: z.array(z.object({ title: z.string().trim().min(1).max(200), description: z.string().max(4000).nullable(), priority: z.enum(["low", "medium", "high", "urgent"]), estimatedMinutes: z.number().int().min(0).nullable(), assigneeId: z.string().uuid().nullable() })).max(300).optional(),
    }),
  }).parse(input))
  .handler(async ({ data, context }) => {
      const { data: allowed, error: permissionError } = await callRpc<boolean>(context.supabase, "can_manage_project_templates", { _brand_id: data.brandId, _user_id: context.userId });
      if (permissionError || allowed !== true) throw new Error("Apenas Owner, Admin ou Super Admin podem gerenciar modelos.");
     if (data.blueprint.texts.some(text => Boolean(text.sourceId) !== Boolean(text.sourceKind) || (text.level === "job" && (text.jobIndex === undefined || !data.blueprint.jobs[text.jobIndex])) || (text.level === "task" && (text.taskIndex === undefined || text.taskIndex < 0 || text.taskIndex >= data.blueprint.jobs.reduce((n, job) => n + job.tasks.length, 0) + (data.blueprint.directTasks?.length ?? 0))))) throw new Error("Destino ou origem de texto inválido.");
     const clean = (value: string | null) => value?.replace(/<[^>]*>/g, "").trim() ?? null;
     const blueprint = { ...data.blueprint, description: clean(data.blueprint.description), jobs: data.blueprint.jobs.map(j => ({ ...j, description: clean(j.description), tasks: j.tasks.map(t => ({ ...t, description: clean(t.description) })) })), directTasks: data.blueprint.directTasks?.map(t => ({ ...t, description: clean(t.description) })), texts: data.blueprint.texts.map(t => ({ ...t, body: clean(t.body) ?? "" })) };
     if (blueprint.texts.some(t => !t.body)) throw new Error("Os textos padrão não podem estar vazios.");
    const { data: id, error } = await callRpc<string>(context.supabase, "save_project_template", {
      _brand_id: data.brandId, _template_id: data.templateId, _name: data.name,
       _description: clean(data.description), _blueprint: blueprint, _source_project_id: data.sourceProjectId,
    });
    if (error) throw new Error(error.message);
    if (!id) throw new Error("Não foi possível salvar o modelo.");
    return { id };
  });

export const archiveTemplateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ brandId: z.string().uuid(), templateId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: id, error } = await callRpc<string>(context.supabase, "archive_project_template", {
      _brand_id: data.brandId, _template_id: data.templateId,
    });
    if (error || !id) throw new Error(error?.message ?? "Modelo indisponível.");
    return { id };
  });

export const canManageTemplatesFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ brandId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: allowed, error } = await callRpc<boolean>(context.supabase, "can_manage_project_templates", { _brand_id: data.brandId, _user_id: context.userId });
    if (error) throw new Error(error.message);
    return allowed === true;
  });

export const restoreTemplateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ brandId: z.string().uuid(), templateId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: id, error } = await callRpc<string>(context.supabase, "restore_project_template", { _brand_id: data.brandId, _template_id: data.templateId });
    if (error || !id) throw new Error(error?.message ?? "Modelo indisponível.");
    return { id };
  });

export const deleteTemplateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ brandId: z.string().uuid(), templateId: z.string().uuid(), confirmation: z.string() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: id, error } = await callRpc<string>(context.supabase, "delete_project_template", { _brand_id: data.brandId, _template_id: data.templateId, _confirmation: data.confirmation });
    if (error || !id) throw new Error(error?.code === "23503" ? "Este modelo possui registros de criação. Arquive-o em vez de excluir." : error?.message ?? "Modelo indisponível.");
    return { id };
  });

export const captureProjectTemplateFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ brandId: z.string().uuid(), projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const db = context.supabase;
    const { data: project, error: projectError } = await db.from("projects").select("id,name,description,client_id,owner_id").eq("brand_id", data.brandId).eq("id", data.projectId).single();
    if (projectError || !project) throw new Error(projectError?.message ?? "Projeto indisponível.");
     async function pages<T>(read: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, max: number) {
       const rows: T[] = [];
       for (let from = 0; from <= max; from += 200) {
         const result = await read(from, Math.min(from + 199, max));
         if (result.error) throw new Error(result.error.message);
         rows.push(...(result.data ?? []));
         if ((result.data?.length ?? 0) < Math.min(200, max - from + 1)) break;
       }
       return { rows: rows.slice(0, max), truncated: rows.length > max };
     }
     const [jobs, tasks, participants, comments] = await Promise.all([
       pages((from,to) => db.from("project_jobs").select("id,name,description,color,assignee_id,estimated_minutes,position").eq("brand_id", data.brandId).eq("project_id", data.projectId).order("position").order("id").range(from,to), 100),
       pages((from,to) => db.from("tasks").select("id,job_id,title,description,priority,estimated_minutes,assignee_id,position").eq("brand_id", data.brandId).eq("project_id", data.projectId).order("position").order("id").range(from,to), 1000),
       pages((from,to) => db.from("project_participants").select("user_id").eq("brand_id", data.brandId).eq("project_id", data.projectId).range(from,to), 100),
       pages((from,to) => db.from("work_comments").select("id,body,job_id").eq("brand_id", data.brandId).eq("project_id", data.projectId).order("created_at").order("id").range(from,to), 300),
     ]);
     const jobRows = jobs.rows;
     const taskIds = tasks.rows.map(t => t.id);
     const taskComments: Array<{ id: string; body: string; task_id: string }> = [];
     for (let i = 0; i < taskIds.length; i += 100) {
       const batch = taskIds.slice(i, i + 100);
       const result = await pages((from,to) => db.from("task_comments").select("id,body,task_id").eq("brand_id", data.brandId).in("task_id", batch).order("created_at").order("id").range(from,to), 300);
       taskComments.push(...result.rows);
       if (result.truncated) comments.truncated = true;
     }
     const briefings: Array<{ id: string; body: string; sourceKind: "client_briefing" | "brand_briefing" }> = [];
     if (project.client_id) {
       const [clientBriefing, brandBriefing] = await Promise.all([
         db.from("client_briefings").select("id,guidelines,target_audience").eq("client_id", project.client_id).limit(100),
         db.from("brand_briefings").select("id,raw_text").eq("brand_id", data.brandId).eq("client_id", project.client_id).limit(100),
       ]);
       for (const result of [clientBriefing, brandBriefing]) if (result.error) throw new Error(result.error.message);
       for (const b of clientBriefing.data ?? []) for (const body of [b.guidelines, b.target_audience]) if (body?.trim()) briefings.push({ id: b.id, body, sourceKind: "client_briefing" });
       for (const b of brandBriefing.data ?? []) if (b.raw_text?.trim()) briefings.push({ id: b.id, body: b.raw_text, sourceKind: "brand_briefing" });
     }
     const flattened = [...jobRows.flatMap(j => tasks.rows.filter(t => t.job_id === j.id)), ...tasks.rows.filter(t => !t.job_id)];
    return {
      project, blueprint: { description: project.description, ownerId: project.owner_id,
         participants: participants.rows.map(p => p.user_id), texts: [] as Array<{ level: "project" | "job" | "task"; kind: "description" | "comment"; body: string; jobIndex?: number; taskIndex?: number }>,
        jobs: jobRows.map(j => ({ name: j.name, description: j.description, color: j.color, assigneeId: j.assignee_id, estimatedMinutes: j.estimated_minutes,
           tasks: tasks.rows.filter(t => t.job_id === j.id).map(t => ({ title: t.title, description: t.description, priority: t.priority, estimatedMinutes: t.estimated_minutes, assigneeId: t.assignee_id })) })),
         directTasks: tasks.rows.filter(t => !t.job_id).map(t => ({ title: t.title, description: t.description, priority: t.priority, estimatedMinutes: t.estimated_minutes, assigneeId: t.assignee_id })),
      },
       truncated: jobs.truncated || tasks.truncated || participants.truncated || comments.truncated,
       candidates: [
         ...comments.rows.map(c => ({ id: c.id, sourceKind: "work_comment" as const, body: c.body, level: c.job_id ? "job" as const : "project" as const, jobIndex: c.job_id ? jobRows.findIndex(j => j.id === c.job_id) : undefined })),
         ...taskComments.map(c => ({ id: c.id, sourceKind: "task_comment" as const, body: c.body, level: "task" as const, taskIndex: flattened.findIndex(t => t.id === c.task_id) })),
         ...briefings.map(b => ({ ...b, level: "project" as const })),
       ].filter(c => c.level !== "job" || (c.jobIndex ?? -1) >= 0),
    };
  });
