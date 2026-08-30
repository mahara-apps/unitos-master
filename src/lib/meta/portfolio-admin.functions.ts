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

export type {
  MetaPortfolioSummary,
  MetaPortfolioStatus,
} from "@/lib/meta/authorization-state";

export const getMetaPortfolioStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => BrandInput.parse(input))
  .handler(async ({ data, context }) => {
    const { buildMetaPortfolioStatus } = await import("@/lib/meta/authorization-state");

    // Autorização (meta_oauth_sessions) e canais (social_connections) são
    // fontes de verdade DISTINTAS. O painel reconhece a autorização mesmo com
    // zero conexões — o mesmo filtro usado na descoberta de contas.
    const [connRes, sessRes] = await Promise.all([
      context.supabase
        .from("social_connections")
        .select("channel, status, owner_external_id, owner_name, client_id, created_at")
        .eq("brand_id", data.brandId)
        .eq("provider", "meta")
        .order("created_at", { ascending: true }),
      context.supabase
        .from("meta_oauth_sessions")
        .select(
          "meta_user_id, meta_user_name, meta_user_email, user_token_ciphertext, user_token_expires_at, revoked_at, created_at",
        )
        .eq("brand_id", data.brandId)
        .is("revoked_at", null)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);
    if (connRes.error) throw connRes.error;
    if (sessRes.error) throw sessRes.error;

    return buildMetaPortfolioStatus(
      (connRes.data ?? []) as never,
      (sessRes.data ?? []) as never,
    );
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

      // A autorização Meta é revogada SEMPRE, mesmo quando o portfólio não
      // tinha nenhum canal vinculado: sem isso as contas descobertas por
      // aquela autorização continuariam listadas como "disponíveis".
      // Histórico preservado (linhas marcadas, nunca apagadas).
      const { revokeMetaPortfolio } = await import("@/lib/meta/authorization.server");
      const { removed } = await revokeMetaPortfolio(context.supabase, {
        brandId: data.brandId,
        ownerExternalId: data.ownerExternalId,
      });

      return {
        ok: true,
        removed,
        message: removed
          ? `${removed} canal(is) desconectado(s) e autorização Meta revogada.`
          : "Autorização Meta revogada. Nenhum canal estava vinculado a este portfólio.",
      };
    },
  );
