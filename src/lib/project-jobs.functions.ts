import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { TASK_PRIORITIES, TASK_STATUSES, type TaskPriority, type TaskStatus } from "@/lib/tasks.functions";
import type { Json } from "@/integrations/supabase/types";
import sanitizeHtml from "sanitize-html";
import { callRpc } from "@/lib/supabase-rpc";

export type ProjectJob = {
  id: string;
  project_id: string;
  brand_id: string;
  name: string;
  description: string | null;
  color: string | null;
  position: number;
  assignee_id: string | null;
  start_date: string | null;
  due_at: string | null;
  status_id: string | null;
  job_number: number;
  estimated_minutes: number | null;
  done_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

const JOB_SELECT =
  "id, project_id, brand_id, name, description, color, position, assignee_id, start_date, due_at, status_id, job_number, estimated_minutes, done_at, archived_at, created_at, updated_at";

export const listJobsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        brandId: z.string().uuid(),
        projectId: z.string().uuid(),
        // Jobs concluídos são arquivados e saem da lista ativa por padrão.
        archive: z.enum(["active", "archived", "all"]).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<ProjectJob[]> => {
    const archive = data.archive ?? "active";
    let q = context.supabase
      .from("project_jobs")
      .select(JOB_SELECT)
      .eq("brand_id", data.brandId)
      .eq("project_id", data.projectId)
      .order("position", { ascending: true });
    if (archive === "active") q = q.is("archived_at", null);
    else if (archive === "archived") q = q.not("archived_at", "is", null);
    const { data: rows, error } = await q;
    if (error) throw error;
    return (rows ?? []) as ProjectJob[];
  });

export const createJobFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        brandId: z.string().uuid(),
        projectId: z.string().uuid(),
        name: z.string().trim().min(1).max(120),
        color: z.string().max(20).nullable().optional(),
        assigneeId: z.string().uuid().nullable().optional(),
        dueAt: z.string().nullable().optional(),
        statusId: z.string().uuid().nullable().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: max } = await context.supabase
      .from("project_jobs")
      .select("position")
      .eq("project_id", data.projectId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextPos = ((max as { position: number } | null)?.position ?? -1) + 1;
    const { data: row, error } = await context.supabase
      .from("project_jobs")
      .insert({
        brand_id: data.brandId,
        project_id: data.projectId,
        name: data.name,
        color: data.color ?? "#8b5cf6",
        assignee_id: data.assigneeId ?? null,
        due_at: data.dueAt ?? null,
        status_id: data.statusId ?? null,
        position: nextPos,
      } as never)
      .select("id")
      .single();
    if (error) throw error;
    return { id: (row as { id: string }).id };
  });

export const updateJobFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        brandId: z.string().uuid(),
        jobId: z.string().uuid(),
        patch: z
          .object({
            name: z.string().trim().min(1).max(120).optional(),
            description: z.string().max(100000).nullable().optional(),
            color: z.string().max(20).nullable().optional(),
            position: z.number().int().optional(),
            assignee_id: z.string().uuid().nullable().optional(),
            start_date: z.string().nullable().optional(),
            due_at: z.string().nullable().optional(),
            status_id: z.string().uuid().nullable().optional(),
            estimated_minutes: z.number().int().min(0).nullable().optional(),
          })
          .partial(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const patch = { ...data.patch };
    if (typeof patch.description === "string") {
      patch.description = sanitizeHtml(patch.description, {
        allowedTags: ["p", "br", "strong", "b", "em", "i", "u", "s", "a", "span", "mark", "ul", "ol", "li", "pre", "code", "h2", "h3", "blockquote", "img"],
        allowedAttributes: { a: ["href", "target", "rel"], span: ["style"], mark: ["style"], img: ["src", "alt", "title"] },
        allowedSchemes: ["https", "mailto"],
        allowedStyles: { "*": { color: [/^#[0-9a-f]{3,8}$/i], "background-color": [/^#[0-9a-f]{3,8}$/i] } },
        transformTags: { a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer", target: "_blank" }) },
      });
    }
    const { error } = await context.supabase
      .from("project_jobs")
      .update(patch as never)
      .eq("id", data.jobId)
      .eq("brand_id", data.brandId);
    if (error) throw error;
    return { ok: true };
  });

export const deleteJobFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ brandId: z.string().uuid(), jobId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("project_jobs")
      .delete()
      .eq("id", data.jobId)
      .eq("brand_id", data.brandId);
    if (error) throw error;
    return { ok: true };
  });

export const duplicateJobFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ brandId: z.string().uuid(), jobId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: duplicatedId, error } = await callRpc<string>(
      context.supabase,
      "duplicate_project_job",
      { _job_id: data.jobId, _brand_id: data.brandId },
    );
    if (error) throw new Error(error.message);
    if (!duplicatedId) throw new Error("Não foi possível duplicar o job.");
    return { id: duplicatedId };
  });

