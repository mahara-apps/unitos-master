import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CalendarEvent = {
  id: string;
  brand_id: string | null;
  client_id: string | null;
  type: "appointment" | "seasonal";
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  is_global: boolean;
  color: string | null;
  created_by: string | null;
};

export const listCalendarEventsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        brandId: z.string().uuid(),
        clientId: z.string().uuid().nullable().optional(),
        from: z.string(),
        to: z.string(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<CalendarEvent[]> => {
    // Brand-scoped events + all global seasonal events in the range.
    // RLS already filters visibility; the OR here is a range filter.
    const q = context.supabase
      .from("calendar_events")
      .select(
        "id,brand_id,client_id,type,title,description,starts_at,ends_at,all_day,is_global,color,created_by",
      )
      .gte("starts_at", data.from)
      .lte("starts_at", data.to)
      .or(`brand_id.eq.${data.brandId},is_global.eq.true`)
      .order("starts_at", { ascending: true });
    const { data: rows, error } = await q;
    if (error) throw error;
    // Additional client-side filter: when a client is selected, hide events
    // that belong to a different client of the same brand.
    const filtered = (rows ?? []).filter((r) => {
      if (r.is_global) return true;
      if (!data.clientId) return true;
      // Show events with matching client_id OR brand-wide (client_id null).
      return r.client_id === data.clientId || r.client_id === null;
    });
    return filtered as CalendarEvent[];
  });

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  brandId: z.string().uuid().nullable(),
  clientId: z.string().uuid().nullable().optional(),
  type: z.enum(["appointment", "seasonal"]),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  startsAt: z.string(),
  endsAt: z.string().nullable().optional(),
  allDay: z.boolean().default(false),
  isGlobal: z.boolean().default(false),
  color: z.string().max(32).nullable().optional(),
});

export const upsertCalendarEventFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => upsertSchema.parse(i))
  .handler(async ({ data, context }): Promise<CalendarEvent> => {
    const payload = {
      brand_id: data.isGlobal ? null : data.brandId,
      client_id: data.isGlobal ? null : data.clientId ?? null,
      type: data.type,
      title: data.title,
      description: data.description ?? null,
      starts_at: data.startsAt,
      ends_at: data.endsAt ?? null,
      all_day: data.allDay,
      is_global: data.isGlobal,
      color: data.color ?? null,
      created_by: context.userId,
    };
    if (data.id) {
      const { data: row, error } = await context.supabase
        .from("calendar_events")
        .update(payload)
        .eq("id", data.id)
        .select(
          "id,brand_id,client_id,type,title,description,starts_at,ends_at,all_day,is_global,color,created_by",
        )
        .single();
      if (error) throw error;
      return row as CalendarEvent;
    }
    const { data: row, error } = await context.supabase
      .from("calendar_events")
      .insert(payload)
      .select(
        "id,brand_id,client_id,type,title,description,starts_at,ends_at,all_day,is_global,color,created_by",
      )
      .single();
    if (error) throw error;
    return row as CalendarEvent;
  });

export const deleteCalendarEventFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("calendar_events")
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });