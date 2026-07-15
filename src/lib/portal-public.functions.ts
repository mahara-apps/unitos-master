import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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

async function rpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<T> {
  const c = getPublic();
  const { data, error } = await c.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

const tokenIn = z.object({ token: z.string().min(8) });

async function signCover(c: SupabaseClient, path: string) {
  const { data } = await c.storage.from("brand-assets").createSignedUrl(path, 60 * 60 * 24 * 7);
  return data?.signedUrl ?? null;
}

async function fillCovers<T extends { cover_url: string | null; reference_media: unknown }>(
  c: SupabaseClient,
  posts: T[],
) {
  for (const p of posts) {
    if (p.cover_url) continue;
    const refs = Array.isArray(p.reference_media) ? (p.reference_media as Array<Record<string, unknown>>) : [];
    const first = refs.find((r) => typeof r?.path === "string");
    if (first?.path) p.cover_url = await signCover(c, first.path as string);
  }
}

export const resolvePortalTokenFn = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => tokenIn.parse(i))
  .handler(async ({ data }) => rpc("portal_resolve", { _token: data.token }));

export const getPortalMetricsFn = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => tokenIn.parse(i))
  .handler(async ({ data }) => rpc("portal_metrics", { _token: data.token }));

type ApprovalStatus = "pending" | "approved" | "rejected" | "adjust";

export const listPortalApprovalsFn = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    tokenIn.extend({ status: z.enum(["all", "pending", "approved", "adjust"]).default("all") }).parse(i),
  )
  .handler(async ({ data }) => {
    const rows = await rpc<Array<{ cover_url: string | null; reference_media: unknown }>>(
      "portal_approvals",
      { _token: data.token, _status: data.status },
    );
    await fillCovers(getPublic(), rows ?? []);
    return rows ?? [];
  });

export const getPortalPostFn = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => tokenIn.extend({ postId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const res = await rpc<{ post: Record<string, unknown>; approval: Record<string, unknown> | null }>(
      "portal_post",
      { _token: data.token, _post_id: data.postId },
    );
    const post = res.post;
    const c = getPublic();
    const refs = Array.isArray(post.reference_media)
      ? (post.reference_media as Array<Record<string, unknown>>)
      : [];
    const media = (
      await Promise.all(
        refs.map(async (r) => {
          const path = typeof r?.path === "string" ? r.path : null;
          if (!path) return null;
          const url = await signCover(c, path);
          return url ? { url, type: (r?.type as string) ?? "" } : null;
        }),
      )
    ).filter(Boolean) as Array<{ url: string; type: string }>;
    if (!post.cover_url && media[0]) {
      (post as { cover_url: string | null }).cover_url = media[0].url;
    }
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
    rpc("portal_decide", {
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
  .handler(async ({ data }) =>
    (await rpc<unknown[]>("portal_calendar", { _token: data.token, _month: data.month ?? null })) ?? [],
  );

export const listPortalFeedFn = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => tokenIn.parse(i))
  .handler(async ({ data }) => {
    const rows = await rpc<Array<{ cover_url: string | null; reference_media: unknown }>>(
      "portal_feed",
      { _token: data.token },
    );
    await fillCovers(getPublic(), rows ?? []);
    return rows ?? [];
  });

export const listPortalFilesFn = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => tokenIn.extend({ search: z.string().optional() }).parse(i))
  .handler(async ({ data }) => {
    const docs = await rpc<Array<{ id: string; name: string; storage_path: string; mime_type: string | null; size_bytes: number | null; created_at: string }>>(
      "portal_files",
      { _token: data.token, _search: (data.search ?? "").trim() || null },
    );
    const c = getPublic();
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
  .handler(async ({ data }) =>
    (await rpc<Array<{
      id: string; token: string; label: string | null;
      expires_at: string | null; revoked_at: string | null;
      submitted_at: string | null; created_at: string;
    }>>("portal_briefings", { _token: data.token })) ?? [],
  );

// silence unused type warning
export type _PortalApprovalStatus = ApprovalStatus;
