// Endpoint HTTP unificado — GET /api/social/dashboard/:connectionId
//
// Retorna um único objeto JSON padronizado independente da rede social por
// trás da conexão. O frontend nunca deve chamar endpoints específicos da
// Meta (ou de qualquer outro provider) — sempre passa por aqui.
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import type {
  DateRange,
  Metric,
  SocialDashboard,
  SocialNetwork,
  SocialPost,
} from "@/lib/social/types";

const QuerySchema = z.object({
  period: z
    .string()
    .regex(/^\d{1,3}d$/)
    .default("30d"),
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

function periodToRange(period: string): DateRange {
  const days = Math.min(Math.max(Number.parseInt(period, 10) || 30, 1), 365);
  const until = new Date();
  const since = new Date(until.getTime() - days * 24 * 60 * 60 * 1000);
  return { since: since.toISOString(), until: until.toISOString() };
}

/** Provider key (`social_connections.provider`) → user-facing network id. */
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

function sumPostMetric(posts: SocialPost[], key: string): number {
  return posts.reduce((acc, p) => acc + (metricValue(p.metrics, key) ?? 0), 0);
}

function computeEngagementRate(
  totals: Metric[],
  posts: SocialPost[],
  followers: number | null,
): number | null {
  // Prefer explicit canonical engagement total when the provider emits it.
  const direct = metricValue(totals, "engagement");
  const denom = followers ?? metricValue(totals, "reach") ?? null;
  if (direct != null && denom && denom > 0) {
    return round2((direct / denom) * 100);
  }
  // Fallback: sum interactions across recent posts.
  const interactions =
    sumPostMetric(posts, "likes") +
    sumPostMetric(posts, "comments") +
    sumPostMetric(posts, "shares") +
    sumPostMetric(posts, "saves");
  if (!interactions) return null;
  const base = followers ?? metricValue(totals, "reach") ?? null;
  if (!base || base <= 0) return null;
  return round2((interactions / base) * 100);
}

function computeGrowth(
  totals: Metric[],
  followers: number | null,
): number | null {
  const gained = metricValue(totals, "followers_gained") ?? 0;
  const lost = metricValue(totals, "followers_lost") ?? 0;
  const net = gained - lost;
  if (!followers || followers <= 0) return null;
  return round2((net / followers) * 100);
}

function countVideos(posts: SocialPost[]): number {
  return posts.filter((p) => p.mediaType === "video").length;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function accountLabel(
  dashboard: SocialDashboard,
  fallbackName: string | null,
): string | null {
  const handle = dashboard.profile?.handle ?? null;
  if (handle) return handle.startsWith("@") ? handle : `@${handle}`;
  return dashboard.profile?.name ?? fallbackName ?? null;
}

export const Route = createFileRoute("/api/social/dashboard/$connectionId")({
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
          period: searchParams.get("period") ?? undefined,
        });
        if (!parsed.success)
          return Response.json(
            { error: "invalid_query", details: parsed.error.flatten() },
            { status: 400 },
          );
        const period = parsed.data.period;
        const range = periodToRange(period);

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

        // ---------- Resolve provider & fetch dashboard ------------------
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

        const [dashRes, postsRes] = await Promise.all([
          provider.getDashboard(ctx, { network, range }),
          provider.getPosts(ctx, { network, limit: 25 }),
        ]);

        if (!dashRes.ok)
          return Response.json(
            { error: "provider_error", message: dashRes.error, code: dashRes.code },
            { status: 502 },
          );

        const dashboard = dashRes.data;
        const posts = postsRes.ok ? postsRes.data : [];
        const followers = dashboard.profile?.followers ?? null;

        // ---------- Canonical JSON --------------------------------------
        const body = {
          provider: network,
          account: accountLabel(dashboard, row.external_name ?? null),
          period,
          range,
          metrics: {
            followers,
            reach: metricValue(dashboard.totals, "reach"),
            impressions: metricValue(dashboard.totals, "impressions"),
            engagement: computeEngagementRate(dashboard.totals, posts, followers),
            profileVisits: metricValue(dashboard.totals, "profile_visits"),
            linkClicks: metricValue(dashboard.totals, "link_clicks"),
            posts: posts.length,
            videos: countVideos(posts),
            growth: computeGrowth(dashboard.totals, followers),
          },
          warnings: [
            ...dashboard.warnings,
            ...(postsRes.ok ? [] : [`posts: ${postsRes.error}`]),
          ],
        };

        return Response.json(body, {
          headers: {
            "cache-control": "private, max-age=60, stale-while-revalidate=120",
          },
        });
      },
    },
  },
});