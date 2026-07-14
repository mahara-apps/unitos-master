import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CalendarPost = {
  id: string;
  title: string;
  scheduled_at: string;
  channels: string[];
  cover_url: string | null;
  client_id: string;
  brand_id: string;
  stage_id: string | null;
  review_status: string | null;
  ai_phase: string | null;
  format: string | null;
  assignee: { id: string; full_name: string | null; avatar_url: string | null } | null;
};

export const listScheduledPostsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        brandId: z.string().uuid(),
        clientId: z.string().uuid().nullable().optional(),
        from: z.string(), // ISO
        to: z.string(), // ISO
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<CalendarPost[]> => {
    let q = context.supabase
      .from("posts")
      .select(
        "id,title,scheduled_at,channels,cover_url,client_id,brand_id,stage_id,review_status,ai_phase,format,assignee_id",
      )
      .eq("brand_id", data.brandId)
      .is("deleted_at", null)
      .not("scheduled_at", "is", null)
      .gte("scheduled_at", data.from)
      .lte("scheduled_at", data.to)
      .order("scheduled_at", { ascending: true });
    if (data.clientId) q = q.eq("client_id", data.clientId);
    const { data: rows, error } = await q;
    if (error) throw error;
    const list = rows ?? [];
    const ids = Array.from(
      new Set(list.map((r) => r.assignee_id).filter((v): v is string => !!v)),
    );
    const profiles = ids.length
      ? (
          await context.supabase
            .from("user_profiles")
            .select("id, full_name, avatar_url")
            .in("id", ids)
        ).data ?? []
      : [];
    const map = new Map(profiles.map((p) => [p.id, p]));
    return list.map((r) => ({
      id: r.id,
      title: r.title,
      scheduled_at: r.scheduled_at as string,
      channels: (r.channels ?? []) as string[],
      cover_url: r.cover_url,
      client_id: r.client_id,
      brand_id: r.brand_id,
      stage_id: r.stage_id,
      review_status: r.review_status,
      ai_phase: r.ai_phase,
      format: r.format,
      assignee: r.assignee_id ? map.get(r.assignee_id) ?? null : null,
    }));
  });

export const rescheduleFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        postId: z.string().uuid(),
        scheduledAt: z.string().nullable(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("posts")
      .update({ scheduled_at: data.scheduledAt } as never)
      .eq("id", data.postId);
    if (error) throw error;
    return { ok: true };
  });