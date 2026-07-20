import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Portfolio flow — after the OAuth callback captures every Page + IG that the
 * Meta user administers into `meta_oauth_sessions`, these server functions let
 * the frontend list that portfolio and pick which accounts (per channel) to
 * bind to the current brand in `social_connections`.
 */

export type PortfolioPage = {
  pageId: string;
  pageName: string;
  category: string | null;
  pagePictureUrl: string | null;
  instagramBusinessId: string | null;
  instagramUsername: string | null;
  instagramPictureUrl: string | null;
};

export type PortfolioThreadsAccount = {
  threadsUserId: string;
  username: string | null;
  name: string | null;
  pictureUrl: string | null;
  linkedViaPageId?: string;
};

export type PortfolioAdAccount = {
  adAccountId: string;
  name: string | null;
  currency: string | null;
  timezone: string | null;
  accountStatus: number | null;
  businessName: string | null;
};

export type PortfolioResponse = {
  sessionId: string;
  metaUser: { id: string; name: string | null; email: string | null };
  scopes: string[];
  requestedScopes: string[];
  missingScopes: string[];
  pages: PortfolioPage[];
  threadsAccounts: PortfolioThreadsAccount[];
  adAccounts: PortfolioAdAccount[];
  connected: {
    facebook: Record<string, string>; // pageId -> connectionId
    instagram: Record<string, string>; // igId -> connectionId
    threads: Record<string, string>; // threadsUserId -> connectionId
    ads: Record<string, string>; // adAccountId -> connectionId
  };
  expiresAt: string;
};

const GetInput = z.object({
  brandId: z.string().uuid(),
  sessionId: z.string().uuid(),
});

export const getMetaPortfolio = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => GetInput.parse(input))
  .handler(async ({ data, context }): Promise<PortfolioResponse> => {
    const { data: session, error } = await context.supabase
      .from("meta_oauth_sessions")
      .select(
        "id, brand_id, meta_user_id, meta_user_name, meta_user_email, scopes, requested_scopes, pages, threads_accounts, ad_accounts, expires_at",
      )
      .eq("id", data.sessionId)
      .eq("brand_id", data.brandId)
      .maybeSingle();
    if (error) throw error;
    if (!session) throw new Error("Sessão da Meta não encontrada ou expirada.");
    if (new Date(session.expires_at).getTime() < Date.now()) {
      throw new Error("Sessão da Meta expirou. Refaça o login.");
    }

    const pages = ((session.pages as unknown as PortfolioPage[]) ?? []).map((p) => ({
      pageId: p.pageId,
      pageName: p.pageName,
      category: p.category ?? null,
      pagePictureUrl: p.pagePictureUrl ?? null,
      instagramBusinessId: p.instagramBusinessId ?? null,
      instagramUsername: p.instagramUsername ?? null,
      instagramPictureUrl: p.instagramPictureUrl ?? null,
    }));

    const threadsAccounts = (
      (session.threads_accounts as unknown as PortfolioThreadsAccount[]) ?? []
    ).map((t) => ({
      threadsUserId: t.threadsUserId,
      username: t.username ?? null,
      name: t.name ?? null,
      pictureUrl: t.pictureUrl ?? null,
      linkedViaPageId: t.linkedViaPageId,
    }));

    const adAccounts = (
      (session.ad_accounts as unknown as PortfolioAdAccount[]) ?? []
    ).map((a) => ({
      adAccountId: a.adAccountId,
      name: a.name ?? null,
      currency: a.currency ?? null,
      timezone: a.timezone ?? null,
      accountStatus: a.accountStatus ?? null,
      businessName: a.businessName ?? null,
    }));

    // Which of these are already bound to this brand?
    const externalIds = [
      ...pages.map((p) => p.pageId),
      ...pages.map((p) => p.instagramBusinessId).filter(Boolean) as string[],
      ...threadsAccounts.map((t) => t.threadsUserId),
      ...adAccounts.map((a) => a.adAccountId),
    ];
    const connected: PortfolioResponse["connected"] = {
      facebook: {},
      instagram: {},
      threads: {},
      ads: {},
    };
    if (externalIds.length > 0) {
      const { data: rows } = await context.supabase
        .from("social_connections")
        .select("id, channel, external_id")
        .eq("brand_id", data.brandId)
        .eq("provider", "meta")
        .in("external_id", externalIds);
      for (const r of rows ?? []) {
        if (r.channel === "facebook") connected.facebook[r.external_id] = r.id;
        if (r.channel === "instagram") connected.instagram[r.external_id] = r.id;
        if (r.channel === "threads") connected.threads[r.external_id] = r.id;
        if (r.channel === "ads") connected.ads[r.external_id] = r.id;
      }
    }

    const requestedScopes = (session.requested_scopes as string[] | null) ?? [];
    const grantedScopes = session.scopes ?? [];
    const missingScopes = requestedScopes.filter((s) => !grantedScopes.includes(s));

    return {
      sessionId: session.id,
      metaUser: {
        id: session.meta_user_id,
        name: session.meta_user_name ?? null,
        email: session.meta_user_email ?? null,
      },
      scopes: grantedScopes,
      requestedScopes,
      missingScopes,
      pages,
      threadsAccounts,
      adAccounts,
      connected,
      expiresAt: session.expires_at,
    };
  });

const LinkInput = z.object({
  brandId: z.string().uuid(),
  sessionId: z.string().uuid(),
  /** Page ID (facebook/instagram), Threads user id, or ad account id */
  targetId: z.string().min(1),
  channel: z.enum(["facebook", "instagram", "threads", "ads"]),
});

