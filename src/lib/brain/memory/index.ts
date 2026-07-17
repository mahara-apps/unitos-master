// ⚠️ Brain Memory Store — leitura de memórias consolidadas.
import type { BrainContext, BrainMemoryRow } from "../core";

export async function list(
  ctx: BrainContext,
  opts: { limit?: number } = {},
): Promise<BrainMemoryRow[]> {
  const q = ctx.supabase
    .from("brain_memory")
    .select("topic, summary, confidence, brand_id")
    .order("confidence", { ascending: false })
    .limit(opts.limit ?? 15);
  const { data } = ctx.brandId ? await q.eq("brand_id", ctx.brandId) : await q.is("brand_id", null);
  return ((data ?? []) as Array<BrainMemoryRow>).slice(0, opts.limit ?? 15).map((r) => ({
    topic: r.topic,
    summary: r.summary,
    confidence: r.confidence,
  }));
}