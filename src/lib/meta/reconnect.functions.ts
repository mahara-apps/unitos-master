import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { humanizeMetaError } from "@/lib/meta/error-messages";

/**
 * Reconexão explícita de um canal já conectado.
 *
 * Regra crítica: NUNCA substituir silenciosamente a conta vinculada.
 * `inspectMetaConnectionFn` é uma leitura em modo seco (não escreve nada) que
 * compara a conta atual com a conta que a Meta devolve agora.
 * `applyMetaReconnectFn` só grava os identificadores novos quando o usuário
 * confirma (`acceptNewAccount: true`); caso contrário mantém a configuração
 * atual e apenas atualiza o carimbo de verificação.
 *
 * Não altera tokens, escopos, criptografia, worker ou pipeline de publicação.
 */

const Input = z.object({
  brandId: z.string().uuid(),
  connectionId: z.string().uuid(),
});

export type ChannelAccountSnapshot = {
  pageId: string | null;
  pageName: string | null;
  instagramBusinessId: string | null;
  instagramUsername: string | null;
};

export type InspectResult = {
  ok: boolean;
  changed: boolean;
  current: ChannelAccountSnapshot;
  found: ChannelAccountSnapshot | null;
  /** Mensagem operacional (sem detalhe técnico). */
  message: { title: string; description: string } | null;
};

async function loadConnection(
  supabase: {
    from: (t: string) => {
      select: (c: string) => {
        eq: (
          k: string,
          v: string,
        ) => {
          eq: (
            k: string,
            v: string,
          ) => {
            eq: (
              k: string,
              v: string,
            ) => { maybeSingle: () => Promise<{ data: unknown; error: unknown }> };
          };
        };
      };
    };
  },
  connectionId: string,
  brandId: string,
) {
  const res = await supabase
    .from("social_connections")
    .select(
      "id, channel, external_id, external_name, account_id, account_username, page_id, instagram_business_id, access_token_ciphertext",
    )
    .eq("id", connectionId)
    .eq("brand_id", brandId)
    .eq("provider", "meta")
    .maybeSingle();
  if (res.error) throw new Error("connection_read_failed");
  return res.data as {
    id: string;
    channel: string;
    external_id: string;
    external_name: string | null;
    account_id: string | null;
    account_username: string | null;
    page_id: string | null;
    instagram_business_id: string | null;
    access_token_ciphertext: string;
  } | null;
}

export const inspectMetaConnectionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Input.parse(i))
  .handler(async ({ data, context }): Promise<InspectResult> => {
    const row = await loadConnection(
      context.supabase as never,
      data.connectionId,
      data.brandId,
    );
    if (!row) {
      return {
        ok: false,
        changed: false,
        current: {
          pageId: null,
          pageName: null,
          instagramBusinessId: null,
          instagramUsername: null,
        },
        found: null,
        message: {
          title: "Canal não encontrado",
          description:
            "Esta conexão não existe mais neste workspace. Conecte o canal novamente.",
        },
      };
    }

    const current: ChannelAccountSnapshot = {
      pageId: row.page_id ?? row.external_id ?? null,
      pageName: row.external_name ?? null,
      instagramBusinessId: row.instagram_business_id ?? row.account_id ?? null,
      instagramUsername: row.account_username ?? null,
    };

    try {
      const { decryptCredential } = await import("@/lib/credentials-crypto.server");
      const { MetaProvider } = await import("./provider.server");
      const provider = new MetaProvider();
      const pageToken = await decryptCredential(row.access_token_ciphertext);
      const page = await provider.graph<{
        id: string;
        name: string;
        instagram_business_account?: { id: string; username?: string };
      }>(`/${row.external_id}`, {
        accessToken: pageToken,
        query: { fields: "id,name,instagram_business_account{id,username}" },
      });

      const found: ChannelAccountSnapshot = {
        pageId: page.id ?? null,
        pageName: page.name ?? null,
        instagramBusinessId: page.instagram_business_account?.id ?? null,
        instagramUsername: page.instagram_business_account?.username ?? null,
      };

      const changed =
        (current.pageId ?? "") !== (found.pageId ?? "") ||
        (current.instagramBusinessId ?? "") !== (found.instagramBusinessId ?? "") ||
        (current.instagramUsername ?? "") !== (found.instagramUsername ?? "");

      return { ok: true, changed, current, found, message: null };
    } catch (err) {
      console.error("[meta:inspect] falha ao verificar conexão", err);
      const friendly = humanizeMetaError(err);
      return {
        ok: false,
        changed: false,
        current,
        found: null,
        message: {
          title: "Não foi possível atualizar a conexão",
          description: friendly.description,
        },
      };
    }
  });

const ApplyInput = Input.extend({
  /** true = usuário confirmou explicitamente a troca de conta. */
  acceptNewAccount: z.boolean().default(false),
});

export const applyMetaReconnectFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ApplyInput.parse(i))
  .handler(async ({ data, context }) => {
    const row = await loadConnection(
      context.supabase as never,
      data.connectionId,
      data.brandId,
    );
    if (!row) {
      return {
        ok: false,
        message: {
          title: "Canal não encontrado",
          description: "Conecte o canal novamente para continuar publicando.",
        },
      };
    }

    try {
      const { decryptCredential } = await import("@/lib/credentials-crypto.server");
      const { MetaProvider } = await import("./provider.server");
      const provider = new MetaProvider();
      const pageToken = await decryptCredential(row.access_token_ciphertext);
      const page = await provider.graph<{
        id: string;
        name: string;
        instagram_business_account?: { id: string; username?: string };
      }>(`/${row.external_id}`, {
        accessToken: pageToken,
        query: { fields: "id,name,instagram_business_account{id,username}" },
      });

      const nowIso = new Date().toISOString();
      const patch: Record<string, unknown> = {
        status: "active",
        last_error: null,
        last_synced_at: nowIso,
      };

      const igChanged =
        (row.instagram_business_id ?? row.account_id ?? "") !==
        (page.instagram_business_account?.id ?? "");

      if (data.acceptNewAccount) {
        patch.external_name = page.name ?? row.external_name;
        patch.account_id = page.instagram_business_account?.id ?? null;
        patch.account_username = page.instagram_business_account?.username ?? null;
        if (row.channel === "instagram") {
          patch.instagram_business_id = page.instagram_business_account?.id ?? null;
        }
      } else if (!igChanged) {
        // Sem troca de conta: só normalizamos o nome exibido.
        patch.external_name = page.name ?? row.external_name;
      }

      const { error } = await context.supabase
        .from("social_connections")
        .update(patch)
        .eq("id", row.id)
        .eq("brand_id", data.brandId);
      if (error) throw new Error(error.message);

      return {
        ok: true,
        accountChanged: igChanged,
        applied: data.acceptNewAccount,
        message: null as null | { title: string; description: string },
      };
    } catch (err) {
      console.error("[meta:reconnect] falha ao aplicar reconexão", err);
      const friendly = humanizeMetaError(err);
      await context.supabase
        .from("social_connections")
        .update({ status: "attention" })
        .eq("id", data.connectionId)
        .eq("brand_id", data.brandId);
      return {
        ok: false,
        message: {
          title: "Não foi possível atualizar a conexão",
          description: friendly.description,
        },
      };
    }
  });
