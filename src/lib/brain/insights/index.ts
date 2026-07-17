// ⚠️ Brain Insight Engine — leitura de insights ativos.
import type { BrainContext, BrainInsightRow } from "../core";

export interface CreateInsightInput {
  insight_type: string;
  description: string;
  confidence?: number;
  expires_at?: string | null;
  metadata?: Record<string, unknown>;
}

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

export async function create(
  ctx: BrainContext,
  input: CreateInsightInput,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { data, error } = await ctx.supabase
    .from("brain_insights")
    .insert({
      brand_id: ctx.brandId ?? null,
      insight_type: input.insight_type,
      description: input.description,
      confidence: input.confidence ?? 0.5,
      expires_at: input.expires_at ?? null,
      metadata: input.metadata ?? {},
    })
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[brain.insights.create]", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true, id: (data as { id?: string } | null)?.id };
}

export async function patterns(
  ctx: BrainContext,
  opts: { limit?: number } = {},
): Promise<BrainInsightRow[]> {
  const q = ctx.supabase
    .from("brain_insights")
    .select("insight_type, description, confidence, expires_at, brand_id")
    .ilike("insight_type", "%pattern%")
    .order("confidence", { ascending: false })
    .limit(opts.limit ?? 10);
  const { data } = ctx.brandId
    ? await q.or(`brand_id.eq.${ctx.brandId},brand_id.is.null`)
    : await q.is("brand_id", null);
  return (data ?? []) as Array<BrainInsightRow>;
}
