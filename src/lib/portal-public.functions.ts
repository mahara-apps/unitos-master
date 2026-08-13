import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { createHash } from "crypto";
import { z } from "zod";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { normalizePortalTheme, resolvePortalTheme } from "@/lib/portal-theme";

type ResolvedPortalTheme = ReturnType<typeof resolvePortalTheme>;

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export type PortalClient = {
  id: string;
  name: string;
  niche: string | null;
  color: string | null;
  socials: Json | null;
  contact_name: string | null;
  contact_email: string | null;
  logo_url: string | null;
  portal_theme?: unknown;
};
export type PortalBrand = { id: string; name: string };
export type PortalPost = {
  id: string;
  title: string | null;
  copy?: string | null;
  format: string | null;
  channels: string[] | null;
  scheduled_at: string | null;
  published_at?: string | null;
  stage: string | null;
  cover_url: string | null;
  reference_media: Json;
  script?: string | null;
  approval?: { status: string; notes: string | null; decided_at: string | null };
};
export type PortalApproval = { status: string; notes: string | null; decided_at: string | null; decided_by_name: string | null };
type PortalResolveResult = {
  clientId: string;
  brandId: string;
  client: PortalClient;
  brand: PortalBrand | null;
  /** Fase 3 — tema já normalizado/validado no server (hex + URL http(s)). */
  theme: ResolvedPortalTheme;
};
type PortalMetrics = { pending: number; approvedThisMonth: number; scheduled: number; total: number };
type PortalPostResult = { post: PortalPost; approval: PortalApproval | null };
type PortalFile = { id: string; name: string; storage_path: string; mime_type: string | null; size_bytes: number | null; created_at: string };
type PortalBriefing = { id: string; token: string; label: string | null; expires_at: string | null; revoked_at: string | null; submitted_at: string | null; created_at: string };

/**
 * Portal público (sem auth). Usa a chave publishable + RPCs SECURITY
 * DEFINER (public.portal_*) que validam o token internamente e retornam
 * apenas os dados escopados ao cliente correspondente. Não depende de
 * SUPABASE_SERVICE_ROLE_KEY.
 */

function getPublic(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing Supabase environment variable(s): SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY.",
    );
  }
  const isOpaque = key.startsWith("sb_publishable_") || key.startsWith("sb_secret_");
  return createClient(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (isOpaque && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

/**
 * Rate limiting do portal público (0b).
 * - IP real vem dos headers de borda (cf-connecting-ip / x-forwarded-for).
 * - Nunca guardamos o IP: só um hash SHA-256 com salt fixo do projeto.
 * - Só gravamos em caso de token inválido (upsert em falha); acesso válido
 *   não escreve nada na tabela portal_rate_limit.
 */
function getClientIp(): string | null {
  const candidates = [
    getRequestHeader("cf-connecting-ip"),
    getRequestHeader("x-real-ip"),
    (getRequestHeader("x-forwarded-for") ?? "").split(",")[0],
  ];
  for (const c of candidates) {
    const v = (c ?? "").trim();
    if (v) return v;
  }
  return null;
}

function hashIp(): string | null {
  const ip = getClientIp();
  if (!ip) return null;
  const salt = process.env.SUPABASE_PROJECT_ID ?? process.env.SUPABASE_URL ?? "portal";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

const TOKEN_ERRORS = ["invalid_token", "token_revoked", "token_expired"];

function isTokenError(message: string): boolean {
  return TOKEN_ERRORS.some((e) => message.includes(e));
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const c = getPublic();
  const ipHash = args["_token"] ? hashIp() : null;

  if (ipHash) {
    const { data: status } = await c.rpc("portal_rate_status", { _ip_hash: ipHash });
    const s = status as { blocked?: boolean; retry_after?: number } | null;
    if (s?.blocked) {
      throw new Error(
        `portal_rate_limited: muitas tentativas inválidas. Tente novamente em ${Math.ceil((s.retry_after ?? 60) / 60)} min.`,
      );
    }
  }

  const { data, error } = await c.rpc(fn, args);
  if (error) {
    if (ipHash && isTokenError(error.message)) {
      await c.rpc("portal_rate_register_failure", { _ip_hash: ipHash });
    }
    throw new Error(error.message);
  }
  return data as T;
}

const tokenIn = z.object({ token: z.string().min(8) });

/**
 * Storage do portal público: os buckets são privados e sem policy pública,
 * então as URLs assinadas são geradas server-side com o client admin.
 */
async function getStorageClient(): Promise<SupabaseClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as SupabaseClient;
}

async function signCover(path: string, bucket: string): Promise<string | null> {
  const c = await getStorageClient();
  const { data } = await c.storage.from(bucket).createSignedUrl(path, 60 * 60 * 24 * 7);
  return data?.signedUrl ?? null;
}

async function fillCovers(posts: PortalPost[]): Promise<void> {
  for (const p of posts) {
    if (p.cover_url) continue;
    const refs = Array.isArray(p.reference_media) ? (p.reference_media as Array<Record<string, unknown>>) : [];
    const first = refs.find((r) => typeof r?.path === "string");
    if (first?.path) {
      const bucket = typeof first.bucket === "string" ? (first.bucket as string) : "brand-assets";
      p.cover_url = await signCover(first.path as string, bucket);
    }
  }
}


export const resolvePortalTokenFn = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => tokenIn.parse(i))
  .handler(async ({ data }): Promise<PortalResolveResult> => {
    const res = await rpc<Omit<PortalResolveResult, "theme">>("portal_resolve", {
      _token: data.token,
    });
    // O jsonb vem do banco sem garantias: valida antes de virar CSS/style.
    const theme = resolvePortalTheme(normalizePortalTheme(res.client?.portal_theme), {
      color: res.client?.color ?? null,
      logoUrl: null,
      agencyName: res.brand?.name ?? null,
    });
    return { ...res, theme };
  });

export const getPortalMetricsFn = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => tokenIn.parse(i))
  .handler(async ({ data }): Promise<PortalMetrics> =>
    rpc<PortalMetrics>("portal_metrics", { _token: data.token }),
  );

