/**
 * Server-only worker helpers for the Brain memory layer.
 * NEVER import from route/component/*.functions.ts module scope.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

const EMBED_MODEL = "openai/text-embedding-3-small";
const EMBED_ENDPOINT = "https://ai.gateway.lovable.dev/v1/embeddings";

/** Cria embedding via Lovable AI Gateway. Retorna null em falha. */
export async function embedText(text: string): Promise<number[] | null> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return null;
  const trimmed = text.replace(/\s+/g, " ").trim().slice(0, 8000);
  if (!trimmed) return null;
  try {
    const res = await fetch(EMBED_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": key,
      },
      body: JSON.stringify({ model: EMBED_MODEL, input: trimmed }),
    });
    if (!res.ok) {
      console.error("[brain-embed] gateway error", res.status, await res.text().catch(() => ""));
      return null;
    }
    const json = (await res.json()) as { data?: Array<{ embedding: number[] }> };
    return json.data?.[0]?.embedding ?? null;
  } catch (err) {
    console.error("[brain-embed] embed failed", err);
    return null;
  }
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
  ["title", "channel", "channels", "format", "stage", "decision", "note", "objective", "kpi", "budget"].forEach(push);
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
  const vec = await embedText(summary);
  if (!vec) return;
  await supabaseAdmin.from("brain_embeddings").insert({
    brand_id: brandId,
    event_id: eventId,
    content_summary: summary,
    // pgvector accepts an array through supabase-js
    embedding: vec as unknown as string,
  });
}