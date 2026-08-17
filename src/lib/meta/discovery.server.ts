import {
  readPagesPayload,
  accountDiscoveryStatus,
  type CachedPagesPayload,
  type PublishAuthorizationInfo,
  type DiscoveredAccountStatus,
} from "./portfolio-shared";

/**
 * Descoberta Meta compartilhada (server-only).
 *
 * Uma única implementação de "o que a Meta devolve AGORA para este token":
 * usada tanto pela aba "Contas disponíveis" quanto pela reconexão. A varredura
 * é sempre a fonte de verdade — contas que a Meta não devolve mais deixam de
 * ser tratadas como autorizadas.
 */

export type DiscoveredAccount = {
  channel: "facebook" | "instagram";
  /** SEMPRE o ID externo da Meta (Page ID ou IG Business ID). */
  externalId: string;
  label: string;
  handle: string | null;
  pictureUrl: string | null;
  pageId: string | null;
  instagramBusinessId: string | null;
  /** Página irmã (para vincular Página + Instagram juntos). */
  pairPageId: string | null;
  status: DiscoveredAccountStatus;
};

type SupabaseLike = {
  from: (table: string) => any;
};

export type DiscoveryOutcome = {
  payload: CachedPagesPayload;
  loadedAt: string;
  error: string | null;
};

/**
 * Executa varredura real na Graph API, persiste o resultado na sessão e
 * revoga conexões desta marca/usuário Meta que não apareceram mais.
 */
export async function runMetaDiscovery(
  supabase: SupabaseLike,
  session: {
    id: string;
    brand_id: string;
    meta_user_id: string;
    user_token_ciphertext: string | null;
    pages: unknown;
  },
): Promise<DiscoveryOutcome> {
  const known = readPagesPayload(session.pages);
  if (!session.user_token_ciphertext) {
    return {
      payload: known,
      loadedAt: new Date().toISOString(),
      error: "Sessão da Meta sem token. Faça a autorização novamente.",
    };
  }

  const { decryptCredential } = await import("@/lib/credentials-crypto.server");
  const { MetaProvider, MetaGraphError } = await import("./provider.server");
  const provider = new MetaProvider();

  let userToken: string;
  try {
    userToken = await decryptCredential(session.user_token_ciphertext);
  } catch {
    return {
      payload: known,
      loadedAt: new Date().toISOString(),
      error: "Sua autorização da Meta não é mais válida. Autorize novamente.",
    };
  }

  let publishAuthorization: PublishAuthorizationInfo | null =
    known.publishAuthorization ?? null;
  try {
    const { getPublishAuthorization } = await import("./granular-scopes.server");
    publishAuthorization = (await getPublishAuthorization(
      userToken,
    )) as PublishAuthorizationInfo;
  } catch {
    /* granularidade indisponível não invalida a descoberta */
  }

  try {
    const scan = await provider.scanPortfolio(userToken);
    const tokenById = new Map(known.pages.map((p) => [p.pageId, p.pageAccessToken]));
    const payload: CachedPagesPayload = {
      pages: scan.pages.map((p) => ({
        pageId: p.pageId,
        pageName: p.pageName,
        category: p.category ?? null,
        pagePictureUrl: p.pagePictureUrl ?? null,
        instagramBusinessId: p.instagramBusinessId ?? null,
        instagramUsername: p.instagramUsername ?? null,
        instagramPictureUrl: p.instagramPictureUrl ?? null,
        pageAccessToken: p.pageAccessToken || tokenById.get(p.pageId) || undefined,
      })),
      standaloneInstagram: scan.standaloneInstagram.map((i) => ({
        instagramId: i.instagramId,
        username: i.username ?? null,
        name: i.name ?? null,
        pictureUrl: i.pictureUrl ?? null,
        businessName: i.businessName ?? null,
      })),
      warnings: scan.warnings,
      businessCount: scan.businessCount ?? 0,
      publishAuthorization,
    };

    const loadedAt = new Date().toISOString();
    await supabase
      .from("meta_oauth_sessions")
      .update({
        pages: payload as unknown as Record<string, unknown>,
        portfolio_loaded_at: loadedAt,
        portfolio_load_status:
          payload.pages.length + payload.standaloneInstagram.length > 0
            ? "loaded"
            : "empty",
        portfolio_error: null,
        portfolio_rate_limited_until: null,
      })
      .eq("id", session.id);

    await revokeUndiscoveredConnections(
      supabase,
      session.brand_id,
      session.meta_user_id,
      discoveredIds(payload),
    );

    return { payload, loadedAt, error: null };
  } catch (err) {
    const detail =
      err instanceof MetaGraphError
        ? `Meta: ${err.message}`
        : err instanceof Error
          ? err.message
          : "Falha ao consultar a Graph API da Meta.";
    await supabase
      .from("meta_oauth_sessions")
      .update({ portfolio_load_status: "error", portfolio_error: detail })
      .eq("id", session.id);
    return { payload: known, loadedAt: new Date().toISOString(), error: detail };
  }
}