type ApprovalStatus = "pending" | "approved" | "rejected" | "adjust";

export const listPortalApprovalsFn = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    tokenIn.extend({ status: z.enum(["all", "pending", "approved", "adjust"]).default("all") }).parse(i),
  )
  .handler(async ({ data }): Promise<PortalPost[]> => {
    const rows = await rpc<PortalPost[]>("portal_approvals", {
      _token: data.token,
      _status: data.status,
    });
    await fillCovers(rows ?? []);
    return rows ?? [];
  });

export const getPortalPostFn = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => tokenIn.extend({ postId: z.string().uuid() }).parse(i))
  .handler(async ({ data }): Promise<{ post: PortalPost; approval: PortalApproval | null; media: Array<{ url: string; type: string }> }> => {
    const res = await rpc<PortalPostResult>("portal_post", {
      _token: data.token,
      _post_id: data.postId,
    });
    const post = res.post;
    const refs = Array.isArray(post.reference_media)
      ? (post.reference_media as Array<Record<string, unknown>>)
      : [];
    const media = (
      await Promise.all(
        refs.map(async (r) => {
          const path = typeof r?.path === "string" ? r.path : null;
          if (!path) return null;
          const bucket = typeof r?.bucket === "string" ? (r.bucket as string) : "brand-assets";
          const url = await signCover(path, bucket);
          return url ? { url, type: (r?.type as string) ?? "" } : null;
        }),
      )
    ).filter(Boolean) as Array<{ url: string; type: string }>;
    if (!post.cover_url && media[0]) post.cover_url = media[0].url;
    return { post, approval: res.approval, media };
  });

export const decidePortalApprovalFn = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    tokenIn
      .extend({
        postId: z.string().uuid(),
        decision: z.enum(["approved", "rejected", "adjust", "comment"]),
        note: z.string().max(4000).optional(),
        identity: z.string().min(1).max(120),
      })
      .parse(i),
  )
  .handler(async ({ data }) =>
    rpc<{ ok: boolean }>("portal_decide", {
      _token: data.token,
      _post_id: data.postId,
      _decision: data.decision,
      _note: data.note ?? null,
      _identity: data.identity,
    }),
  );

export const listPortalCalendarFn = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    tokenIn.extend({ month: z.string().regex(/^\d{4}-\d{2}$/).optional() }).parse(i),
  )
  .handler(async ({ data }): Promise<PortalPost[]> =>
    (await rpc<PortalPost[]>("portal_calendar", { _token: data.token, _month: data.month ?? null })) ?? [],
  );

export const listPortalFeedFn = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => tokenIn.parse(i))
  .handler(async ({ data }): Promise<PortalPost[]> => {
    const rows = await rpc<PortalPost[]>("portal_feed", { _token: data.token });
    await fillCovers(rows ?? []);
    return rows ?? [];
  });

export const listPortalFilesFn = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => tokenIn.extend({ search: z.string().optional() }).parse(i))
  .handler(async ({ data }): Promise<Array<PortalFile & { url: string | null }>> => {
    const docs = await rpc<PortalFile[]>("portal_files", {
      _token: data.token,
      _search: (data.search ?? "").trim() || null,
    });
    const c = await getStorageClient();
    const withUrls = await Promise.all(
      (docs ?? []).map(async (d) => {
        const { data: signed } = await c.storage
          .from("brand-documents")
          .createSignedUrl(d.storage_path, 60 * 60);
        return { ...d, url: signed?.signedUrl ?? null };
      }),
    );
    return withUrls;
  });

export const listPortalBriefingsFn = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => tokenIn.parse(i))
  .handler(async ({ data }): Promise<PortalBriefing[]> =>
    (await rpc<PortalBriefing[]>("portal_briefings", { _token: data.token })) ?? [],
  );

// silence unused type warning
export type _PortalApprovalStatus = ApprovalStatus;
