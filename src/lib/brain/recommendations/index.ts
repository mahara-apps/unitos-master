// ⚠️ Brain Recommendation Engine — leitura de recomendações ativas.
import type { BrainContext } from "../core";

export interface BrainRecommendationRow {
  recommendation_type: string;
  title: string;
  description: string | null;
  confidence: number | null;
}

export async function list(
  ctx: BrainContext,
  opts: { limit?: number } = {},
): Promise<BrainRecommendationRow[]> {
  const q = ctx.supabase
    .from("brain_recommendations")
    .select("recommendation_type, title, description, confidence, brand_id")
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 15);
  const { data } = ctx.brandId ? await q.eq("brand_id", ctx.brandId) : await q;
  return ((data ?? []) as Array<BrainRecommendationRow>).map((r) => ({
    recommendation_type: r.recommendation_type,
    title: r.title,
    description: r.description,
    confidence: r.confidence,
  }));
}