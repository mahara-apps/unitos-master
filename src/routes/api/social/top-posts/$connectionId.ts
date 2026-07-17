// Endpoint HTTP unificado — GET /api/social/top-posts/:connectionId
//
// Retorna as publicações ordenadas por um score interno de engajamento,
// em um formato padronizado independente da rede social por trás da
// conexão. Métricas indisponíveis são retornadas como `null`.
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import type { Metric, SocialNetwork, SocialPost } from "@/lib/social/types";

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
  sortBy: z
    .enum(["engagement", "reach", "impressions", "likes", "comments", "shares", "saves"])
    .default("engagement"),
});

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
): SocialNetwork | null {
  const p = provider.toLowerCase();
  if (p === "meta") return accountId ? "instagram" : "facebook";
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

/**
 * Engagement rate canônico da publicação. Usa a métrica explícita quando
 * disponível; caso contrário, calcula (interações / base) * 100 com
 * `reach` como base preferencial e `impressions` como fallback.
 */
function engagementRate(post: SocialPost): number | null {
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

/**
 * Score interno de desempenho. Combina interações ponderadas com alcance
 * (log-normalizado para evitar dominância). Usado para ordenação quando o
 * critério é "engagement" — o padrão.
 */
function performanceScore(post: SocialPost): number {
  const likes = metricValue(post.metrics, "likes") ?? 0;
  const comments = metricValue(post.metrics, "comments") ?? 0;
  const shares = metricValue(post.metrics, "shares") ?? 0;
  const saves = metricValue(post.metrics, "saves") ?? 0;
  const reach = metricValue(post.metrics, "reach") ?? metricValue(post.metrics, "impressions") ?? 0;
  // Pesos: saves e shares valem mais (intenção/amplificação) que likes.
  const interactions = likes * 1 + comments * 2 + shares * 3 + saves * 3;
  const reachBoost = reach > 0 ? Math.log10(reach + 1) : 0;
  return interactions * (1 + reachBoost / 10);
}

function scoreFor(post: SocialPost, sortBy: string): number {
  if (sortBy === "engagement") return performanceScore(post);
  return metricValue(post.metrics, sortBy) ?? 0;
}

export const Route = createFileRoute("/api/social/top-posts/$connectionId")({
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

        // ---------- Input ----------------------------------------------
        const { searchParams } = new URL(request.url);
        const parsed = QuerySchema.safeParse({
          limit: searchParams.get("limit") ?? undefined,
          sortBy: searchParams.get("sortBy") ?? undefined,
        });
        if (!parsed.success)
          return Response.json(
            { error: "invalid_query", details: parsed.error.flatten() },
            { status: 400 },
          );
        const { limit, sortBy } = parsed.data;

        const connectionId = params.connectionId;
        if (!/^[0-9a-f-]{36}$/i.test(connectionId))
          return new Response("Invalid connectionId", { status: 400 });

        // ---------- Load connection (RLS scoped to the user) ------------
        const supabase = createClient<Database>(url, pubKey, {
          global: {
            fetch: makeFetch(pubKey, token),
            headers: { Authorization: `Bearer ${token}` },
          },
          auth: { persistSession: false, autoRefreshToken: false },
        });

        const { data: row, error } = await supabase
          .from("social_connections")
          .select(
            "id, brand_id, provider, external_id, external_name, account_id, account_username, access_token_ciphertext, status",
          )
          .eq("id", connectionId)
          .maybeSingle();
        if (error)
          return Response.json(
            { error: "db_error", message: error.message },
            { status: 500 },
          );
        if (!row) return new Response("Not found", { status: 404 });
        if (!row.access_token_ciphertext)
          return Response.json(
            { error: "connection_missing_token" },
            { status: 409 },
          );

        const network = inferNetwork(row.provider, row.account_id);
        if (!network)
          return Response.json(
            { error: "unsupported_provider", provider: row.provider },
            { status: 400 },
          );

        // ---------- Resolve provider & fetch posts ----------------------
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
          accessToken = await decryptCredential(row.access_token_ciphertext);
        } catch {
          return Response.json({ error: "token_decrypt_failed" }, { status: 500 });
        }

        const ctx = {
          connectionId: row.id,
          brandId: row.brand_id,
          provider: row.provider,
          externalId: row.external_id,
          externalName: row.external_name ?? null,
          accountId: row.account_id ?? null,
          accountUsername: row.account_username ?? null,
          accessToken,
        };

        // Puxa um pool maior que o `limit` para dar liberdade ao score.
        const pool = Math.min(Math.max(limit * 3, 15), 50);
        const res = await provider.getPosts(ctx, { network, limit: pool });
        if (!res.ok)
          return Response.json(
            { error: "provider_error", message: res.error, code: res.code },
            { status: 502 },
          );

        const ranked = res.data
          .map((p) => ({ p, score: scoreFor(p, sortBy) }))
          .sort((a, b) => b.score - a.score)
          .slice(0, limit);

        // ---------- Canonical JSON --------------------------------------
        const body = ranked.map(({ p, score }) => ({
          id: p.externalPostId,
          provider: network,
          permalink: p.permalink,
          thumbnail: p.thumbnailUrl,
          caption: p.caption,
          publishedAt: p.publishedAt,
          mediaType: p.mediaType,
          score: round2(score),
          metrics: {
            reach: metricValue(p.metrics, "reach"),
            impressions: metricValue(p.metrics, "impressions"),
            engagement: engagementRate(p),
            likes: metricValue(p.metrics, "likes"),
            comments: metricValue(p.metrics, "comments"),
            shares: metricValue(p.metrics, "shares"),
            saves: metricValue(p.metrics, "saves"),
            views:
              metricValue(p.metrics, "video_views") ??
              metricValue(p.metrics, "views"),
          },
        }));

        return Response.json(body, {
          headers: {
            "cache-control": "private, max-age=60, stale-while-revalidate=120",
          },
        });
      },
    },
  },
});