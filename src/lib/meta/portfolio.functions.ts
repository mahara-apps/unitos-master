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

export type PortfolioResponse = {
  sessionId: string;
  metaUser: { id: string; name: string | null; email: string | null };
  scopes: string[];
  pages: PortfolioPage[];
  connected: {
    facebook: Record<string, string>; // pageId -> connectionId
    instagram: Record<string, string>; // igId -> connectionId
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
        "id, brand_id, meta_user_id, meta_user_name, meta_user_email, scopes, pages, expires_at",
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

    // Which of these are already bound to this brand?
    const externalIds = [
      ...pages.map((p) => p.pageId),
      ...pages.map((p) => p.instagramBusinessId).filter(Boolean) as string[],
    ];
    const connected: PortfolioResponse["connected"] = { facebook: {}, instagram: {} };
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
      }
    }

    return {
      sessionId: session.id,
      metaUser: {
        id: session.meta_user_id,
        name: session.meta_user_name ?? null,
        email: session.meta_user_email ?? null,
      },
      scopes: session.scopes ?? [],
      pages,
      connected,
      expiresAt: session.expires_at,
    };
  });

const LinkInput = z.object({
  brandId: z.string().uuid(),
  sessionId: z.string().uuid(),
  pageId: z.string().min(1),
  channel: z.enum(["facebook", "instagram"]),
});

export const linkMetaAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => LinkInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: session, error } = await context.supabase
      .from("meta_oauth_sessions")
      .select(
        "id, brand_id, meta_user_id, meta_user_name, meta_user_email, scopes, pages, user_token_ciphertext, user_token_expires_at, expires_at",
      )
      .eq("id", data.sessionId)
      .eq("brand_id", data.brandId)
      .maybeSingle();
    if (error) throw error;
    if (!session) throw new Error("Sessão da Meta não encontrada.");
    if (new Date(session.expires_at).getTime() < Date.now()) {
      throw new Error("Sessão da Meta expirou. Refaça o login.");
    }

    const pages = (session.pages as unknown as Array<
      PortfolioPage & { pageAccessToken: string }
    >) ?? [];
    const page = pages.find((p) => p.pageId === data.pageId);
    if (!page) throw new Error("Página não encontrada no portfólio.");
    if (data.channel === "instagram" && !page.instagramBusinessId) {
      throw new Error("Esta Página não possui Instagram Business vinculado.");
    }

    const { encryptCredential } = await import("@/lib/credentials-crypto.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const now = new Date().toISOString();
    const externalId =
      data.channel === "facebook" ? page.pageId : (page.instagramBusinessId as string);
    const externalName =
      data.channel === "facebook" ? page.pageName : (page.instagramUsername ?? page.pageName);
    const accountUsername = data.channel === "instagram" ? page.instagramUsername ?? null : null;
    const ciphertext = await encryptCredential(page.pageAccessToken);

    const metadata = {
      category: page.category ?? null,
      page_id: page.pageId,
      page_name: page.pageName,
      instagram_business_id: page.instagramBusinessId ?? null,
      instagram_username: page.instagramUsername ?? null,
      page_picture_url: page.pagePictureUrl ?? null,
      instagram_picture_url: page.instagramPictureUrl ?? null,
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
          metadata,
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
