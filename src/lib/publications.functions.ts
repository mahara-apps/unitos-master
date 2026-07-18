import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PublicationRow = {
  id: string;
  brandId: string;
  provider: string;
  placement: string;
  status: string;
  caption: string | null;
  scheduledAt: string | null;
  publishedAt: string | null;
  externalPermalink: string | null;
  lastError: string | null;
  createdAt: string;
  media: any;
  channelLabel: string | null;
  channelAvatarUrl: string | null;
};

const Input = z.object({
  brandId: z.string().uuid(),
  status: z
    .enum(["draft", "scheduled", "publishing", "published", "failed", "canceled"])
    .optional(),
  limit: z.number().int().min(1).max(200).default(80),
});

export const listPublicationsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Input.parse(i))
  .handler(async ({ data, context }): Promise<PublicationRow[]> => {
    let q = context.supabase
      .from("social_posts")
      .select(
        "id, brand_id, provider, placement, status, caption, scheduled_at, published_at, external_permalink, last_error, created_at, media, connection_id",
      )
      .eq("brand_id", data.brandId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    // Enrich channel label from social_connections in one query
    const connIds = Array.from(new Set((rows ?? []).map((r) => r.connection_id).filter(Boolean)));
    let labelById = new Map<string, { label: string; avatarUrl: string | null }>();
    if (connIds.length) {
      const { data: conns } = await context.supabase
        .from("social_connections")
        .select("id, external_name, account_username, metadata")
        .in("id", connIds);
      for (const c of conns ?? []) {
        const meta = (c.metadata ?? {}) as Record<string, any>;
        labelById.set(c.id, {
          label:
            c.account_username
              ? `@${c.account_username}`
              : (c.external_name ?? "Conta"),
          avatarUrl:
            meta.instagram_picture_url ?? meta.page_picture_url ?? null,
        });
      }
    }

    return (rows ?? []).map((r) => {
      const info = r.connection_id ? labelById.get(r.connection_id) : undefined;
      return {
        id: r.id,
        brandId: r.brand_id,
        provider: r.provider,
        placement: r.placement,
        status: r.status,
        caption: r.caption,
        scheduledAt: r.scheduled_at,
        publishedAt: r.published_at,
        externalPermalink: r.external_permalink,
        lastError: r.last_error,
        createdAt: r.created_at,
        media: r.media,
        channelLabel: info?.label ?? null,
        channelAvatarUrl: info?.avatarUrl ?? null,
      };
    });
  });