// ⚠️ Brain Memory Store — leitura e escrita de memórias consolidadas.
import type { BrainContext, BrainMemoryRow } from "../core";

export interface RememberInput {
  topic: string;
  summary: string;
  confidence?: number;
  source_module?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

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

export async function remember(
  ctx: BrainContext,
  input: RememberInput,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { data, error } = await ctx.supabase
    .from("brain_memory")
    .insert({
      brand_id: ctx.brandId ?? null,
      client_id: ctx.clientId ?? null,
      topic: input.topic,
      summary: input.summary,
      confidence: input.confidence ?? 0.5,
      source_module: input.source_module ?? "brain.api",
      tags: input.tags ?? [],
      metadata: input.metadata ?? {},
    })
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[brain.memory.remember]", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true, id: (data as { id?: string } | null)?.id };
}

export async function search(
  ctx: BrainContext,
  args: { text: string; limit?: number },
): Promise<BrainMemoryRow[]> {
  const q = ctx.supabase
    .from("brain_memory")
    .select("topic, summary, confidence, brand_id")
    .ilike("summary", `%${args.text}%`)
    .order("confidence", { ascending: false })
    .limit(args.limit ?? 15);
  const { data } = ctx.brandId ? await q.eq("brand_id", ctx.brandId) : await q;
  return ((data ?? []) as Array<BrainMemoryRow>).map((r) => ({
    topic: r.topic,
    summary: r.summary,
    confidence: r.confidence,
  }));
}