export type JobTask = {
  id: string;
  job_id: string | null;
  project_id: string | null;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee_id: string | null;
  due_at: string | null;
  start_date: string | null;
  status_id: string | null;
  done: boolean;
  done_at: string | null;
  archived_at: string | null;
  estimated_minutes: number | null;
  total_minutes: number;
  position: number;
};

export type JobTimeRollup = {
  jobId: string;
  minutes: number;
  running: boolean;
};

export const listJobTimeRollupsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ brandId: z.string().uuid(), projectId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }): Promise<JobTimeRollup[]> => {
    const { data: jobs, error: jobsError } = await context.supabase
      .from("project_jobs")
      .select("id")
      .eq("brand_id", data.brandId)
      .eq("project_id", data.projectId);
    if (jobsError) throw jobsError;
    const jobIds = ((jobs ?? []) as Array<{ id: string }>).map((job) => job.id);
    if (jobIds.length === 0) return [];

    const { data: taskRows, error: taskError } = await context.supabase
      .from("tasks")
      .select("id, job_id")
      .eq("brand_id", data.brandId)
      .eq("project_id", data.projectId)
      .in("job_id", jobIds);
    if (taskError) throw taskError;
    const tasks = (taskRows ?? []) as Array<{ id: string; job_id: string | null }>;
    const taskToJob = new Map(tasks.map((task) => [task.id, task.job_id]));
    const taskIds = tasks.map((task) => task.id);

    const directQuery = context.supabase
      .from("task_time_entries")
      .select("job_id, task_id, minutes, seconds, started_at, ended_at")
      .eq("brand_id", data.brandId)
      .in("job_id", jobIds);
    const taskQuery = taskIds.length
      ? context.supabase
          .from("task_time_entries")
          .select("job_id, task_id, minutes, seconds, started_at, ended_at")
          .eq("brand_id", data.brandId)
          .in("task_id", taskIds)
      : Promise.resolve({ data: [], error: null });
    const [directResult, taskResult] = await Promise.all([directQuery, taskQuery]);
    if (directResult.error) throw directResult.error;
    if (taskResult.error) throw taskResult.error;

    const rows = [...(directResult.data ?? []), ...(taskResult.data ?? [])] as Array<{
      job_id: string | null;
      task_id: string | null;
      minutes: number | null;
      seconds: number | null;
      started_at: string;
      ended_at: string | null;
    }>;
    const totals = new Map<string, JobTimeRollup>(
      jobIds.map((jobId) => [jobId, { jobId, minutes: 0, running: false }]),
    );
    const now = Date.now();
    for (const row of rows) {
      const jobId = row.job_id ?? (row.task_id ? taskToJob.get(row.task_id) : null);
      if (!jobId) continue;
      const total = totals.get(jobId);
      if (!total) continue;
      const seconds = row.ended_at
        ? (row.seconds ?? (row.minutes ?? 0) * 60)
        : Math.max(0, Math.floor((now - new Date(row.started_at).getTime()) / 1000));
      total.minutes += Math.floor(seconds / 60);
      if (!row.ended_at) total.running = true;
    }
    return Array.from(totals.values());
  });

export const listProjectTasksFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        brandId: z.string().uuid(),
        projectId: z.string().uuid(),
        archive: z.enum(["active", "archived", "all"]).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<JobTask[]> => {
    const { data: rows, error } = await context.supabase
      .from("tasks")
      .select(
        "id, job_id, project_id, title, status, priority, assignee_id, due_at, start_date, status_id, done, done_at, archived_at, estimated_minutes, total_minutes, position",
      )
      .eq("brand_id", data.brandId)
      .eq("project_id", data.projectId)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw error;
    const archive = data.archive ?? "all";
    const list = (rows ?? []) as JobTask[];
    if (archive === "active") return list.filter((t) => !t.archived_at);
    if (archive === "archived") return list.filter((t) => !!t.archived_at);
    return list;
  });

