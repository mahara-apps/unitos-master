import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type TimeEntry = {
  id: string;
  task_id: string | null;
  job_id: string | null;
  user_id: string;
  brand_id: string;
  started_at: string;
  ended_at: string | null;
  minutes: number | null;
  seconds: number | null;
  ended_reason: string | null;
  description: string | null;
  is_rework: boolean;
  source: "timer" | "manual";
  user_name?: string | null;
  task_title?: string | null;
};

export type ActiveTimer = {
  id: string;
  task_id: string | null;
  job_id: string | null;
  started_at: string;
  brand_id: string;
  /** Tempo já transcorrido, calculado no servidor para não depender do relógio do navegador. */
  elapsed_seconds?: number;
};

export type TimerState = {
  /** Segundos já salvos (todos os apontamentos encerrados da tarefa). */
  totalSeconds: number;
  /** Segmento aberto do usuário atual (pode ser de outra tarefa). */
  active: ActiveTimer | null;
  /** true quando o último segmento do usuário nesta tarefa foi encerrado por pausa. */
  paused: boolean;
};

const ENTRY_COLUMNS =
  "id, task_id, job_id, user_id, brand_id, started_at, ended_at, minutes, seconds, ended_reason, description, is_rework, source";

export type JobTimerState = TimerState & { directSeconds: number; taskSeconds: number };

export const listJobTimeEntriesFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ brandId: z.string().uuid(), jobId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<TimeEntry[]> => {
    const { data: taskRows, error: taskError } = await context.supabase.from("tasks").select("id, title").eq("brand_id", data.brandId).eq("job_id", data.jobId);
    if (taskError) throw taskError;
    const tasks = (taskRows ?? []) as Array<{ id: string; title: string }>;
    const taskIds = tasks.map((task) => task.id);
    let query = context.supabase.from("task_time_entries").select(ENTRY_COLUMNS).eq("brand_id", data.brandId).order("started_at", { ascending: false }).limit(500);
    query = taskIds.length ? query.or(`job_id.eq.${data.jobId},task_id.in.(${taskIds.join(",")})`) : query.eq("job_id", data.jobId);
    const { data: rows, error } = await query;
    if (error) throw error;
    const entries = (rows ?? []) as unknown as TimeEntry[];
    const userIds = Array.from(new Set(entries.map((entry) => entry.user_id)));
    const { data: profiles } = userIds.length ? await context.supabase.from("user_profiles").select("id, full_name").in("id", userIds) : { data: [] };
    const names = new Map(((profiles ?? []) as Array<{ id: string; full_name: string | null }>).map((profile) => [profile.id, profile.full_name]));
    const titles = new Map(tasks.map((task) => [task.id, task.title]));
    return entries.map((entry) => ({ ...entry, user_name: names.get(entry.user_id) ?? null, task_title: entry.task_id ? titles.get(entry.task_id) ?? null : null }));
  });

export const getJobTimerStateFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ brandId: z.string().uuid(), jobId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<JobTimerState> => {
    const { data: taskRows, error: taskError } = await context.supabase.from("tasks").select("id").eq("brand_id", data.brandId).eq("job_id", data.jobId);
    if (taskError) throw taskError;
    const taskIds = ((taskRows ?? []) as Array<{ id: string }>).map((task) => task.id);
    let totalsQuery = context.supabase.from("task_time_entries").select("task_id, job_id, seconds, minutes").eq("brand_id", data.brandId).not("ended_at", "is", null);
    totalsQuery = taskIds.length ? totalsQuery.or(`job_id.eq.${data.jobId},task_id.in.(${taskIds.join(",")})`) : totalsQuery.eq("job_id", data.jobId);
    const [totalsRes, activeRes, lastRes] = await Promise.all([
      totalsQuery,
      context.supabase.from("task_time_entries").select("id, task_id, job_id, started_at, brand_id").eq("brand_id", data.brandId).eq("user_id", context.userId).is("ended_at", null).order("started_at", { ascending: false }).limit(1),
      context.supabase.from("task_time_entries").select("ended_reason").eq("brand_id", data.brandId).eq("job_id", data.jobId).eq("user_id", context.userId).not("ended_at", "is", null).order("ended_at", { ascending: false }).limit(1),
    ]);
    if (totalsRes.error) throw totalsRes.error;
    if (activeRes.error) throw activeRes.error;
    if (lastRes.error) throw lastRes.error;
    const totals = (totalsRes.data ?? []) as Array<{ task_id: string | null; job_id: string | null; seconds: number | null; minutes: number | null }>;
    const directSeconds = totals.filter((entry) => entry.job_id === data.jobId).reduce((sum, entry) => sum + entrySeconds(entry), 0);
    const taskSeconds = totals.filter((entry) => entry.task_id != null).reduce((sum, entry) => sum + entrySeconds(entry), 0);
    const activeRow = ((activeRes.data ?? [])[0] as ActiveTimer | undefined) ?? null;
    const active = activeRow ? { ...activeRow, elapsed_seconds: Math.max(0, Math.floor((Date.now() - new Date(activeRow.started_at).getTime()) / 1000)) } : null;
    return { totalSeconds: directSeconds + taskSeconds, directSeconds, taskSeconds, active, paused: active?.job_id !== data.jobId && ((lastRes.data ?? [])[0] as { ended_reason?: string } | undefined)?.ended_reason === "pause" };
  });

