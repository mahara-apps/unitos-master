import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Meta Publishing — server functions for the Meta Feed publisher.
 *
 * Client-safe file. Heavy lifting (Graph API, decrypt) is dynamically
 * imported inside handlers so it never ships to the client bundle.
 */

const PLACEMENTS = ["instagram_feed", "facebook_feed"] as const;

const MediaSchema = z.object({
  imageUrl: z.string().url().optional(),
  link: z.string().url().optional(),
});

const BasePublishSchema = z.object({
  brandId: z.string().uuid(),
  clientId: z.string().uuid().nullish(),
  connectionId: z.string().uuid(),
  placement: z.enum(PLACEMENTS),
  caption: z.string().max(2200).optional(),
  hashtags: z.array(z.string()).default([]),
  mentions: z.array(z.string()).default([]),
  media: MediaSchema,
  postId: z.string().uuid().nullish(),
});

const PublishNowSchema = BasePublishSchema;
const ScheduleSchema = BasePublishSchema.extend({
  scheduledAt: z
    .string()
    .datetime()
    .refine((v) => new Date(v).getTime() > Date.now() + 30_000, {
      message: "scheduledAt deve ser pelo menos 30s no futuro",
    }),
});

async function loadConnection(
  supabase: any,
  brandId: string,
  connectionId: string,
  clientId?: string | null,
) {
  const { data, error } = await supabase
    .from("social_connections")
    .select(
      "id, brand_id, client_id, provider, external_id, account_id, access_token_ciphertext, status",
    )
    .eq("id", connectionId)
    .eq("brand_id", brandId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Conexão não encontrada");
  if (!String(data.provider).startsWith("meta"))
    throw new Error("Conexão não é da Meta");
  if (!data.access_token_ciphertext)
    throw new Error("Conexão sem token — reconecte a página");
  // Isolamento por cliente: se o post é de um cliente específico, a conexão
  // precisa ou ser da mesma conta desse cliente, ou institucional (client_id
  // NULL — ex.: blog da agência). Nunca "primeira conexão da marca".
  if (clientId && data.client_id && data.client_id !== clientId) {
    throw new Error(
      "A conexão selecionada não pertence a este cliente. Escolha uma conta do cliente ou reconecte em /connections.",
    );
  }
  return data;
}

// ---------------------------------------------------------------------------
// publishNow
// ---------------------------------------------------------------------------
export const publishNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => PublishNowSchema.parse(i))
  .handler(async ({ data, context }) => {
    const conn = await loadConnection(
      context.supabase,
      data.brandId,
      data.connectionId,
      data.clientId ?? null,
    );

    // Insert a row in publishing state first so we always have a paper trail.
    const { data: row, error: insErr } = await context.supabase
      .from("social_posts")
      .insert({
        brand_id: data.brandId,
        client_id: data.clientId ?? null,
        connection_id: data.connectionId,
        provider: conn.provider,
        placement: data.placement,
        caption: data.caption ?? null,
        hashtags: data.hashtags,
        mentions: data.mentions,
        media: data.media,
        post_id: data.postId ?? null,
        status: "publishing",
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (insErr) throw new Error(insErr.message);

    try {
      const { MetaPublishingService } = await import("./publishing.server");
      const svc = new MetaPublishingService();
      const result = await svc.publish(conn as any, {
        placement: data.placement,
        caption: buildCaption(data.caption, data.hashtags, data.mentions),
        media: data.media,
      });
      const { error: updErr } = await context.supabase
        .from("social_posts")
        .update({
          status: "published",
          published_at: new Date().toISOString(),
          external_post_id: result.externalPostId,
          external_permalink: result.externalPermalink,
          provider_response: result.providerResponse as any,
          last_error: null,
        })
        .eq("id", row.id);
      if (updErr) throw new Error(updErr.message);
      return {
        id: row.id as string,
        status: "published" as const,
        externalPostId: result.externalPostId,
        externalPermalink: result.externalPermalink,
      };
    } catch (err) {
      const { formatPublishError } = await import("./publishing.server");
      const message = formatPublishError(err);
      await context.supabase
        .from("social_posts")
        .update({ status: "failed", last_error: message })
        .eq("id", row.id);
      throw new Error(message);
    }
  });

// ---------------------------------------------------------------------------
// schedulePost
// ---------------------------------------------------------------------------
export const schedulePost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ScheduleSchema.parse(i))
  .handler(async ({ data, context }) => {
    const conn = await loadConnection(
      context.supabase,
      data.brandId,
      data.connectionId,
      data.clientId ?? null,
    );
    // Placement is already narrowed by the Zod enum above.

    const { data: row, error } = await context.supabase
      .from("social_posts")
      .insert({
        brand_id: data.brandId,
        client_id: data.clientId ?? null,
        connection_id: data.connectionId,
        provider: conn.provider,
        placement: data.placement,
        caption: data.caption ?? null,
        hashtags: data.hashtags,
        mentions: data.mentions,
        media: data.media,
        post_id: data.postId ?? null,
        scheduled_at: data.scheduledAt,
        status: "scheduled",
        created_by: context.userId,
      })
      .select("id, scheduled_at, status")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id, status: row.status, scheduledAt: row.scheduled_at };
  });

// ---------------------------------------------------------------------------
// cancelScheduledPost
// ---------------------------------------------------------------------------
export const cancelScheduledPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ id: z.string().uuid(), brandId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: existing, error: readErr } = await context.supabase
      .from("social_posts")
      .select("id, status")
      .eq("id", data.id)
      .eq("brand_id", data.brandId)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!existing) throw new Error("Publicação não encontrada");
    if (existing.status !== "scheduled") {
      throw new Error(`Só é possível cancelar publicações agendadas (status atual: ${existing.status})`);
    }
    const { error } = await context.supabase
      .from("social_posts")
      .update({ status: "canceled" })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { id: data.id, status: "canceled" as const };
  });

// ---------------------------------------------------------------------------
// getPublishStatus
// ---------------------------------------------------------------------------
export const getPublishStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ id: z.string().uuid(), brandId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("social_posts")
      .select(
        "id, status, placement, provider, scheduled_at, published_at, external_post_id, external_permalink, last_error, updated_at",
      )
      .eq("id", data.id)
      .eq("brand_id", data.brandId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Publicação não encontrada");
    return row;
  });

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
function buildCaption(base?: string, hashtags: string[] = [], mentions: string[] = []): string | undefined {
  const parts: string[] = [];
  if (base) parts.push(base);
  const tags = hashtags.filter(Boolean).map((t) => (t.startsWith("#") ? t : `#${t}`));
  const ats = mentions.filter(Boolean).map((m) => (m.startsWith("@") ? m : `@${m}`));
  if (ats.length) parts.push(ats.join(" "));
  if (tags.length) parts.push(tags.join(" "));
  const out = parts.join("\n\n").trim();
  return out.length ? out : undefined;
}
