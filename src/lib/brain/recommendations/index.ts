// ⚠️ Brain Recommendation Engine — leitura de recomendações ativas.
import type { BrainContext } from "../core";

export interface BrainRecommendationRow {
  recommendation_type: string;
  title: string;
  description: string | null;
  confidence: number | null;
}

export interface CreateRecommendationInput {
  recommendation_type: string;
  title: string;
  description?: string | null;
  confidence?: number;
  metadata?: Record<string, unknown>;
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

export async function create(
  ctx: BrainContext,
  input: CreateRecommendationInput,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { data, error } = await ctx.supabase
    .from("brain_recommendations")
    .insert({
      brand_id: ctx.brandId ?? null,
      client_id: ctx.clientId ?? null,
      recommendation_type: input.recommendation_type,
      title: input.title,
      description: input.description ?? null,
      confidence: input.confidence ?? 0.5,
      metadata: input.metadata ?? {},
    })
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[brain.recommendations.create]", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true, id: (data as { id?: string } | null)?.id };
}