export const startJobTimerFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ brandId: z.string().uuid(), jobId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<ActiveTimer> => {
    const { data: id, error } = await context.supabase.rpc("start_job_timer", { _job_id: data.jobId, _brand_id: data.brandId });
    if (error) throw error;
    const { data: row, error: rowError } = await context.supabase.from("task_time_entries").select("id, task_id, job_id, started_at, brand_id").eq("id", id as string).single();
    if (rowError) throw rowError;
    return { ...(row as ActiveTimer), elapsed_seconds: 0 };
  });

function entrySeconds(e: { seconds: number | null; minutes: number | null }): number {
  if (e.seconds != null) return Math.max(0, e.seconds);
  return Math.max(0, (e.minutes ?? 0) * 60);
}

export const listTimeEntriesFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ brandId: z.string().uuid(), taskId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }): Promise<TimeEntry[]> => {
    const { data: rows, error } = await context.supabase
      .from("task_time_entries")
      .select(ENTRY_COLUMNS)
      .eq("brand_id", data.brandId)
      .eq("task_id", data.taskId)
      .order("started_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    const entries = (rows ?? []) as unknown as TimeEntry[];
    if (entries.length === 0) return [];
    const userIds = Array.from(new Set(entries.map((e) => e.user_id)));
    const { data: profs } = await context.supabase
      .from("user_profiles")
      .select("id, full_name")
      .in("id", userIds);
    const nameMap = new Map<string, string | null>();
    for (const p of (profs ?? []) as Array<{ id: string; full_name: string | null }>) {
      nameMap.set(p.id, p.full_name);
    }
    return entries.map((e) => ({ ...e, user_name: nameMap.get(e.user_id) ?? null }));
  });

export const getMyActiveTimerFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ brandId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<ActiveTimer | null> => {
    const { data: rows, error } = await context.supabase
      .from("task_time_entries")
      .select("id, task_id, job_id, started_at, brand_id")
      .eq("brand_id", data.brandId)
      .eq("user_id", context.userId)
      .is("ended_at", null)
      .order("started_at", { ascending: false })
      .limit(1);
    if (error) throw error;
    return ((rows ?? [])[0] as ActiveTimer | undefined) ?? null;
  });

/** Estado completo do timer de uma tarefa (fonte da verdade no servidor). */
export const getTimerStateFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ brandId: z.string().uuid(), taskId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }): Promise<TimerState> => {
    const [totalsRes, activeRes, lastMineRes] = await Promise.all([
      context.supabase
        .from("task_time_entries")
        .select("seconds, minutes")
        .eq("brand_id", data.brandId)
        .eq("task_id", data.taskId)
        .not("ended_at", "is", null),
      context.supabase
        .from("task_time_entries")
        .select("id, task_id, job_id, started_at, brand_id")
        .eq("brand_id", data.brandId)
        .eq("user_id", context.userId)
        .is("ended_at", null)
        .order("started_at", { ascending: false })
        .limit(1),
      context.supabase
        .from("task_time_entries")
        .select("ended_reason")
        .eq("brand_id", data.brandId)
        .eq("task_id", data.taskId)
        .eq("user_id", context.userId)
        .not("ended_at", "is", null)
        .order("ended_at", { ascending: false })
        .limit(1),
    ]);
    if (totalsRes.error) throw totalsRes.error;
    if (activeRes.error) throw activeRes.error;
    if (lastMineRes.error) throw lastMineRes.error;

    const totalSeconds = (
      (totalsRes.data ?? []) as Array<{ seconds: number | null; minutes: number | null }>
    ).reduce((sum, e) => sum + entrySeconds(e), 0);
    const activeRow = ((activeRes.data ?? [])[0] as ActiveTimer | undefined) ?? null;
    const active = activeRow
      ? {
          ...activeRow,
          elapsed_seconds: Math.max(
            0,
            Math.floor((Date.now() - new Date(activeRow.started_at).getTime()) / 1000),
          ),
        }
      : null;
    const lastReason =
      ((lastMineRes.data ?? [])[0] as { ended_reason: string | null } | undefined)?.ended_reason ??
      null;

    return {
      totalSeconds,
      active,
      paused: active?.task_id !== data.taskId && lastReason === "pause",
    };
  });

