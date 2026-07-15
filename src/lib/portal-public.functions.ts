import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Portal público (sem auth). Toda função valida o `token` contra
 * `portal_tokens`, resolve o `client_id` e nunca expõe dados de outros
 * clientes. Usa `supabaseAdmin` internamente porque não há sessão do lado
 * do cliente — a segurança vem exclusivamente da validação do token.
 */

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

type PortalSession = { clientId: string; brandId: string; tokenId: string };

async function resolveToken(token: string): Promise<PortalSession> {
  const admin = await getAdmin();
  const { data, error } = await admin
    .from("portal_tokens")
    .select("id, client_id, revoked_at, expires_at, clients!inner(brand_id)")
    .eq("token", token)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("invalid_token");
  if (data.revoked_at) throw new Error("token_revoked");
  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) {
    throw new Error("token_expired");
  }
  admin
    .from("portal_tokens")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", data.id)
    .then(() => {});
  const brandId = (data as unknown as { clients: { brand_id: string } }).clients.brand_id;
  return { clientId: data.client_id as string, brandId, tokenId: data.id as string };
}

const tokenIn = z.object({ token: z.string().min(8) });

async function signCover(admin: Awaited<ReturnType<typeof getAdmin>>, path: string) {
  const { data } = await admin.storage.from("brand-assets").createSignedUrl(path, 60 * 60 * 24 * 7);
  return data?.signedUrl ?? null;
}

async function fillCovers<T extends { cover_url: string | null; reference_media: unknown }>(
  admin: Awaited<ReturnType<typeof getAdmin>>,
  posts: T[],
) {
  for (const p of posts) {
    if (p.cover_url) continue;
    const refs = Array.isArray(p.reference_media) ? (p.reference_media as Array<Record<string, unknown>>) : [];
    const first = refs.find((r) => typeof r?.path === "string");
    if (first?.path) p.cover_url = await signCover(admin, first.path as string);
  }
}

export const resolvePortalTokenFn = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => tokenIn.parse(i))
  .handler(async ({ data }) => {
    const s = await resolveToken(data.token);
    const admin = await getAdmin();
    const [client, brand] = await Promise.all([
      admin
        .from("clients")
        .select("id, name, niche, color, socials, contact_name, contact_email")
        .eq("id", s.clientId)
        .single(),
      admin.from("brands").select("id, name").eq("id", s.brandId).single(),
    ]);
    return { clientId: s.clientId, brandId: s.brandId, client: client.data, brand: brand.data };
  });

export const getPortalMetricsFn = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => tokenIn.parse(i))
  .handler(async ({ data }) => {
    const s = await resolveToken(data.token);
    const admin = await getAdmin();
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const { data: posts } = await admin
      .from("posts")
      .select("id, stage, scheduled_at, published_at, approved_at")
      .eq("brand_id", s.brandId)
      .eq("client_id", s.clientId)
      .eq("visible_in_portal", true)
      .is("deleted_at", null);
    const ids = (posts ?? []).map((p) => p.id as string);
    const { data: apprv } = ids.length
      ? await admin.from("post_approvals").select("post_id, status").in("post_id", ids)
      : { data: [] as Array<{ post_id: string; status: string }> };
    const pending = (apprv ?? []).filter((a) => a.status === "pending").length;
    const approvedThisMonth = (posts ?? []).filter(
      (p) => p.approved_at && new Date(p.approved_at as string) >= monthStart,
    ).length;
    const scheduled = (posts ?? []).filter(
      (p) => p.stage === "scheduled" || (p.scheduled_at && !p.published_at),
    ).length;
    return { pending, approvedThisMonth, scheduled, total: (posts ?? []).length };
  });

type ApprovalStatus = "pending" | "approved" | "rejected" | "adjust";

