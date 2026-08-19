import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { runMetaDiscovery, toDiscoveredAccounts, type DiscoveredAccount } from "./discovery.server";
import { readPagesPayload } from "./portfolio-shared";

/**
 * Descoberta Meta para a Central de Canais.
 *
 * `listDiscoveredMetaAccountsFn` responde "quais contas a Meta autoriza AGORA
 * para este workspace" — sem misturar com o histórico salvo. Contas já
 * existentes em `social_connections` (ativas OU removidas) não voltam para
 * "disponíveis": as ativas ficam em "Canais conectados" e as removidas no
 * histórico.
 *
 * `reconcileMetaConnectionFn` refaz a descoberta após uma nova autorização e
 * reativa a conexão apenas se a Meta continuar devolvendo aquele ID externo.
 */

export type DiscoveredAccountsResult = {
  sessionId: string | null;
  metaUserName: string | null;
  discoveredAt: string | null;
  needsAuthorization: boolean;
  accounts: DiscoveredAccount[];
  alreadyLinked: number;
  warnings: string[];
  error: string | null;
};

const ListInput = z.object({
  brandId: z.string().uuid(),
  refresh: z.boolean().optional(),
});

export const listDiscoveredMetaAccountsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ListInput.parse(i))
  .handler(async ({ data, context }): Promise<DiscoveredAccountsResult> => {
    const empty: DiscoveredAccountsResult = {
      sessionId: null,
      metaUserName: null,
      discoveredAt: null,
      needsAuthorization: true,
      accounts: [],
      alreadyLinked: 0,
      warnings: [],
      error: null,
    };

    const { data: sessions, error } = await context.supabase
      .from("meta_oauth_sessions")
      .select(
        "id, brand_id, meta_user_id, meta_user_name, user_token_ciphertext, user_token_expires_at, pages, portfolio_loaded_at",
      )
      .eq("brand_id", data.brandId)
      .order("created_at", { ascending: false })
      .limit(5);
    if (error) return { ...empty, error: error.message };

    const now = Date.now();
    const session = (sessions ?? []).find((s) => {
      if (!s.user_token_ciphertext) return false;
      const exp = s.user_token_expires_at
        ? new Date(s.user_token_expires_at as string).getTime()
        : null;
      return exp === null || exp > now;
    });
    if (!session) return empty;

    let payload = readPagesPayload(session.pages);
    let discoveredAt = (session.portfolio_loaded_at as string | null) ?? null;
    let discoveryError: string | null = null;

    const needsScan =
      data.refresh === true || payload.pages.length + payload.standaloneInstagram.length === 0;
    if (needsScan) {
      const outcome = await runMetaDiscovery(context.supabase, {
        id: session.id as string,
        brand_id: session.brand_id as string,
        meta_user_id: session.meta_user_id as string,
        user_token_ciphertext: session.user_token_ciphertext as string,
        pages: session.pages,
      });
      payload = outcome.payload;
      discoveredAt = outcome.loadedAt;
      discoveryError = outcome.error;
    }

    const { data: saved } = await context.supabase
      .from("social_connections")
      .select("external_id")
      .eq("brand_id", data.brandId)
      .eq("provider", "meta");
    const savedIds = new Set(
      ((saved ?? []) as Array<{ external_id: string }>).map((r) => r.external_id),
    );

    const all = toDiscoveredAccounts(payload);
    const accounts = all.filter((a) => !savedIds.has(a.externalId));

    return {
      sessionId: session.id as string,
      metaUserName: (session.meta_user_name as string | null) ?? null,
      discoveredAt,
      needsAuthorization: false,
      accounts,
      alreadyLinked: all.length - accounts.length,
      warnings: payload.warnings,
      error: discoveryError,
    };
  });

const ReconcileInput = z.object({
  brandId: z.string().uuid(),
  connectionId: z.string().uuid(),
  sessionId: z.string().uuid(),
});

export type ReconcileResult = {
  ok: boolean;
  /** true = a Meta continuou devolvendo esta conta e ela foi reativada. */
  restored: boolean;
  message: { title: string; description: string };
};

