import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CalendarPost = {
  id: string;
  post_id: string;
  placement_id: string | null;
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
  status: string | null;
  published_at: string | null;
  is_multi_placement: boolean;
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
    // Read from post_placements — each placement is a discrete calendar entry.
    let plq = context.supabase
      .from("post_placements")
      .select("id,post_id,brand_id,client_id,format,scheduled_at,status,published_at")
      .eq("brand_id", data.brandId)
      // Only confirmed calendar entries: scheduled or already published.
      // Drafts with a date live in the Kanban / pending panels, not here.
      .in("status", ["scheduled", "published"])
      .not("scheduled_at", "is", null)
      .gte("scheduled_at", data.from)
      .lte("scheduled_at", data.to)
      .order("scheduled_at", { ascending: true });
    if (data.clientId) plq = plq.eq("client_id", data.clientId);
    const { data: placements, error: plErr } = await plq;
    if (plErr) throw plErr;

    const placementPostIds = Array.from(
      new Set((placements ?? []).map((p) => p.post_id as string)),
    );

    // Fallback: peças com data agendada mas SEM placement (ex.: agendamento
    // interno/materialização da pauta) também precisam aparecer no calendário.
    let dq = context.supabase
      .from("posts")
      .select(
        "id,title,channels,cover_url,client_id,brand_id,pipeline_id,stage_id,review_status,ai_phase,created_by,stage,scheduled_at,published_at",
      )
      .eq("brand_id", data.brandId)
      .is("deleted_at", null)
      .not("scheduled_at", "is", null)
      .gte("scheduled_at", data.from)
      .lte("scheduled_at", data.to)
      .in("stage", ["approved", "scheduled", "published"]);
    if (data.clientId) dq = dq.eq("client_id", data.clientId);
    const { data: datedPosts, error: dErr } = await dq;
    if (dErr) throw dErr;
    const orphanPosts = (datedPosts ?? []).filter(
      (p) => !placementPostIds.includes(p.id as string),
    );

    const postIds = Array.from(
      new Set([...placementPostIds, ...orphanPosts.map((p) => p.id as string)]),
    );
    if (postIds.length === 0) return [];

    const { data: postsData, error } = await context.supabase
      .from("posts")
      .select(
        "id,title,channels,cover_url,client_id,brand_id,pipeline_id,stage_id,review_status,ai_phase,created_by",
      )
      .in("id", postIds)
      .is("deleted_at", null);
    if (error) throw error;
    const postById = new Map((postsData ?? []).map((p) => [p.id as string, p]));


    // Count placements per post to flag multi-placement
    const placementCountByPost = new Map<string, number>();
    (placements ?? []).forEach((pl) => {
      placementCountByPost.set(pl.post_id as string, (placementCountByPost.get(pl.post_id as string) ?? 0) + 1);
    });

    const userIds = Array.from(
      new Set((postsData ?? []).map((p) => p.created_by).filter((v): v is string => !!v)),
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

    const fromPlacements = (placements ?? [])
      .map((pl) => {
        const post = postById.get(pl.post_id as string);
        if (!post || !pl.scheduled_at) return null;
        return {
          id: pl.id as string,
          placement_id: pl.id as string,
          post_id: pl.post_id as string,
          title: post.title as string,
          scheduled_at: pl.scheduled_at as string,
          channels: (post.channels as string[]) ?? [],
          cover_url: (post.cover_url as string | null) ?? null,
          client_id: post.client_id as string,
          brand_id: post.brand_id as string,
          pipeline_id: (post.pipeline_id as string | null) ?? null,
          stage_id: (post.stage_id as string | null) ?? null,
          review_status: (post.review_status as string | null) ?? null,
          ai_phase: (post.ai_phase as string | null) ?? null,
          format: pl.format as string,
          status: (pl.status as string | null) ?? null,
          published_at: (pl.published_at as string | null) ?? null,
          is_multi_placement: (placementCountByPost.get(pl.post_id as string) ?? 1) > 1,
          author: post.created_by ? authors.get(post.created_by as string) ?? null : null,
        } as CalendarPost;
      })
      .filter((v): v is CalendarPost => v !== null);

    // Peças datadas sem placement: entrada virtual (placement_id nulo).
    const fromPosts = orphanPosts.map((p) => ({
      id: `post:${p.id as string}`,
      placement_id: null,
      post_id: p.id as string,
      title: p.title as string,
      scheduled_at: p.scheduled_at as string,
      channels: (p.channels as string[]) ?? [],
      cover_url: (p.cover_url as string | null) ?? null,
      client_id: p.client_id as string,
      brand_id: p.brand_id as string,
      pipeline_id: (p.pipeline_id as string | null) ?? null,
      stage_id: (p.stage_id as string | null) ?? null,
      review_status: (p.review_status as string | null) ?? null,
      ai_phase: (p.ai_phase as string | null) ?? null,
      format: null,
      status: p.published_at ? "published" : "scheduled",
      published_at: (p.published_at as string | null) ?? null,
      is_multi_placement: false,
      author: p.created_by ? authors.get(p.created_by as string) ?? null : null,
    })) as CalendarPost[];

    return [...fromPlacements, ...fromPosts].sort((a, b) =>
      a.scheduled_at.localeCompare(b.scheduled_at),
    );
  });