export const listPortalApprovalsFn = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    tokenIn.extend({ status: z.enum(["all", "pending", "approved", "adjust"]).default("all") }).parse(i),
  )
  .handler(async ({ data }) => {
    const s = await resolveToken(data.token);
    const admin = await getAdmin();
    const { data: posts } = await admin
      .from("posts")
      .select("id, title, format, channels, scheduled_at, cover_url, reference_media, stage")
      .eq("brand_id", s.brandId)
      .eq("client_id", s.clientId)
      .eq("visible_in_portal", true)
      .is("deleted_at", null)
      .order("scheduled_at", { ascending: true, nullsFirst: false });
    const ids = (posts ?? []).map((p) => p.id as string);
    const { data: apprv } = ids.length
      ? await admin
          .from("post_approvals")
          .select("post_id, status, notes, decided_at, decided_by_name")
          .in("post_id", ids)
      : { data: [] as Array<Record<string, unknown>> };
    const byPost = new Map<string, (typeof apprv)[number]>();
    for (const a of apprv ?? []) byPost.set(a.post_id as string, a);
    await fillCovers(admin, posts ?? []);
    const merged = (posts ?? []).map((p) => {
      const a = byPost.get(p.id as string);
      const status: ApprovalStatus =
        a?.status === "approved"
          ? "approved"
          : a?.status === "rejected"
            ? "rejected"
            : a?.status === "adjust"
              ? "adjust"
              : "pending";
      return { ...p, approval: { status, notes: (a?.notes as string) ?? null, decided_at: (a?.decided_at as string) ?? null } };
    });
    return data.status === "all" ? merged : merged.filter((m) => m.approval.status === data.status);
  });

export const getPortalPostFn = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => tokenIn.extend({ postId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const s = await resolveToken(data.token);
    const admin = await getAdmin();
    const { data: post, error } = await admin
      .from("posts")
      .select("id, title, copy, format, channels, scheduled_at, cover_url, reference_media, script, stage")
      .eq("id", data.postId)
      .eq("brand_id", s.brandId)
      .eq("client_id", s.clientId)
      .eq("visible_in_portal", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!post) throw new Error("post_not_found");
    const { data: apprv } = await admin
      .from("post_approvals")
      .select("status, notes, decided_at, decided_by_name")
      .eq("post_id", data.postId)
      .maybeSingle();
    const refs = Array.isArray(post.reference_media)
      ? (post.reference_media as Array<Record<string, unknown>>)
      : [];
    const media = (
      await Promise.all(
        refs.map(async (r) => {
          const path = typeof r?.path === "string" ? r.path : null;
          if (!path) return null;
          const url = await signCover(admin, path);
          return url ? { url, type: (r?.type as string) ?? "" } : null;
        }),
      )
    ).filter(Boolean) as Array<{ url: string; type: string }>;
    return { post, approval: apprv, media };
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
  .handler(async ({ data }) => {
    const s = await resolveToken(data.token);
    const admin = await getAdmin();
    const { data: post } = await admin
      .from("posts")
      .select("id, title")
      .eq("id", data.postId)
      .eq("brand_id", s.brandId)
      .eq("client_id", s.clientId)
      .maybeSingle();
    if (!post) throw new Error("post_not_found");
    const now = new Date().toISOString();
    if (data.decision !== "comment") {
      const { data: existing } = await admin
        .from("post_approvals")
        .select("id")
        .eq("post_id", data.postId)
        .maybeSingle();
      const row = {
        post_id: data.postId,
        status: data.decision,
        notes: data.note ?? null,
        decided_at: now,
        decided_by_name: data.identity,
      };
      if (existing) await admin.from("post_approvals").update(row).eq("id", existing.id);
      else await admin.from("post_approvals").insert(row);
      if (data.decision === "approved") {
        await admin
          .from("posts")
          .update({ approved_at: now, review_status: "approved" })
          .eq("id", data.postId);
      }
    }
    await admin.from("activity_events").insert({
      brand_id: s.brandId,
      client_id: s.clientId,
      entity_type: "post",
      entity_id: data.postId,
      verb: `portal_${data.decision}`,
      payload: { note: data.note ?? "", by: data.identity, title: post.title },
    });
    const { data: members } = await admin
      .from("brand_members")
      .select("user_id")
      .eq("brand_id", s.brandId);
    if (members?.length) {
      const titleMap: Record<string, string> = {
        approved: "Cliente aprovou um post",
        rejected: "Cliente rejeitou um post",
        adjust: "Cliente pediu ajustes",
        comment: "Cliente comentou um post",
      };
      await admin.from("notifications").insert(
        members.map((m) => ({
          user_id: m.user_id,
          brand_id: s.brandId,
          kind: `portal_${data.decision}`,
          title: titleMap[data.decision],
          body: `${data.identity}: ${post.title ?? "post"}`,
          url: `/customers/${s.clientId}`,
        })),
      );
    }
    return { ok: true };
  });

export const listPortalCalendarFn = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    tokenIn.extend({ month: z.string().regex(/^\d{4}-\d{2}$/).optional() }).parse(i),
  )
  .handler(async ({ data }) => {
    const s = await resolveToken(data.token);
    const admin = await getAdmin();
    const now = new Date();
    const m = data.month
      ? new Date(`${data.month}-01T00:00:00Z`)
      : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const start = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth(), 1)).toISOString();
    const end = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1)).toISOString();
    const { data: posts } = await admin
      .from("posts")
      .select("id, title, format, channels, scheduled_at, stage, cover_url")
      .eq("brand_id", s.brandId)
      .eq("client_id", s.clientId)
      .eq("visible_in_portal", true)
      .is("deleted_at", null)
      .gte("scheduled_at", start)
      .lt("scheduled_at", end)
      .order("scheduled_at", { ascending: true });
    return posts ?? [];
  });