export const reconcileMetaConnectionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ReconcileInput.parse(i))
  .handler(async ({ data, context }): Promise<ReconcileResult> => {
    const { data: conn } = await context.supabase
      .from("social_connections")
      .select("id, channel, external_id, external_name")
      .eq("id", data.connectionId)
      .eq("brand_id", data.brandId)
      .eq("provider", "meta")
      .maybeSingle();
    if (!conn) {
      return {
        ok: false,
        restored: false,
        message: {
          title: "Canal não encontrado",
          description: "Esta conexão não existe mais neste workspace.",
        },
      };
    }

    const { data: session } = await context.supabase
      .from("meta_oauth_sessions")
      .select("id, brand_id, meta_user_id, user_token_ciphertext, pages")
      .eq("id", data.sessionId)
      .eq("brand_id", data.brandId)
      .maybeSingle();
    if (!session) {
      return {
        ok: false,
        restored: false,
        message: {
          title: "Autorização não encontrada",
          description: "Refaça a autorização na Meta e tente novamente.",
        },
      };
    }

    const outcome = await runMetaDiscovery(context.supabase, {
      id: session.id as string,
      brand_id: session.brand_id as string,
      meta_user_id: session.meta_user_id as string,
      user_token_ciphertext: session.user_token_ciphertext as string,
      pages: session.pages,
    });
    if (outcome.error) {
      return {
        ok: false,
        restored: false,
        message: {
          title: "Não foi possível consultar a Meta",
          description: outcome.error,
        },
      };
    }

    const externalId = conn.external_id as string;
    const channel = conn.channel as string;
    const page =
      channel === "facebook"
        ? outcome.payload.pages.find((p) => p.pageId === externalId)
        : outcome.payload.pages.find((p) => p.instagramBusinessId === externalId);
    const standalone =
      channel === "instagram"
        ? outcome.payload.standaloneInstagram.find((i) => i.instagramId === externalId)
        : undefined;

    if (!page && !standalone) {
      await context.supabase
        .from("social_connections")
        .update({
          status: "revoked",
          last_error:
            "A Meta não devolveu esta conta na autorização atual. Refaça o consentimento e marque esta conta.",
        })
        .eq("id", conn.id);
      return {
        ok: false,
        restored: false,
        message: {
          title: "Conta não autorizada",
          description:
            "A Meta não devolveu esta conta na autorização atual. Refaça a autorização mantendo esta Página/Instagram selecionada.",
        },
      };
    }

    const patch: {
      status: string;
      last_error: string | null;
      last_synced_at: string;
      owner_external_id: string;
      meta_user_id: string;
      page_id?: string | null;
      external_name?: string | null;
      instagram_business_id?: string | null;
      account_id?: string | null;
      account_username?: string | null;
      access_token_ciphertext?: string;
    } = {
      status: "active",
      last_error: null,
      last_synced_at: new Date().toISOString(),
      owner_external_id: session.meta_user_id as string,
      meta_user_id: session.meta_user_id as string,
    };

    if (page) {
      patch.page_id = page.pageId;
      patch.external_name =
        channel === "instagram" ? (page.instagramUsername ?? page.pageName) : page.pageName;
      if (page.instagramBusinessId) {
        patch.instagram_business_id = page.instagramBusinessId;
        patch.account_id = page.instagramBusinessId;
        patch.account_username = page.instagramUsername ?? null;
      }
      if (page.pageAccessToken) {
        const { encryptCredential } = await import("@/lib/credentials-crypto.server");
        patch.access_token_ciphertext = await encryptCredential(page.pageAccessToken);
      }
    } else if (standalone) {
      patch.instagram_business_id = standalone.instagramId;
      patch.account_id = standalone.instagramId;
      patch.account_username = standalone.username ?? null;
      patch.external_name = standalone.username ?? standalone.name ?? externalId;
      patch.access_token_ciphertext = session.user_token_ciphertext as string;
    }

    const { error: upErr } = await context.supabase
      .from("social_connections")
      .update(patch)
      .eq("id", conn.id)
      .eq("brand_id", data.brandId);
    if (upErr) {
      return {
        ok: false,
        restored: false,
        message: {
          title: "Não foi possível salvar a reconexão",
          description: upErr.message,
        },
      };
    }

    return {
      ok: true,
      restored: true,
      message: {
        title: "Canal reconectado",
        description: "A Meta confirmou esta conta e a autorização de publicação foi renovada.",
      },
    };
  });
