// Endpoint HTTP unificado — GET /api/social/posts/:postId/analytics
//
// Retorna o desempenho de uma publicação em um formato padronizado,
// independente da rede social por trás dela. Métricas ausentes na
// plataforma de origem são retornadas como `null` — nunca provocam erro.
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { Metric, SocialNetwork, SocialPost } from "@/lib/social/types";
import { withSocialCache, socialCacheKey, hashKey, SOCIAL_CACHE_TTL_MS } from "@/lib/social-analytics/cache";

function isNewKey(k: string) {
  return k.startsWith("sb_publishable_") || k.startsWith("sb_secret_");
}
function makeFetch(key: string, token: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(init?.headers);
    if (isNewKey(key) && headers.get("Authorization") === `Bearer ${key}`)
      headers.delete("Authorization");
    headers.set("apikey", key);
    headers.set("Authorization", `Bearer ${token}`);
    return fetch(input, { ...init, headers });
  };
}

function inferNetwork(
  provider: string,
  accountId: string | null,
  placement: string | null,
): SocialNetwork | null {
  const p = provider.toLowerCase();
  if (p === "meta") {
    if (placement && placement.toLowerCase().startsWith("instagram")) return "instagram";
    if (placement && placement.toLowerCase().startsWith("facebook")) return "facebook";
    return accountId ? "instagram" : "facebook";
  }
  if (p === "instagram" || p === "facebook") return p;
  if (p === "linkedin" || p === "tiktok" || p === "youtube" || p === "x" || p === "threads")
    return p;
  return null;
}

function metricValue(list: Metric[], key: string): number | null {
  const m = list.find((x) => x.key === key);
  return m ? m.value : null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function computeEngagementRate(post: SocialPost): number | null {
  const explicit = metricValue(post.metrics, "engagement_rate");
  if (explicit != null) return round2(explicit);
  const engagement = metricValue(post.metrics, "engagement");
  const reach = metricValue(post.metrics, "reach");
  const impressions = metricValue(post.metrics, "impressions");
  const base = reach ?? impressions ?? null;
  if (engagement != null && base && base > 0) return round2((engagement / base) * 100);
  const likes = metricValue(post.metrics, "likes") ?? 0;
  const comments = metricValue(post.metrics, "comments") ?? 0;
  const shares = metricValue(post.metrics, "shares") ?? 0;
  const saves = metricValue(post.metrics, "saves") ?? 0;
  const interactions = likes + comments + shares + saves;
  if (!interactions || !base || base <= 0) return null;
  return round2((interactions / base) * 100);
}

export const Route = createFileRoute("/api/social/posts/$postId/analytics")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        // ---------- Auth ------------------------------------------------
        const auth = request.headers.get("authorization") ?? "";
        if (!auth.startsWith("Bearer "))
          return new Response("Unauthorized", { status: 401 });
        const token = auth.slice(7);
        if (token.split(".").length !== 3)
          return new Response("Invalid token", { status: 401 });

        const url = process.env.SUPABASE_URL;
        const pubKey = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!url || !pubKey)
          return new Response("Missing Supabase env", { status: 500 });

        const postId = params.postId;
        if (!/^[0-9a-f-]{36}$/i.test(postId))
          return new Response("Invalid postId", { status: 400 });

        // ---------- Load post + connection (RLS scoped to the user) -----
        const supabase = createClient<Database>(url, pubKey, {
          global: {
            fetch: makeFetch(pubKey, token),
            headers: { Authorization: `Bearer ${token}` },
          },
          auth: { persistSession: false, autoRefreshToken: false },
        });

        const { data: post, error: postErr } = await supabase
          .from("social_posts")
          .select(
            "id, brand_id, connection_id, external_post_id, external_permalink, published_at, placement, provider, status",
          )
          .eq("id", postId)
          .maybeSingle();
        if (postErr)
          return Response.json(
            { error: "db_error", message: postErr.message },
            { status: 500 },
          );
        if (!post) return new Response("Not found", { status: 404 });
        if (!post.external_post_id)
          return Response.json(
            { error: "post_not_published", status: post.status },
            { status: 409 },
          );

        const { data: conn, error: connErr } = await supabase
          .from("social_connections")
          .select(
            "id, brand_id, provider, external_id, external_name, account_id, account_username, access_token_ciphertext, status",
          )
          .eq("id", post.connection_id)
          .maybeSingle();
        if (connErr)
          return Response.json(
            { error: "db_error", message: connErr.message },
            { status: 500 },
          );
        if (!conn) return new Response("Connection not found", { status: 404 });
        if (!conn.access_token_ciphertext)
          return Response.json(
            { error: "connection_missing_token" },
            { status: 409 },
          );

        const network = inferNetwork(conn.provider, conn.account_id, post.placement);
        if (!network)
          return Response.json(
            { error: "unsupported_provider", provider: conn.provider },
            { status: 400 },
          );

        // ---------- Resolve provider & fetch analytics ------------------
        const { getSocialProviderForNetwork } = await import(
          "@/lib/social/registry.server"
        );
        const provider = getSocialProviderForNetwork(network);
        if (!provider)
          return Response.json(
            { error: "provider_not_implemented", network },
            { status: 501 },
          );

        const { decryptCredential } = await import(
          "@/lib/credentials-crypto.server"
        );
        let accessToken: string;
        try {
          accessToken = await decryptCredential(conn.access_token_ciphertext);
        } catch {
          return Response.json({ error: "token_decrypt_failed" }, { status: 500 });
        }

        const ctx = {
          connectionId: conn.id,
          brandId: conn.brand_id,
          provider: conn.provider,
          externalId: conn.external_id,
          externalName: conn.external_name ?? null,
          accountId: conn.account_id ?? null,
          accountUsername: conn.account_username ?? null,
          accessToken,
        };

        const scope = `${hashKey(token)}:${conn.id}`;
        const res = await withSocialCache(
          socialCacheKey("post", scope, { n: network, p: post.external_post_id }),
          () => provider.getPost(ctx, { network, postId: post.external_post_id! }),
        );
        if (!res.ok)
          return Response.json(
            { error: "provider_error", message: res.error, code: res.code },
            { status: 502 },
          );

        const p = res.data;

        // ---------- Canonical JSON --------------------------------------
        const body = {
          provider: network,
          postId: post.id,
          externalPostId: p.externalPostId,
          permalink: p.permalink ?? post.external_permalink ?? null,
          publishedAt: p.publishedAt ?? post.published_at ?? null,
          mediaType: p.mediaType,
          likes: metricValue(p.metrics, "likes"),
          comments: metricValue(p.metrics, "comments"),
          shares: metricValue(p.metrics, "shares"),
          saves: metricValue(p.metrics, "saves"),
          reach: metricValue(p.metrics, "reach"),
          impressions: metricValue(p.metrics, "impressions"),
          views: metricValue(p.metrics, "video_views") ?? metricValue(p.metrics, "views"),
          engagementRate: computeEngagementRate(p),
          warnings: p.warnings,
        };

        return Response.json(body, {
          headers: {
            "cache-control": `private, max-age=${SOCIAL_CACHE_TTL_MS / 1000}, stale-while-revalidate=120`,
          },
        });
      },
    },
  },
});