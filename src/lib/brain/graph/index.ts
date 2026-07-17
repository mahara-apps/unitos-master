// ⚠️ Brain Knowledge Graph — leitura de nós/arestas do grafo relacional.
import type { BrainContext } from "../core";

export async function edges(
  ctx: BrainContext,
  opts: { limit?: number } = {},
): Promise<Array<Record<string, unknown>>> {
  const q = ctx.supabase
    .from("brain_relationships")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 200);
  const { data } = ctx.brandId ? await q.eq("brand_id", ctx.brandId) : await q;
  return (data ?? []) as Array<Record<string, unknown>>;
}