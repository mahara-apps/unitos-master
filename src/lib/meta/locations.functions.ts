import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Autocomplete de locais do Instagram usando o Graph API.
 *
 * Reutiliza o token da Página vinculada à conta Instagram Business já
 * conectada em `social_connections`. Retorna uma lista curta de sugestões
 * `{ id, name, subtitle }` para uso em Combobox.
 *
 * Failure-safe: se a busca falhar (token inválido, sem permissão, produto
 * deprecado, etc.) devolve `{ ok: false, results: [], error }` — o wizard
 * mostra a mensagem sem quebrar a UX.
 */

type LocationHit = {
  id: string;
  name: string;
  subtitle: string | null;
};

// Cache em processo (5 min) — reduz chamadas repetidas enquanto o usuário
// digita e re-abre o combobox.
type CacheEntry = { at: number; hits: LocationHit[] };
const searchCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function cacheKey(connectionId: string, q: string) {
  return `${connectionId}::${q.trim().toLowerCase()}`;
}

export const searchInstagramLocationsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        brandId: z.string().uuid(),
        connectionId: z.string().uuid(),
        query: z.string().min(2).max(80),
      })
      .parse(i),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      ok: boolean;
      results: LocationHit[];
      error?: string;
    }> => {
      const q = data.query.trim();
      const ck = cacheKey(data.connectionId, q);
      const hit = searchCache.get(ck);
      if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
        return { ok: true, results: hit.hits };
      }

      const { data: row, error } = await context.supabase
        .from("social_connections")
        .select("id, channel, provider, external_id, access_token_ciphertext, status")
        .eq("id", data.connectionId)
        .eq("brand_id", data.brandId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!row) return { ok: false, results: [], error: "Conexão não encontrada." };
      if (row.channel !== "instagram") {
        return {
          ok: false,
          results: [],
          error: "A busca de locais requer uma conta Instagram conectada.",
        };
      }
      if (!row.access_token_ciphertext) {
        return {
          ok: false,
          results: [],
          error: "Conta sem token — reconecte o Instagram.",
        };
      }

      try {
        const { decryptCredential } = await import(
          "@/lib/credentials-crypto.server"
        );
        const { MetaProvider, MetaGraphError } = await import("./provider.server");
        const pageToken = await decryptCredential(row.access_token_ciphertext);
        const provider = new MetaProvider();

        // Graph API: /pages/search?q=&type=place — retorna Pages do tipo
        // "place" (com location). É o mesmo endpoint que o Meta usa para
        // sugerir locais em publicações da Página.
        type PlaceRow = {
          id: string;
          name: string;
          location?: {
            city?: string;
            state?: string;
            country?: string;
            street?: string;
          };
          category?: string;
        };
        try {
          const res = await provider.graph<{ data: PlaceRow[] }>(
            "/pages/search",
            {
              accessToken: pageToken,
              query: {
                q,
                type: "place",
                fields: "id,name,location{city,state,country,street},category",
                limit: "8",
              },
            },
          );
          const hits: LocationHit[] = (res.data ?? []).map((r) => {
            const parts = [
              r.location?.street,
              r.location?.city,
              r.location?.state,
              r.location?.country,
            ].filter(Boolean) as string[];
            return {
              id: r.id,
              name: r.name,
              subtitle: parts.length ? parts.join(" · ") : (r.category ?? null),
            };
          });
          searchCache.set(ck, { at: Date.now(), hits });
          return { ok: true, results: hits };
        } catch (err) {
          if (err instanceof MetaGraphError) {
            return {
              ok: false,
              results: [],
              error: friendlyGraphError(err.graph?.message ?? err.message),
            };
          }
          throw err;
        }
      } catch (err) {
        return {
          ok: false,
          results: [],
          error: friendlyGraphError((err as Error).message),
        };
      }

    },
  );