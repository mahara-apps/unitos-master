/**
 * Estado da AUTORIZAÇÃO Meta de um workspace.
 *
 * Vocabulário (não confundir):
 * - autorização Meta  → linha em `meta_oauth_sessions` (token de usuário +
 *   identidade que consentiu). É ela que torna contas "disponíveis".
 * - portfólio/business → `meta_user_id` / `owner_external_id`.
 * - conta descoberta   → item devolvido pela Graph API (cache em `pages`).
 * - canal conectado    → linha em `social_connections` (status != revoked).
 * - vínculo com cliente→ linha em `client_social_accounts`.
 * - histórico          → linhas revogadas/marcadas, preservadas para auditoria.
 *
 * Revogar = marcar `revoked_at`; nada é apagado. Toda query que decide
 * "o que a Meta autoriza AGORA" precisa filtrar `revoked_at is null`.
 */

/** Cliente Supabase mínimo usado aqui (facilita testes com fake). */
type AnyClient = {
  from: (table: string) => any;
};

export const ACTIVE_SESSION_FILTER = "revoked_at" as const;

export type RevokeResult = { removed: number; sessionsRevoked: boolean };

/**
 * Desconecta um portfólio Meta do workspace:
 * revoga canais + vínculos daquele portfólio e SEMPRE revoga a autorização
 * correspondente — inclusive quando nenhum canal havia sido vinculado, caso
 * em que as contas descobertas continuariam aparecendo como "disponíveis".
 *
 * Escopo sempre por `brand_id`: nenhum outro workspace é afetado.
 */
export async function revokeMetaPortfolio(
  supabase: AnyClient,
  params: { brandId: string; ownerExternalId: string | null; reason?: string },
): Promise<RevokeResult> {
  const { brandId, ownerExternalId } = params;
  const reason = params.reason ?? "Portfólio Meta desconectado do workspace pela equipe.";
  const nowIso = new Date().toISOString();

  let query = supabase
    .from("social_connections")
    .select("id")
    .eq("brand_id", brandId)
    .eq("provider", "meta")
    .neq("status", "revoked");
  query = ownerExternalId
    ? query.eq("owner_external_id", ownerExternalId)
    : query.is("owner_external_id", null);
  const { data: conns, error: listErr } = await query;
  if (listErr) throw listErr;
  const ids = ((conns ?? []) as Array<{ id: string }>).map((c) => c.id);

  if (ids.length) {
    const { error: linkErr } = await supabase
      .from("client_social_accounts")
      .delete()
      .eq("brand_id", brandId)
      .in("connection_id", ids);
    if (linkErr) throw linkErr;

    const { error: revokeErr } = await supabase
      .from("social_connections")
      .update({
        status: "revoked",
        client_id: null,
        last_error: reason,
        last_synced_at: nowIso,
      })
      .eq("brand_id", brandId)
      .eq("provider", "meta")
      .in("id", ids);
    if (revokeErr) throw revokeErr;
  }

  const revokeSessions = async (scopeToPortfolio: boolean) => {
    let q = supabase
      .from("meta_oauth_sessions")
      .update({
        revoked_at: nowIso,
        revoked_reason: reason,
        expires_at: nowIso,
        user_token_expires_at: nowIso,
      })
      .eq("brand_id", brandId)
      .is("revoked_at", null);
    if (scopeToPortfolio && ownerExternalId) q = q.eq("meta_user_id", ownerExternalId);
    const { error } = await q;
    if (error) throw error;
  };

  await revokeSessions(true);

  // Sem nenhum canal Meta ativo restante, nenhuma autorização remanescente do
  // workspace faz sentido — revoga todas (ainda escopadas por brand_id).
  const { count } = await supabase
    .from("social_connections")
    .select("id", { count: "exact", head: true })
    .eq("brand_id", brandId)
    .eq("provider", "meta")
    .neq("status", "revoked");
  if (!count) await revokeSessions(false);

  return { removed: ids.length, sessionsRevoked: true };
}
