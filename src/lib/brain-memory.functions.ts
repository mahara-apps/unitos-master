import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type BrainMemoryRow = {
  id: string;
  brand_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  category: string | null;
  title: string | null;
  description: string | null;
  confidence: number;
  status: string;
  tags: string[];
  relations: unknown[] | Record<string, unknown>;
  metadata: Record<string, unknown>;
  source_event: string | null;
  content: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

const ListInput = z.object({
  brandId: z.string().uuid().nullable().optional(),
  search: z.string().trim().max(200).optional(),
  category: z.string().max(80).optional(),
  entityType: z.string().max(80).optional(),
  entityId: z.string().uuid().optional(),
  status: z.string().max(40).optional(),
  tags: z.array(z.string()).max(20).optional(),
  minConfidence: z.number().min(0).max(1).optional(),
  sort: z.enum(["confidence", "recent", "title"]).default("confidence"),
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFilters(q: any, data: z.infer<typeof ListInput>) {
  if (data.brandId) q = q.eq("brand_id", data.brandId);
  if (data.category) q = q.eq("category", data.category);
  if (data.entityType) q = q.eq("entity_type", data.entityType);
  if (data.entityId) q = q.eq("entity_id", data.entityId);
  if (data.status) q = q.eq("status", data.status);
  if (data.tags?.length) q = q.contains("tags", data.tags);
  if (typeof data.minConfidence === "number") q = q.gte("confidence", data.minConfidence);
  if (data.search) {
    const s = data.search.replace(/[%_]/g, "\\$&");
    q = q.or(`title.ilike.%${s}%,description.ilike.%${s}%`);
  }
  return q;
}

const SELECT =
  "id, brand_id, entity_type, entity_id, category, title, description, confidence, status, tags, relations, metadata, source_event, content, created_at, updated_at";

export const listBrainMemories = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ListInput.parse(i ?? {}))
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("brain_memory").select(SELECT);
    q = applyFilters(q, data);
    if (data.sort === "confidence") q = q.order("confidence", { ascending: false });
    else if (data.sort === "recent") q = q.order("updated_at", { ascending: false });
    else q = q.order("title", { ascending: true });
    q = q.range(data.offset, data.offset + data.limit - 1);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as BrainMemoryRow[];
  });

const GroupInput = ListInput.extend({
  groupBy: z.enum(["category", "entity_type", "status"]).default("category"),
});

export const groupBrainMemories = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => GroupInput.parse(i ?? {}))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("brain_memory")
      .select("category, entity_type, status, confidence");
    q = applyFilters(q, data);
    const { data: rows, error } = await q.limit(5000);
    if (error) throw new Error(error.message);
    const acc = new Map<string, { key: string; count: number; avgConfidence: number }>();
    for (const r of (rows ?? []) as Array<Record<string, unknown>>) {
      const key = String(r[data.groupBy] ?? "—");
      const conf = Number(r.confidence ?? 0);
      const cur = acc.get(key) ?? { key, count: 0, avgConfidence: 0 };
      cur.avgConfidence = (cur.avgConfidence * cur.count + conf) / (cur.count + 1);
      cur.count += 1;
      acc.set(key, cur);
    }
    return Array.from(acc.values()).sort((a, b) => b.count - a.count);
  });

const RelateInput = z.object({
  memoryId: z.string().uuid(),
  limit: z.number().int().min(1).max(50).default(10),
});

export const relateBrainMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => RelateInput.parse(i))
  .handler(async ({ data, context }) => {
    const { data: base, error: e1 } = await context.supabase
      .from("brain_memory")
      .select(SELECT)
      .eq("id", data.memoryId)
      .maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!base) return { base: null, related: [] as BrainMemoryRow[] };
    const b = base as unknown as BrainMemoryRow;

    let q = context.supabase
      .from("brain_memory")
      .select(SELECT)
      .neq("id", b.id)
      .order("confidence", { ascending: false })
      .limit(data.limit);
    if (b.brand_id) q = q.eq("brand_id", b.brand_id);
    // Related = same entity OR same category OR shared tag
    const orParts: string[] = [];
    if (b.entity_type && b.entity_id)
      orParts.push(`and(entity_type.eq.${b.entity_type},entity_id.eq.${b.entity_id})`);
    if (b.category) orParts.push(`category.eq.${b.category}`);
    if (b.tags?.length) orParts.push(`tags.ov.{${b.tags.join(",")}}`);
    if (orParts.length) q = q.or(orParts.join(","));
    const { data: rel, error: e2 } = await q;
    if (e2) throw new Error(e2.message);
    return { base: b, related: (rel ?? []) as unknown as BrainMemoryRow[] };
  });

const ConsolidateInput = z.object({ brandId: z.string().uuid().nullable().optional() });

export const consolidateBrainMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ConsolidateInput.parse(i ?? {}))
  .handler(async ({ data, context }) => {
    const { data: written, error } = await context.supabase.rpc("consolidate_brain_memory", {
      _brand_id: data.brandId ?? undefined,
    });
    if (error) throw new Error(error.message);
    return { written: Number(written ?? 0) };
  });