export const startTimerFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ brandId: z.string().uuid(), taskId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }): Promise<ActiveTimer> => {
    const { data: id, error } = await context.supabase.rpc("start_timer", {
      _task_id: data.taskId,
      _brand_id: data.brandId,
    });
    if (error) throw error;
    const { data: row, error: rowError } = await context.supabase
      .from("task_time_entries")
      .select("id, task_id, job_id, started_at, brand_id")
      .eq("id", id as string)
      .single();
    if (rowError) throw rowError;
    return { ...(row as ActiveTimer), elapsed_seconds: 0 };
  });

export const stopTimerFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        entryId: z.string().uuid(),
        reason: z.enum(["pause", "stop"]).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: secs, error } = await context.supabase.rpc("stop_timer", {
      _entry_id: data.entryId,
      _reason: data.reason ?? "stop",
    } as never);
    if (error) throw error;
    return { seconds: (secs as number) ?? 0 };
  });

export const addManualEntryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        brandId: z.string().uuid(),
        taskId: z.string().uuid(),
        seconds: z
          .number()
          .int()
          .min(1)
          .max(60 * 60 * 24),
        description: z.string().max(500).nullable().optional(),
        isRework: z.boolean().optional(),
        startedAt: z.string().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const started = data.startedAt ? new Date(data.startedAt) : new Date();
    const ended = new Date(started.getTime() + data.seconds * 1000);
    const { data: row, error } = await context.supabase
      .from("task_time_entries")
      .insert({
        brand_id: data.brandId,
        task_id: data.taskId,
        user_id: context.userId,
        started_at: started.toISOString(),
        ended_at: ended.toISOString(),
        seconds: data.seconds,
        minutes: Math.round(data.seconds / 60),
        ended_reason: "stop",
        description: data.description ?? null,
        is_rework: data.isRework ?? false,
        source: "manual",
      } as never)
      .select("id")
      .single();
    if (error) throw error;
    return { id: (row as { id: string }).id };
  });

export const deleteEntryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ entryId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("task_time_entries")
      .delete()
      .eq("id", data.entryId)
      .eq("user_id", context.userId);
    if (error) throw error;
    return { ok: true };
  });

export function formatMinutes(mins: number | null | undefined): string {
  const m = Math.max(0, Math.round(mins ?? 0));
  const h = Math.floor(m / 60);
  const r = m % 60;
  return `${String(h).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

/** HH:MM:SS a partir de segundos. */
export function formatSeconds(secs: number | null | undefined): string {
  const s = Math.max(0, Math.floor(secs ?? 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

/** Segundos de um apontamento (compatível com registros antigos só com minutos). */
export function entryDurationSeconds(
  e: { seconds: number | null; minutes: number | null } | null | undefined,
): number {
  if (!e) return 0;
  return entrySeconds(e);
}

/**
 * Aceita "HH:MM:SS", "HH:MM" ou minutos puros ("90"). Retorna segundos ou null.
 */
export function parseDurationToSeconds(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const hms = t.match(/^(\d{1,3}):([0-5]?\d):([0-5]?\d)$/);
  if (hms) return Number(hms[1]) * 3600 + Number(hms[2]) * 60 + Number(hms[3]);
  const hm = t.match(/^(\d{1,3}):([0-5]?\d)$/);
  if (hm) return Number(hm[1]) * 3600 + Number(hm[2]) * 60;
  const n = Number(t);
  if (Number.isFinite(n) && n > 0) return Math.round(n * 60);
  return null;
}
