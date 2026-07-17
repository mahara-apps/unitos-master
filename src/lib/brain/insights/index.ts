// ⚠️ Brain Insight Engine — leitura de insights ativos.
import type { BrainContext, BrainInsightRow } from "../core";

export async function list(
  ctx: BrainContext,
  opts: { limit?: number } = {},
): Promise<BrainInsightRow[]> {
  const q = ctx.supabase
    .from("brain_insights")
    .select("insight_type, description, confidence, expires_at, brand_id")
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 15);
  const { data } = ctx.brandId
    ? await q.or(`brand_id.eq.${ctx.brandId},brand_id.is.null`)
    : await q.is("brand_id", null);
  return ((data ?? []) as Array<BrainInsightRow>)
    .filter((r) => !r.expires_at || new Date(r.expires_at) > new Date())
    .slice(0, opts.limit ?? 8);
}