export const createJobTaskFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        brandId: z.string().uuid(),
        projectId: z.string().uuid(),
        jobId: z.string().uuid().nullable().optional(),
        title: z.string().trim().min(1).max(200),
        // Prazo opcional informado na criação rápida. Antes ficava de fora do
        // validador e o Zod descartava a chave em silêncio: a tarefa nascia
        // sem data e a lista não tinha o que exibir.
        due_at: z.string().min(1).nullable().optional(),
        assigneeId: z.string().uuid().nullable().optional(),
        estimatedMinutes: z.number().int().min(0).nullable().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    // fetch project brand/client for consistency
    const { data: proj } = await context.supabase
      .from("projects")
      .select("client_id")
      .eq("id", data.projectId)
      .maybeSingle();
    const { data: row, error } = await context.supabase
      .from("tasks")
      .insert({
        brand_id: data.brandId,
        client_id: (proj as { client_id: string | null } | null)?.client_id ?? null,
        project_id: data.projectId,
        job_id: data.jobId ?? null,
        title: data.title,
        due_at: data.due_at ?? null,
        status: "todo",
        priority: "medium",
        assignee_id: data.assigneeId ?? context.userId,
        estimated_minutes: data.estimatedMinutes ?? null,
        created_by: context.userId,
      } as never)
      .select("id")
      .single();
    if (error) throw error;
    return { id: (row as { id: string }).id };
  });

export const updateJobTaskFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        brandId: z.string().uuid(),
        taskId: z.string().uuid(),
        patch: z
          .object({
            title: z.string().trim().min(1).max(200).optional(),
            job_id: z.string().uuid().nullable().optional(),
             status: z.enum(TASK_STATUSES).optional(),
             priority: z.enum(TASK_PRIORITIES).optional(),
            assignee_id: z.string().uuid().nullable().optional(),
            estimated_minutes: z.number().int().min(0).nullable().optional(),
            due_at: z.string().nullable().optional(),
            start_date: z.string().nullable().optional(),
            status_id: z.string().uuid().nullable().optional(),
            done: z.boolean().optional(),
          })
          .partial(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    // Concluir = marca conclusão e arquiva; reabrir desfaz os dois.
    const patch: Record<string, unknown> = { ...data.patch };
    if (patch.done === true) {
      patch.status = "done";
      patch.done_at = new Date().toISOString();
      patch.archived_at = new Date().toISOString();
    } else if (patch.done === false) {
      patch.done_at = null;
      patch.archived_at = null;
      if (!patch.status) patch.status = "todo";
    }
    const { error } = await context.supabase
      .from("tasks")
      .update(patch as never)
      .eq("id", data.taskId)
      .eq("brand_id", data.brandId);
    if (error) throw error;
    return { ok: true };
  });

/** Concluir/reabrir um job: conclusão arquiva automaticamente. */
export const setJobDoneFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        brandId: z.string().uuid(),
        jobId: z.string().uuid(),
        done: z.boolean(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const now = new Date().toISOString();
    const { data: rows, error } = await context.supabase
      .from("project_jobs")
      .update(
        (data.done
          ? { done_at: now, archived_at: now }
          : { done_at: null, archived_at: null }) as never,
      )
      .eq("id", data.jobId)
      .eq("brand_id", data.brandId)
      .select("id");
    if (error) throw error;
    if (!rows || rows.length === 0) throw new Error("Forbidden: job fora do seu escopo");
    return { ok: true };
  });

/**
 * Arquiva/restaura um job SEM mexer na conclusão — "arquivar" só tira o job
 * das listas ativas; "concluir" continua sendo outra ação (`setJobDoneFn`).
 */
export const setJobArchivedFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        brandId: z.string().uuid(),
        jobId: z.string().uuid(),
        archived: z.boolean(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("project_jobs")
      .update({ archived_at: data.archived ? new Date().toISOString() : null } as never)
      .eq("id", data.jobId)
      .eq("brand_id", data.brandId)
      .select("id");
    if (error) throw error;
    if (!rows || rows.length === 0) throw new Error("Forbidden: job fora do seu escopo");
    return { ok: true };
  });

export type JobActivity = {
  id: string;
  actor_id: string | null;
  actor_name: string | null;
  entity_type: string;
  verb: string;
  payload: Json | null;
  created_at: string;
};