export function discoveredIds(payload: CachedPagesPayload): Set<string> {
  return new Set<string>([
    ...payload.pages.map((p) => p.pageId),
    ...(payload.pages.map((p) => p.instagramBusinessId).filter(Boolean) as string[]),
    ...payload.standaloneInstagram.map((i) => i.instagramId),
  ]);
}

/**
 * Conexões salvas deste usuário Meta que não vieram na descoberta atual não
 * podem continuar "active": passam a revoked (histórico preservado).
 */
async function revokeUndiscoveredConnections(
  supabase: SupabaseLike,
  brandId: string,
  metaUserId: string,
  ids: Set<string>,
): Promise<void> {
  if (ids.size === 0) return;
  const { data: existing } = await supabase
    .from("social_connections")
    .select("id, external_id, status")
    .eq("brand_id", brandId)
    .eq("provider", "meta")
    .eq("owner_external_id", metaUserId)
    .in("channel", ["facebook", "instagram"]);
  const stale = ((existing ?? []) as Array<{ id: string; external_id: string; status: string }>)
    .filter((c) => c.status === "active" && !ids.has(c.external_id));
  for (const c of stale) {
    await supabase
      .from("social_connections")
      .update({
        status: "revoked",
        last_error:
          "Conta não apareceu na última autorização da Meta. Reconecte e selecione esta conta durante o consentimento.",
      })
      .eq("id", c.id);
  }
}

/** Converte o portfólio bruto em contas apresentáveis (identidade = ID Meta). */
export function toDiscoveredAccounts(
  payload: CachedPagesPayload,
): DiscoveredAccount[] {
  const auth = payload.publishAuthorization ?? null;
  const out: DiscoveredAccount[] = [];
  for (const p of payload.pages) {
    out.push({
      channel: "facebook",
      externalId: p.pageId,
      label: p.pageName,
      handle: null,
      pictureUrl: p.pagePictureUrl ?? null,
      pageId: p.pageId,
      instagramBusinessId: p.instagramBusinessId ?? null,
      pairPageId: p.pageId,
      status: accountDiscoveryStatus(auth, "facebook", p.pageId),
    });
    if (p.instagramBusinessId) {
      out.push({
        channel: "instagram",
        externalId: p.instagramBusinessId,
        label: p.instagramUsername ?? p.pageName,
        handle: p.instagramUsername ?? null,
        pictureUrl: p.instagramPictureUrl ?? p.pagePictureUrl ?? null,
        pageId: p.pageId,
        instagramBusinessId: p.instagramBusinessId,
        pairPageId: p.pageId,
        status: accountDiscoveryStatus(auth, "instagram", p.instagramBusinessId),
      });
    }
  }
  for (const i of payload.standaloneInstagram) {
    out.push({
      channel: "instagram",
      externalId: i.instagramId,
      label: i.username ?? i.name ?? i.instagramId,
      handle: i.username ?? null,
      pictureUrl: i.pictureUrl ?? null,
      pageId: null,
      instagramBusinessId: i.instagramId,
      pairPageId: null,
      status: accountDiscoveryStatus(auth, "instagram", i.instagramId),
    });
  }
  return out;
}
