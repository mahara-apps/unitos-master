// ⚠️ Brain API boundary — este arquivo faz parte da plataforma Brain.
// Consumidores externos NÃO devem importar deste módulo diretamente:
// use o namespace `brain` exportado em `src/lib/brain/api.ts`.
/**
 * Server-only worker helpers for the Brain memory layer.
 * NEVER import from route/component/*.functions.ts module scope.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/** Cria embedding com a chave de API da própria marca. Null em falha. */
export async function embedText(
  supabase: SupabaseClient,
  brandId: string,
  text: string,
): Promise<number[] | null> {
  const { embedTextWithBrandKey } = await import("@/lib/ai-provider.server");
  return embedTextWithBrandKey(supabase, brandId, text);
}

/** Resumo curto legível para busca semântica. */
export function summarizeEvent(input: {
  event_type: string;
  source_module: string;
  payload: unknown;
}): string {
  const p = (input.payload ?? {}) as Record<string, unknown>;
  const bits: string[] = [`[${input.source_module}/${input.event_type}]`];
  const push = (k: string) => {
    const v = p[k];
    if (typeof v === "string" && v.trim()) bits.push(`${k}: ${v.trim().slice(0, 300)}`);
    else if (typeof v === "number") bits.push(`${k}: ${v}`);
  };
  [
    "title",
    "channel",
    "channels",
    "format",
    "stage",
    "decision",
    "note",
    "objective",
    "kpi",
    "budget",
  ].forEach(push);
  if (bits.length === 1) bits.push(JSON.stringify(p).slice(0, 400));
  return bits.join(" · ");
}

/** Grava um evento + agenda embedding em background usando o admin client. */
export async function embedEventNow(
  supabaseAdmin: SupabaseClient,
  eventId: string,
  brandId: string,
  summary: string,
) {
  const vec = await embedText(supabaseAdmin, brandId, summary);
  if (!vec) return;
  await supabaseAdmin.from("brain_embeddings").insert({
    brand_id: brandId,
    event_id: eventId,
    content_summary: summary,
    // pgvector accepts an array through supabase-js
    embedding: vec as unknown as string,
  });
}
