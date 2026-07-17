import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Meta Integration — server functions (thin API surface for the UI).
 *
 * All Graph API and secret access lives in provider.server.ts and is loaded
 * dynamically inside handlers so this module stays client-import safe.
 */

const BrandInput = z.object({ brandId: z.string().uuid() });

export type MetaConnectionRow = {
  id: string;
  brandId: string;
  pageId: string;
  pageName: string | null;
  igBusinessId: string | null;
  igUsername: string | null;
  metaUserName: string | null;
  scopes: string[];
  status: string;
  tokenExpiresAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export const listMetaConnections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => BrandInput.parse(input))
  .handler(async ({ data, context }): Promise<MetaConnectionRow[]> => {
    const { data: rows, error } = await context.supabase
      .from("meta_connections")
      .select(
        "id, brand_id, page_id, page_name, ig_business_id, ig_username, meta_user_name, scopes, status, token_expires_at, last_error, created_at, updated_at",
      )
      .eq("brand_id", data.brandId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (rows ?? []).map((r) => ({
      id: r.id,
      brandId: r.brand_id,
      pageId: r.page_id,
      pageName: r.page_name,
      igBusinessId: r.ig_business_id,
      igUsername: r.ig_username,
      metaUserName: r.meta_user_name,
      scopes: r.scopes ?? [],
      status: r.status,
      tokenExpiresAt: r.token_expires_at,
      lastError: r.last_error,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  });

const StartInput = z.object({
  brandId: z.string().uuid(),
  redirectTo: z.string().max(500).optional(),
});

/**
 * Kicks off Meta OAuth: mints a CSRF-safe state row, stores brand/user
 * association, returns the Facebook consent URL for the browser to open.
 */
export const startMetaOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => StartInput.parse(input))
  .handler(async ({ data, context }) => {
    const { MetaProvider } = await import("./provider.server");
    const provider = new MetaProvider();
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    const state = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const { error } = await context.supabase.from("meta_oauth_states").insert({
      state,
      brand_id: data.brandId,
      user_id: context.userId,
      redirect_to: data.redirectTo ?? null,
    });
    if (error) throw error;

    return {
      authorizeUrl: provider.buildAuthorizeUrl({ state, display: "popup" }),
      state,
      redirectUri: provider.redirectUri,
    };
  });

const DisconnectInput = z.object({
  connectionId: z.string().uuid(),
  brandId: z.string().uuid(),
});

export const disconnectMeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DisconnectInput.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("meta_connections")
      .delete()
      .eq("id", data.connectionId)
      .eq("brand_id", data.brandId);
    if (error) throw error;
    return { ok: true };
  });

const RefreshInput = z.object({
  connectionId: z.string().uuid(),
  brandId: z.string().uuid(),
});

/**
 * Meta long-lived page tokens do not expire in practice, but user tokens do.
 * This call re-fetches page metadata and Instagram linkage using the stored
 * page access token, and updates `token_expires_at` from the token debug
 * endpoint. Errors are captured in `last_error` and the row is marked as
 * `error` — the UI can prompt the user to reconnect.
 */
export const refreshMetaConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RefreshInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("meta_connections")
      .select("id, page_id, page_access_token_ciphertext")
      .eq("id", data.connectionId)
      .eq("brand_id", data.brandId)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new Error("Meta connection not found");

    const { decryptCredential } = await import("@/lib/credentials-crypto.server");
    const { MetaProvider, MetaGraphError } = await import("./provider.server");
    const provider = new MetaProvider();

    const pageToken = await decryptCredential(row.page_access_token_ciphertext);

    try {
      const page = await provider.graph<{
        id: string;
        name: string;
        instagram_business_account?: { id: string; username?: string };
      }>(`/${row.page_id}`, {
        accessToken: pageToken,
        query: { fields: "id,name,instagram_business_account{id,username}" },
      });
      await context.supabase
        .from("meta_connections")
        .update({
          page_name: page.name,
          ig_business_id: page.instagram_business_account?.id ?? null,
          ig_username: page.instagram_business_account?.username ?? null,
          status: "active",
          last_error: null,
        })
        .eq("id", row.id);
      return { ok: true };
    } catch (err) {
      const msg = err instanceof MetaGraphError ? err.message : String(err);
      await context.supabase
        .from("meta_connections")
        .update({ status: "error", last_error: msg })
        .eq("id", row.id);
      return { ok: false, error: msg };
    }
  });