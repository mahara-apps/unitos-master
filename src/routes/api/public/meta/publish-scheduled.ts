import { createFileRoute } from "@tanstack/react-router";

/**
 * Drains due `social_posts` where status='scheduled' and scheduled_at <= now().
 * Called by pg_cron every minute. Uses supabaseAdmin (service role) so it can
 * read encrypted tokens and update posts across all tenants.
 *
 * Auth: bypass at edge via /api/public/*; caller must present anon apikey.
 */
export const Route = createFileRoute("/api/public/meta/publish-scheduled")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const anon = process.env.SUPABASE_PUBLISHABLE_KEY!;
        const key = request.headers.get("apikey") ?? request.headers.get("x-api-key");
        if (!key || key !== anon) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );
        const { MetaPublishingService, formatPublishError } = await import(
          "@/lib/meta/publishing.server"
        );

        // Claim due posts atomically-ish: flip to 'publishing' first.
        const nowIso = new Date().toISOString();
        const { data: due, error: dueErr } = await supabaseAdmin
          .from("social_posts")
          .select("id")
          .eq("status", "scheduled")
          .lte("scheduled_at", nowIso)
          .limit(25);
        if (dueErr) {
          return Response.json({ ok: false, error: dueErr.message }, { status: 500 });
        }
        if (!due || due.length === 0) {
          return Response.json({ ok: true, processed: 0 });
        }

        const ids = due.map((r) => r.id);
        const { data: claimed, error: claimErr } = await supabaseAdmin
          .from("social_posts")
          .update({ status: "publishing" })
          .in("id", ids)
          .eq("status", "scheduled")
          .select(
            "id, brand_id, connection_id, placement, caption, hashtags, mentions, media",
          );
        if (claimErr) {
          return Response.json({ ok: false, error: claimErr.message }, { status: 500 });
        }

        const svc = new MetaPublishingService();
        const results: Array<{ id: string; ok: boolean; error?: string }> = [];

        for (const post of claimed ?? []) {
          try {
            const { data: conn, error: connErr } = await supabaseAdmin
              .from("social_connections")
              .select(
                "id, provider, external_id, account_id, access_token_ciphertext",
              )
              .eq("id", post.connection_id)
              .maybeSingle();
            if (connErr) throw new Error(connErr.message);
            if (!conn) throw new Error("Conexão removida");

            const caption = buildCaption(
              post.caption ?? undefined,
              (post.hashtags as string[] | null) ?? [],
              (post.mentions as string[] | null) ?? [],
            );
            const result = await svc.publish(conn as any, {
              placement: post.placement as any,
              caption,
              media: (post.media as any) ?? {},
            });
            await supabaseAdmin
              .from("social_posts")
              .update({
                status: "published",
                published_at: new Date().toISOString(),
                external_post_id: result.externalPostId,
                external_permalink: result.externalPermalink,
                provider_response: result.providerResponse as any,
                last_error: null,
              })
              .eq("id", post.id);
            results.push({ id: post.id, ok: true });
          } catch (err) {
            const msg = formatPublishError(err);
            await supabaseAdmin
              .from("social_posts")
              .update({ status: "failed", last_error: msg })
              .eq("id", post.id);
            results.push({ id: post.id, ok: false, error: msg });
          }
        }

        return Response.json({ ok: true, processed: results.length, results });
      },
    },
  },
});

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
