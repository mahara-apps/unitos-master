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

// ---------- Lifecycle: evolve / touch / versions / decay ----------

export interface EvolveInput {
  entityType: string;
  entityId: string;
  category: string;
  title: string;
  description?: string | null;
  content?: Record<string, unknown>;
  evidenceConfidence?: number;
  origin?: "system" | "event" | "learning" | "consolidation" | "manual" | "api" | "chat";
  sourceEvent?: string | null;
  tags?: string[];
  relations?: Array<Record<string, unknown>>;
  metadata?: Record<string, unknown>;
  contradicts?: boolean;
}

export async function evolve(
  ctx: BrainContext,
  input: EvolveInput,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rpc = ctx.supabase.rpc as unknown as (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  const { data, error } = await rpc("brain_memory_evolve", {
    _brand_id: ctx.brandId ?? null,
    _entity_type: input.entityType,
    _entity_id: input.entityId,
    _category: input.category,
    _title: input.title,
    _description: input.description ?? null,
    _content: input.content ?? {},
    _evidence_confidence: input.evidenceConfidence ?? 0.6,
    _origin: input.origin ?? "system",
    _source_event: input.sourceEvent ?? null,
    _tags: input.tags ?? [],
    _relations: input.relations ?? [],
    _metadata: input.metadata ?? {},
    _contradicts: input.contradicts ?? false,
  });
  if (error) {
    console.error("[brain.memory.evolve]", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true, id: data ? String(data) : undefined };
}

export async function touch(ctx: BrainContext, ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rpc = ctx.supabase.rpc as unknown as (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  const { data, error } = await rpc("brain_memory_touch", { _ids: ids });
  if (error) {
    console.error("[brain.memory.touch]", error.message);
    return 0;
  }
  return Number(data ?? 0);
}

export async function versions(
  ctx: BrainContext,
  memoryId: string,
  limit = 30,
): Promise<Array<Record<string, unknown>>> {
  const { data, error } = await ctx.supabase
    .from("brain_memory_versions")
    .select(
      "id, memory_id, version, confidence, previous_confidence, delta_confidence, title, description, status, change_reason, source_event, created_at",
    )
    .eq("memory_id", memoryId)
    .order("version", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[brain.memory.versions]", error.message);
    return [];
  }
  return (data ?? []) as Array<Record<string, unknown>>;
}

export async function decay(ctx: BrainContext): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rpc = ctx.supabase.rpc as unknown as (name: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  const { data, error } = await rpc("brain_memory_decay_and_archive", {});
  if (error) {
    console.error("[brain.memory.decay]", error.message);
    return 0;
  }
  return Number(data ?? 0);
}