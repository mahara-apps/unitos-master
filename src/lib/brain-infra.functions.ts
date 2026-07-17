import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({ brandId: z.string().uuid().nullable().optional() });

export type BrainInfraSummary = {
  counts: {
    events: number;
    knowledge: number;
    recommendations: number;
    memory: number;
    relationships: number;
    insights: number;
  };
  recentEvents: Array<{
    id: string;
    brand_id: string | null;
    event_type: string;
    source_module: string;
    action: string | null;
    entity_type: string | null;
    entity_id: string | null;
    actor_id: string | null;
    client_id: string | null;
    project_id: string | null;
    confidence: number | null;
    created_at: string;
  }>;
  topRecommendations: Array<{
    id: string;
    title: string;
    description: string | null;
    priority: string;
    status: string;
    confidence: number;
    created_at: string;
  }>;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function countTable(sb: any, table: string, brandId: string | null): Promise<number> {
  let q = sb.from(table).select("id", { count: "exact", head: true });
  if (brandId) q = q.eq("brand_id", brandId);
  const { count } = await q;
  return (count as number | null) ?? 0;
}

export const brainInfraSummaryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Input.parse(i ?? {}))
  .handler(async ({ data, context }): Promise<BrainInfraSummary> => {
    const brandId = data.brandId ?? null;
    const sb = context.supabase;

    const [events, knowledge, recommendations, memory, relationships, insights] =
      await Promise.all([
        countTable(sb, "brain_events", brandId),
        countTable(sb, "brain_knowledge", brandId),
        countTable(sb, "brain_recommendations", brandId),
        countTable(sb, "brain_memory", brandId),
        countTable(sb, "brain_relationships", brandId),
        countTable(sb, "brain_insights", brandId),
      ]);

    let evQ = sb
      .from("brain_events")
      .select(
        "id, brand_id, event_type, source_module, action, entity_type, entity_id, actor_id, client_id, project_id, confidence, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(30);
    if (brandId) evQ = evQ.eq("brand_id", brandId);
    const { data: recentEvents } = await evQ;

    let recQ = sb
      .from("brain_recommendations")
      .select("id, title, description, priority, status, confidence, created_at")
      .in("status", ["pending", "shown"])
      .order("priority", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(10);
    if (brandId) recQ = recQ.eq("brand_id", brandId);
    const { data: topRecs } = await recQ;

    return {
      counts: { events, knowledge, recommendations, memory, relationships, insights },
      recentEvents: (recentEvents ?? []) as BrainInfraSummary["recentEvents"],
      topRecommendations: (topRecs ?? []) as BrainInfraSummary["topRecommendations"],
    };
  });