export const linkMetaAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => LinkInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: session, error } = await context.supabase
      .from("meta_oauth_sessions")
      .select(
        "id, brand_id, meta_user_id, meta_user_name, meta_user_email, scopes, pages, threads_accounts, ad_accounts, user_token_ciphertext, user_token_expires_at, expires_at",
      )
      .eq("id", data.sessionId)
      .eq("brand_id", data.brandId)
      .maybeSingle();
    if (error) throw error;
    if (!session) throw new Error("Sessão da Meta não encontrada.");
    if (new Date(session.expires_at).getTime() < Date.now()) {
      throw new Error("Sessão da Meta expirou. Refaça o login.");
    }

    const { encryptCredential } = await import("@/lib/credentials-crypto.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const now = new Date().toISOString();
    let externalId: string;
    let externalName: string;
    let accountUsername: string | null = null;
    let tokenToStore: string;
    let metadata: Record<string, unknown>;

    const pages = (session.pages as unknown as Array<
      PortfolioPage & { pageAccessToken: string }
    >) ?? [];

    if (data.channel === "facebook" || data.channel === "instagram") {
      const page = pages.find((p) => p.pageId === data.targetId);
      if (!page) throw new Error("Página não encontrada no portfólio.");
      if (data.channel === "instagram" && !page.instagramBusinessId) {
        throw new Error("Esta Página não possui Instagram Business vinculado.");
      }
      externalId =
        data.channel === "facebook" ? page.pageId : (page.instagramBusinessId as string);
      externalName =
        data.channel === "facebook" ? page.pageName : (page.instagramUsername ?? page.pageName);
      accountUsername = data.channel === "instagram" ? page.instagramUsername ?? null : null;
      tokenToStore = page.pageAccessToken;
      metadata = {
        category: page.category ?? null,
        page_id: page.pageId,
        page_name: page.pageName,
        instagram_business_id: page.instagramBusinessId ?? null,
        instagram_username: page.instagramUsername ?? null,
        page_picture_url: page.pagePictureUrl ?? null,
        instagram_picture_url: page.instagramPictureUrl ?? null,
      };
    } else if (data.channel === "threads") {
      const threads = (session.threads_accounts as unknown as Array<
        PortfolioThreadsAccount & { accessToken: string }
      >) ?? [];
      const t = threads.find((x) => x.threadsUserId === data.targetId);
      if (!t) throw new Error("Conta do Threads não encontrada no portfólio.");
      externalId = t.threadsUserId;
      externalName = t.name ?? t.username ?? t.threadsUserId;
      accountUsername = t.username;
      tokenToStore = t.accessToken;
      metadata = {
        threads_username: t.username,
        threads_name: t.name,
        threads_picture_url: t.pictureUrl,
        linked_via_page_id: t.linkedViaPageId ?? null,
      };
    } else {
      // ads — no long-lived per-account token; reuse user token for Graph calls.
      const ads = (session.ad_accounts as unknown as PortfolioAdAccount[]) ?? [];
      const a = ads.find((x) => x.adAccountId === data.targetId);
      if (!a) throw new Error("Conta de anúncios não encontrada no portfólio.");
      externalId = a.adAccountId;
      externalName = a.name ?? a.adAccountId;
      // Ad accounts are queried with the user token (long-lived).
      // We keep it here so future insights calls don't need to re-fetch it.
      tokenToStore = session.user_token_ciphertext
        ? "" // token is already encrypted in user_token_ciphertext; we mirror below
        : "";
      metadata = {
        ad_account_id: a.adAccountId,
        ad_account_name: a.name,
        currency: a.currency,
        timezone: a.timezone,
        account_status: a.accountStatus,
        business_name: a.businessName,
      };
    }

    // For ads, we don't have a fresh page token — reuse the encrypted user token.
    const ciphertext =
      data.channel === "ads"
        ? session.user_token_ciphertext!
        : await encryptCredential(tokenToStore);

    metadata = {
      ...metadata,
      linked_at: now,
      user_email: session.meta_user_email ?? null,
      user_access_token_ciphertext: session.user_token_ciphertext,
      user_token_expires_at: session.user_token_expires_at ?? null,
    };

    // Replace any active row for the same (brand, channel) pointing to a
    // different account. Same account = idempotent refresh via upsert.
    await supabaseAdmin
      .from("social_connections")
      .delete()
      .eq("brand_id", data.brandId)
      .eq("channel", data.channel)
      .eq("provider", "meta")
      .neq("external_id", externalId);

    const { data: upserted, error: upErr } = await supabaseAdmin
      .from("social_connections")
      .upsert(
        {
          brand_id: data.brandId,
          channel: data.channel,
          provider: "meta",
          external_id: externalId,
          external_name: externalName,
          account_id: externalId,
          account_username: accountUsername,
          owner_external_id: session.meta_user_id,
          owner_name: session.meta_user_name ?? null,
          access_token_ciphertext: ciphertext,
          scopes: session.scopes ?? [],
          status: "active",
          last_error: null,
          last_synced_at: now,
          token_expires_at: session.user_token_expires_at ?? null,
          metadata: metadata as unknown as import("@/integrations/supabase/types").Json,
          created_by: context.userId,
        },
        { onConflict: "brand_id,provider,external_id" },
      )
      .select("id")
      .single();
    if (upErr) throw upErr;

    return { ok: true, connectionId: upserted.id };
  });

const UnlinkInput = z.object({
  brandId: z.string().uuid(),
  connectionId: z.string().uuid(),
});

export const unlinkMetaAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UnlinkInput.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("social_connections")
      .delete()
      .eq("id", data.connectionId)
      .eq("brand_id", data.brandId)
      .eq("provider", "meta");
    if (error) throw error;
    return { ok: true };
  });