export type ProjectOverviewJob = ProjectJob & {
  taskTotal: number;
  taskDone: number;
  minutes: number;
  running: boolean;
  participantIds: string[];
};

export type ProjectOverviewActivity = JobActivity & {
  entity_id: string | null;
};

export type ProjectOverviewData = {
  jobs: ProjectOverviewJob[];
  totalMinutes: number;
  running: boolean;
  activity: ProjectOverviewActivity[];
};

/** Leitura única e autenticada para o resumo operacional do projeto. */
export const getProjectOverviewFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ brandId: z.string().uuid(), projectId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }): Promise<ProjectOverviewData> => {
    const { data: project, error: projectError } = await context.supabase
      .from("projects")
      .select("id")
      .eq("brand_id", data.brandId)
      .eq("id", data.projectId)
      .maybeSingle();
    if (projectError) throw projectError;
    if (!project) throw new Error("Projeto não encontrado ou fora do seu escopo.");

    const [jobsResult, tasksResult] = await Promise.all([
      context.supabase
        .from("project_jobs")
        .select(JOB_SELECT)
        .eq("brand_id", data.brandId)
        .eq("project_id", data.projectId)
        .is("archived_at", null)
        .order("position", { ascending: true }),
      context.supabase
        .from("tasks")
        .select("id, job_id, assignee_id, status, done, archived_at")
        .eq("brand_id", data.brandId)
        .eq("project_id", data.projectId),
    ]);
    if (jobsResult.error) throw jobsResult.error;
    if (tasksResult.error) throw tasksResult.error;

    const jobs = (jobsResult.data ?? []) as ProjectJob[];
    const jobIds = jobs.map((job) => job.id);
    const tasks = (tasksResult.data ?? []) as Array<{
      id: string;
      job_id: string | null;
      assignee_id: string | null;
      status: string;
      done: boolean;
      archived_at: string | null;
    }>;
    const taskIds = tasks.map((task) => task.id);
    const taskToJob = new Map(tasks.map((task) => [task.id, task.job_id]));

    const emptyResult = Promise.resolve({ data: [], error: null });
    const [directTime, taskTime, projectActivity, jobActivity, taskActivity] = await Promise.all([
      jobIds.length
        ? context.supabase
            .from("task_time_entries")
            .select("job_id, task_id, minutes, seconds, started_at, ended_at")
            .eq("brand_id", data.brandId)
            .in("job_id", jobIds)
        : emptyResult,
      taskIds.length
        ? context.supabase
            .from("task_time_entries")
            .select("job_id, task_id, minutes, seconds, started_at, ended_at")
            .eq("brand_id", data.brandId)
            .in("task_id", taskIds)
        : emptyResult,
      context.supabase
        .from("activity_events")
        .select("id, actor_id, entity_type, entity_id, verb, payload, created_at")
        .eq("brand_id", data.brandId)
        .eq("entity_type", "project")
        .eq("entity_id", data.projectId)
        .order("created_at", { ascending: false })
        .limit(20),
      jobIds.length
        ? context.supabase
            .from("activity_events")
            .select("id, actor_id, entity_type, entity_id, verb, payload, created_at")
            .eq("brand_id", data.brandId)
            .eq("entity_type", "job")
            .in("entity_id", jobIds)
            .order("created_at", { ascending: false })
            .limit(40)
        : emptyResult,
      taskIds.length
        ? context.supabase
            .from("activity_events")
            .select("id, actor_id, entity_type, entity_id, verb, payload, created_at")
            .eq("brand_id", data.brandId)
            .eq("entity_type", "task")
            .in("entity_id", taskIds)
            .order("created_at", { ascending: false })
            .limit(40)
        : emptyResult,
    ]);
    for (const result of [directTime, taskTime, projectActivity, jobActivity, taskActivity]) {
      if (result.error) throw result.error;
    }

    const taskStats = new Map<string, { total: number; done: number; participants: Set<string> }>();
    for (const task of tasks) {
      if (!task.job_id || task.archived_at) continue;
      const current = taskStats.get(task.job_id) ?? { total: 0, done: 0, participants: new Set<string>() };
      current.total += 1;
      if (task.done || task.status === "done") current.done += 1;
      if (task.assignee_id) current.participants.add(task.assignee_id);
      taskStats.set(task.job_id, current);
    }

    const rollups = new Map(jobIds.map((jobId) => [jobId, { minutes: 0, running: false }]));
    const now = Date.now();
    const timeRows = [...(directTime.data ?? []), ...(taskTime.data ?? [])] as Array<{
      job_id: string | null;
      task_id: string | null;
      minutes: number | null;
      seconds: number | null;
      started_at: string;
      ended_at: string | null;
    }>;
    for (const row of timeRows) {
      const jobId = row.job_id ?? (row.task_id ? taskToJob.get(row.task_id) : null);
      if (!jobId) continue;
      const rollup = rollups.get(jobId);
      if (!rollup) continue;
      const seconds = row.ended_at
        ? (row.seconds ?? (row.minutes ?? 0) * 60)
        : Math.max(0, Math.floor((now - new Date(row.started_at).getTime()) / 1000));
      rollup.minutes += Math.floor(seconds / 60);
      if (!row.ended_at) rollup.running = true;
    }

    const rawEvents = [
      ...(projectActivity.data ?? []),
      ...(jobActivity.data ?? []),
      ...(taskActivity.data ?? []),
    ] as Array<Omit<ProjectOverviewActivity, "actor_name">>;
    const latestEvents = rawEvents
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 8);
    const actorIds = Array.from(
      new Set(latestEvents.map((event) => event.actor_id).filter((id): id is string => !!id)),
    );
    const { data: profiles, error: profilesError } = actorIds.length
      ? await context.supabase.from("user_profiles").select("id, full_name").in("id", actorIds)
      : { data: [], error: null };
    if (profilesError) throw profilesError;
    const actorNames = new Map(
      ((profiles ?? []) as Array<{ id: string; full_name: string | null }>).map((profile) => [
        profile.id,
        profile.full_name,
      ]),
    );

    const overviewJobs = jobs.map((job): ProjectOverviewJob => {
      const stats = taskStats.get(job.id);
      const rollup = rollups.get(job.id) ?? { minutes: 0, running: false };
      return {
        ...job,
        taskTotal: stats?.total ?? 0,
        taskDone: stats?.done ?? 0,
        minutes: rollup.minutes,
        running: rollup.running,
        participantIds: Array.from(
          new Set([job.assignee_id, ...(stats?.participants ?? [])].filter((id): id is string => !!id)),
        ),
      };
    });

    return {
      jobs: overviewJobs,
      totalMinutes: overviewJobs.reduce((sum, job) => sum + job.minutes, 0),
      running: overviewJobs.some((job) => job.running),
      activity: latestEvents.map((event) => ({
        ...event,
        actor_name: event.actor_id ? actorNames.get(event.actor_id) ?? null : null,
      })),
    };
  });

