/**
 * Estado de AUTORIZAÇÃO Meta × CANAIS conectados (lógica pura, testável).
 *
 * Regra de negócio:
 *   AUTORIZAÇÃO META VÁLIDA ≠ CONTA META JÁ VINCULADA
 *
 * - Fonte de verdade da autorização: `meta_oauth_sessions`
 *   (`revoked_at IS NULL` + token de usuário presente e não expirado).
 * - Fonte de verdade dos canais conectados: `social_connections`
 *   (status != revoked).
 *
 * Um portfólio autorizado sem nenhuma conexão continua sendo "autorizado":
 * é exatamente o estado "87 contas disponíveis aguardando seleção".
 * Nunca criamos linhas artificiais em `social_connections` para isso.
 */

export type MetaPortfolioSummary = {
  ownerExternalId: string | null;
  ownerName: string | null;
  channelCount: number;
  activeCount: number;
  attentionCount: number;
  clientCount: number;
  channels: string[];
  connectedAt: string | null;
  /** true = existe sessão OAuth válida para este portfólio. */
  authorized: boolean;
};

export type MetaPortfolioStatus = {
  /** true = o workspace tem pelo menos uma autorização Meta válida. */
  authorized: boolean;
  metaUserName: string | null;
  metaUserEmail: string | null;
  authorizedAt: string | null;
  portfolios: MetaPortfolioSummary[];
};

export type ConnectionRow = {
  channel: string;
  status: string;
  owner_external_id: string | null;
  owner_name: string | null;
  client_id: string | null;
  created_at: string | null;
};

export type SessionRow = {
  meta_user_id: string | null;
  meta_user_name: string | null;
  meta_user_email: string | null;
  user_token_ciphertext: string | null;
  user_token_expires_at: string | null;
  revoked_at?: string | null;
  created_at: string | null;
};

/** Status de conexão que ainda representa um canal existente no workspace. */
const ACTIVE_STATUSES = new Set(["active", "attention", "needs_reauth", "error", "expired"]);

/**
 * Sessão utilizável AGORA. Espelha exatamente o filtro usado na descoberta de
 * contas — se a sessão alimenta "Contas disponíveis", ela também precisa
 * alimentar "Portfólio Meta autorizado".
 */
export function isSessionAuthorized(session: SessionRow, nowMs: number = Date.now()): boolean {
  if (session.revoked_at) return false;
  if (!session.user_token_ciphertext) return false;
  if (!session.user_token_expires_at) return true;
  return new Date(session.user_token_expires_at).getTime() > nowMs;
}

const UNKNOWN = "__unknown__";

export function buildMetaPortfolioStatus(
  connections: ConnectionRow[],
  sessions: SessionRow[],
  nowMs: number = Date.now(),
): MetaPortfolioStatus {
  const map = new Map<string, MetaPortfolioSummary & { clientIds: Set<string> }>();
  const ensure = (ownerExternalId: string | null, ownerName: string | null, at: string | null) => {
    const key = ownerExternalId ?? UNKNOWN;
    let entry = map.get(key);
    if (!entry) {
      entry = {
        ownerExternalId,
        ownerName,
        channelCount: 0,
        activeCount: 0,
        attentionCount: 0,
        clientCount: 0,
        channels: [],
        connectedAt: at,
        authorized: false,
        clientIds: new Set<string>(),
      };
      map.set(key, entry);
    }
    if (!entry.ownerName && ownerName) entry.ownerName = ownerName;
    return entry;
  };

  for (const r of connections) {
    if (r.status === "revoked" || !ACTIVE_STATUSES.has(r.status)) continue;
    const entry = ensure(r.owner_external_id ?? null, r.owner_name ?? null, r.created_at);
    entry.channelCount += 1;
    if (r.status === "active") entry.activeCount += 1;
    else entry.attentionCount += 1;
    if (!entry.channels.includes(r.channel)) entry.channels.push(r.channel);
    if (r.client_id) entry.clientIds.add(r.client_id);
  }

  const active = sessions.filter((s) => isSessionAuthorized(s, nowMs));
  for (const s of active) {
    const entry = ensure(s.meta_user_id ?? null, s.meta_user_name ?? null, s.created_at);
    entry.authorized = true;
    if (!entry.connectedAt) entry.connectedAt = s.created_at;
  }

  const newest = active[0] ?? null;

  return {
    authorized: active.length > 0,
    metaUserName: newest?.meta_user_name ?? null,
    metaUserEmail: newest?.meta_user_email ?? null,
    authorizedAt: newest?.created_at ?? null,
    portfolios: [...map.values()].map(({ clientIds, ...p }) => ({
      ...p,
      clientCount: clientIds.size,
    })),
  };
}
