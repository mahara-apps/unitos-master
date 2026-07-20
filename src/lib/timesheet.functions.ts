import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type TimeEntry = {
  id: string;
  task_id: string;
  user_id: string;
  brand_id: string;
  started_at: string;
  ended_at: string | null;
  minutes: number | null;
  description: string | null;
  is_rework: boolean;
  source: "timer" | "manual";
  user_name?: string | null;
};

export const listTimeEntriesFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ brandId: z.string().uuid(), taskId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }): Promise<TimeEntry[]> => {
    const { data: rows, error } = await context.supabase
      .from("task_time_entries")
      .select("id, task_id, user_id, brand_id, started_at, ended_at, minutes, description, is_rework, source")
      .eq("brand_id", data.brandId)
      .eq("task_id", data.taskId)
      .order("started_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    const entries = (rows ?? []) as TimeEntry[];
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
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("task_time_entries")
      .select("id, task_id, started_at, brand_id")
      .eq("brand_id", data.brandId)
      .eq("user_id", context.userId)
      .is("ended_at", null)
      .maybeSingle();
    if (error) throw error;
    return row as { id: string; task_id: string; started_at: string; brand_id: string } | null;
  });

export const startTimerFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ brandId: z.string().uuid(), taskId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: id, error } = await context.supabase.rpc("start_timer", {
      _task_id: data.taskId,
      _brand_id: data.brandId,
    });
    if (error) throw error;
    const { data: row, error: rowError } = await context.supabase
      .from("task_time_entries")
      .select("id, task_id, started_at, brand_id")
      .eq("id", id as string)
      .single();
    if (rowError) throw rowError;
    return row as { id: string; task_id: string; started_at: string; brand_id: string };
  });

export const stopTimerFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ entryId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: mins, error } = await context.supabase.rpc("stop_timer", {
      _entry_id: data.entryId,
    });
    if (error) throw error;
    return { minutes: (mins as number) ?? 0 };
  });

export const addManualEntryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        brandId: z.string().uuid(),
        taskId: z.string().uuid(),
        minutes: z.number().int().min(1).max(60 * 24),
        description: z.string().max(500).nullable().optional(),
        isRework: z.boolean().optional(),
        startedAt: z.string().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const started = data.startedAt ? new Date(data.startedAt) : new Date();
    const ended = new Date(started.getTime() + data.minutes * 60_000);
    const { data: row, error } = await context.supabase
      .from("task_time_entries")
      .insert({
        brand_id: data.brandId,
        task_id: data.taskId,
        user_id: context.userId,
        started_at: started.toISOString(),
        ended_at: ended.toISOString(),
        minutes: data.minutes,
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