export const listJobActivityFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ brandId: z.string().uuid(), jobId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<JobActivity[]> => {
    const { data: taskRows, error: taskError } = await context.supabase
      .from("tasks")
      .select("id")
      .eq("brand_id", data.brandId)
      .eq("job_id", data.jobId);
    if (taskError) throw taskError;
    const taskIds = ((taskRows ?? []) as Array<{ id: string }>).map((task) => task.id);
    let query = context.supabase
      .from("activity_events")
      .select("id, actor_id, entity_type, entity_id, verb, payload, created_at")
      .eq("brand_id", data.brandId)
      .order("created_at", { ascending: false })
      .limit(200);
    query = taskIds.length
      ? query.or(`and(entity_type.eq.job,entity_id.eq.${data.jobId}),and(entity_type.eq.task,entity_id.in.(${taskIds.join(",")}))`)
      : query.eq("entity_type", "job").eq("entity_id", data.jobId);
    const { data: rows, error } = await query;
    if (error) throw error;
    const events = (rows ?? []) as Array<Omit<JobActivity, "actor_name"> & { entity_id: string | null }>;
    const actorIds = Array.from(new Set(events.map((event) => event.actor_id).filter((id): id is string => id != null)));
    const { data: profiles } = actorIds.length
      ? await context.supabase.from("user_profiles").select("id, full_name").in("id", actorIds)
      : { data: [] };
    const names = new Map(((profiles ?? []) as Array<{ id: string; full_name: string | null }>).map((profile) => [profile.id, profile.full_name]));
    return events.map((event) => ({ ...event, actor_name: event.actor_id ? names.get(event.actor_id) ?? null : null }));
  });
