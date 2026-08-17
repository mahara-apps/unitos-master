// Pré-validação de permissão de publicação no Meta — server-only.
//
// Objetivo: bloquear uma republicação ANTES de consumir tentativa do worker
// quando o token da página não tem permissão para publicar naquele destino
// (o caso clássico é o erro "(#10) Application does not have permission").
//
// Leitura apenas (GET). Nunca publica nada.

import { MetaProvider, MetaGraphError } from "./provider.server";
import { decryptCredential } from "@/lib/credentials-crypto.server";

export type ReadinessInput = {
  channel: string;
  pageId: string;
  igUserId: string | null;
  tokenCiphertext: string;
};

export type ReadinessResult = { ok: true } | { ok: false; error: string };

export async function verifyMetaPublishReadiness(
  input: ReadinessInput,
): Promise<ReadinessResult> {
  let token: string;
  try {
    token = await decryptCredential(input.tokenCiphertext);
  } catch {
    return {
      ok: false,
      error: "Token da conexão inválido — reconecte a conta em Canais.",
    };
  }

  const provider = new MetaProvider();

  try {
    if (input.channel === "instagram") {
      if (!input.igUserId) {
        return {
          ok: false,
          error: "Conexão sem conta Instagram Business vinculada.",
        };
      }
      // Se o app não tem permissão concedida para ESTA conta IG, esta leitura
      // já falha com code 10 / 190 — exatamente o bloqueio que queremos.
      await provider.graph<{ id: string }>(`/${input.igUserId}`, {
        accessToken: token,
        query: { fields: "id,username" },
      });
      return { ok: true };
    }

    await provider.graph<{ id: string }>(`/${input.pageId}`, {
      accessToken: token,
      query: { fields: "id,name" },
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof MetaGraphError) {
      const code = err.graph?.code;
      if (code === 10 || code === 200 || code === 190) {
        return {
          ok: false,
          error:
            "A conta não tem permissão de publicação concedida ao app. Reconecte a conexão Meta autorizando esta conta antes de republicar.",
        };
      }
      return { ok: false, error: `Meta: ${err.message}` };
    }
    // Falhas de rede não devem bloquear a republicação: o worker tenta de novo.
    return { ok: true };
  }
}
