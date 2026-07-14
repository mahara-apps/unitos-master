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
  pipeline_id: string | null;
  stage_id: string | null;
  review_status: string | null;
  ai_phase: string | null;
  format: string | null;
  author: { id: string; name: string | null; avatar_url: string | null } | null;
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
        "id,title,scheduled_at,channels,cover_url,client_id,brand_id,pipeline_id,stage_id,review_status,ai_phase,format,created_by",
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
    const posts = (rows ?? []) as Array<Omit<CalendarPost, "author"> & { created_by: string | null }>;
    const userIds = Array.from(
      new Set(posts.map((p) => p.created_by).filter((v): v is string => !!v)),
    );
    let authors = new Map<string, { id: string; name: string | null; avatar_url: string | null }>();
    if (userIds.length) {
      const { data: profs } = await context.supabase
        .from("user_profiles")
        .select("id,full_name,avatar_url")
        .in("id", userIds);
      authors = new Map(
        (profs ?? []).map((p) => [p.id, { id: p.id, name: p.full_name, avatar_url: p.avatar_url }]),
      );
    }
    return posts.map(({ created_by, ...rest }) => ({
      ...rest,
      author: created_by ? authors.get(created_by) ?? null : null,
    }));
  });