export const listPortalFeedFn = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => tokenIn.parse(i))
  .handler(async ({ data }) => {
    const s = await resolveToken(data.token);
    const admin = await getAdmin();
    const { data: posts } = await admin
      .from("posts")
      .select("id, title, format, cover_url, reference_media, scheduled_at, published_at, stage")
      .eq("brand_id", s.brandId)
      .eq("client_id", s.clientId)
      .eq("visible_in_portal", true)
      .is("deleted_at", null)
      .in("stage", ["approved", "scheduled", "published"])
      .order("scheduled_at", { ascending: false, nullsFirst: false })
      .limit(60);
    await fillCovers(admin, posts ?? []);
    return posts ?? [];
  });

export const listPortalFilesFn = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => tokenIn.extend({ search: z.string().optional() }).parse(i))
  .handler(async ({ data }) => {
    const s = await resolveToken(data.token);
    const admin = await getAdmin();
    let q = admin
      .from("client_documents")
      .select("id, name, storage_path, mime_type, size_bytes, created_at")
      .eq("brand_id", s.brandId)
      .eq("client_id", s.clientId)
      .order("created_at", { ascending: false });
    if (data.search && data.search.trim()) q = q.ilike("name", `%${data.search.trim()}%`);
    const { data: docs } = await q;
    const withUrls = await Promise.all(
      (docs ?? []).map(async (d) => {
        const { data: signed } = await admin.storage
          .from("brand-documents")
          .createSignedUrl(d.storage_path as string, 60 * 60);
        return { ...d, url: signed?.signedUrl ?? null };
      }),
    );
    return withUrls;
  });

export const listPortalBriefingsFn = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => tokenIn.parse(i))
  .handler(async ({ data }) => {
    const s = await resolveToken(data.token);
    const admin = await getAdmin();
    const { data: rows } = await admin
      .from("client_briefing_tokens" as never)
      .select("id, token, label, expires_at, revoked_at, submitted_at, created_at")
      .eq("brand_id", s.brandId)
      .eq("client_id", s.clientId)
      .order("created_at", { ascending: false });
    return (rows ?? []) as Array<{
      id: string; token: string; label: string | null;
      expires_at: string | null; revoked_at: string | null;
      submitted_at: string | null; created_at: string;
    }>;
  });
