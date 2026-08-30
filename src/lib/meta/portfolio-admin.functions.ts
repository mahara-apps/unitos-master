import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Gestão do PORTFÓLIO Meta no nível do workspace.
 *
 * Portfólio (Business/Portfólio empresarial da Meta) é a identidade que
 * autoriza o workspace; cada Página/conta IG conectada vive em
 * `social_connections` com `owner_external_id`/`owner_name` apontando para ele.
 *
 * - Troca de portfólio = novo OAuth (`startMetaOAuth` com `forceReauth`) e nova
 *   seleção de contas. Nada é gravado até a seleção, então a conexão atual
 *   permanece intacta se a nova autorização falhar.
 * - Desconectar portfólio = revoga (logicamente) as conexões daquele portfólio
 *   no workspace, remove os vínculos com clientes e expira as sessões OAuth
 *   quando não resta nenhum portfólio ativo.
 *
 * Todas as leituras/escritas são filtradas por `brand_id` e passam pelo cliente
 * autenticado (RLS). Ações de escrita exigem Owner/Admin/Super Admin.
 */

const BrandInput = z.object({ brandId: z.string().uuid() });

const DisconnectInput = z.object({
  brandId: z.string().uuid(),
  /** `null` agrupa conexões antigas sem portfólio identificado. */
  ownerExternalId: z.string().max(120).nullable(),
});

export type MetaPortfolioSummary = {
  ownerExternalId: string | null;
  ownerName: string | null;
  channelCount: number;
  activeCount: number;
  attentionCount: number;
  clientCount: number;
  channels: string[];
  connectedAt: string | null;
};

export type MetaPortfolioStatus = {
  /** Identidade Meta da última autorização válida deste usuário no workspace. */
  metaUserName: string | null;
  metaUserEmail: string | null;
  authorizedAt: string | null;
  portfolios: MetaPortfolioSummary[];
};

const ACTIVE_STATUSES = new Set(["active", "attention", "needs_reauth", "error", "expired"]);

export const getMetaPortfolioStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => BrandInput.parse(input))
  .handler(async ({ data, context }): Promise<MetaPortfolioStatus> => {
    const { data: rows, error } = await context.supabase
      .from("social_connections")
      .select(
        "id, channel, status, owner_external_id, owner_name, client_id, created_at, external_name",
      )
      .eq("brand_id", data.brandId)
      .eq("provider", "meta")
      .order("created_at", { ascending: true });
    if (error) throw error;

    const byPortfolio = new Map<string, MetaPortfolioSummary & { clientIds: Set<string> }>();
    for (const r of rows ?? []) {
      if (r.status === "revoked") continue;
      if (!ACTIVE_STATUSES.has(r.status)) continue;
      const key = r.owner_external_id ?? "__unknown__";
      let entry = byPortfolio.get(key);
      if (!entry) {
        entry = {
          ownerExternalId: r.owner_external_id ?? null,
          ownerName: r.owner_name ?? null,
          channelCount: 0,
          activeCount: 0,
          attentionCount: 0,
          clientCount: 0,
          channels: [],
          connectedAt: r.created_at,
          clientIds: new Set<string>(),
        };
        byPortfolio.set(key, entry);
      }
      if (!entry.ownerName && r.owner_name) entry.ownerName = r.owner_name;
      entry.channelCount += 1;
      if (r.status === "active") entry.activeCount += 1;
      else entry.attentionCount += 1;
      if (!entry.channels.includes(r.channel)) entry.channels.push(r.channel);
      if (r.client_id) entry.clientIds.add(r.client_id);
    }

    const nowIso = new Date().toISOString();
    const { data: sess } = await context.supabase
      .from("meta_oauth_sessions")
      .select("meta_user_name, meta_user_email, created_at")
      .eq("brand_id", data.brandId)
      .eq("user_id", context.userId)
      .or(`user_token_expires_at.is.null,user_token_expires_at.gt.${nowIso}`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return {
      metaUserName: sess?.meta_user_name ?? null,
      metaUserEmail: sess?.meta_user_email ?? null,
      authorizedAt: sess?.created_at ?? null,
      portfolios: [...byPortfolio.values()].map(({ clientIds, ...p }) => ({
        ...p,
        clientCount: clientIds.size,
      })),
    };
  });

export const disconnectMetaPortfolioFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DisconnectInput.parse(input))
  .handler(
    async ({
      data,
      context,
    }): Promise<{ ok: boolean; removed: number; message: string }> => {
      const { isBrandAdmin } = await import("@/lib/monthly-plan-delete.server");
      if (!(await isBrandAdmin(context.supabase, context.userId, data.brandId))) {
        return {
          ok: false,
          removed: 0,
          message: "Apenas Owner, Admin ou Super Admin podem desconectar um portfólio Meta.",
        };
      }

      let query = context.supabase
        .from("social_connections")
        .select("id")
        .eq("brand_id", data.brandId)
        .eq("provider", "meta")
        .neq("status", "revoked");
      query = data.ownerExternalId
        ? query.eq("owner_external_id", data.ownerExternalId)
        : query.is("owner_external_id", null);
      const { data: conns, error: listErr } = await query;
      if (listErr) throw listErr;
      const ids = (conns ?? []).map((c) => c.id);
      if (!ids.length) {
        return { ok: true, removed: 0, message: "Nenhuma conexão ativa neste portfólio." };
      }

      const { error: linkErr } = await context.supabase
        .from("client_social_accounts")
        .delete()
        .eq("brand_id", data.brandId)
        .in("connection_id", ids);
      if (linkErr) throw linkErr;

      const { error: revokeErr } = await context.supabase
        .from("social_connections")
        .update({
          status: "revoked",
          client_id: null,
          last_error: "Portfólio Meta desconectado do workspace pela equipe.",
          last_synced_at: new Date().toISOString(),
        })
        .eq("brand_id", data.brandId)
        .eq("provider", "meta")
        .in("id", ids);
      if (revokeErr) throw revokeErr;

      // Se não sobrou nenhuma conexão Meta ativa, as sessões OAuth deste
      // workspace deixam de fazer sentido e são expiradas.
      const { count } = await context.supabase
        .from("social_connections")
        .select("id", { count: "exact", head: true })
        .eq("brand_id", data.brandId)
        .eq("provider", "meta")
        .neq("status", "revoked");
      if (!count) {
        const nowIso = new Date().toISOString();
        await context.supabase
          .from("meta_oauth_sessions")
          .update({ expires_at: nowIso, user_token_expires_at: nowIso })
          .eq("brand_id", data.brandId);
      }

      return {
        ok: true,
        removed: ids.length,
        message: `${ids.length} canal(is) desconectado(s) deste portfólio.`,
      };
    },
  );
