import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({ brandId: z.string().uuid().nullable().optional() });

export type BrainCategoryStat = {
  key: "content" | "media" | "messaging" | "insight";
  label: string;
  count24h: number;
};

export type BrainStats = {
  totalEvents: number;
  events24h: number;
  activeInsights: number;
  categories: BrainCategoryStat[];
  recent: Array<{
    id: string;
    brand_id: string | null;
    event_type: string;
    source_module: string;
    payload: Record<string, unknown>;
    created_at: string;
  }>;
  insights: Array<{
    id: string;
    brand_id: string | null;
    insight_type: string;
    description: string;
    confidence: number | null;
    created_at: string;
  }>;
};

function categoryOf(sourceModule: string, eventType: string): BrainCategoryStat["key"] {
  if (eventType.startsWith("insight")) return "insight";
  const s = sourceModule.toLowerCase();
  if (s.includes("media") || s.includes("ads")) return "media";
  if (s.includes("messag") || s.includes("mail") || s.includes("whats")) return "messaging";
  return "content";
}

export const brainStatsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Input.parse(i ?? {}))
  .handler(async ({ data, context }): Promise<BrainStats> => {
    const brandId = data.brandId ?? null;
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    let evQ = context.supabase.from("brain_events").select("*", { count: "exact", head: true });
    if (brandId) evQ = evQ.eq("brand_id", brandId);
    const { count: totalEvents } = await evQ;

    let evQ2 = context.supabase
      .from("brain_events")
      .select("id, brand_id, event_type, source_module, payload, created_at")
      .gte("created_at", since24h)
      .order("created_at", { ascending: false })
      .limit(500);
    if (brandId) evQ2 = evQ2.eq("brand_id", brandId);
    const { data: recent24h } = await evQ2;

    const catCounts: Record<BrainCategoryStat["key"], number> = {
      content: 0,
      media: 0,
      messaging: 0,
      insight: 0,
    };
    for (const e of recent24h ?? []) {
      catCounts[categoryOf(e.source_module as string, e.event_type as string)] += 1;
    }

    let insQ = context.supabase
      .from("brain_insights")
      .select("id, brand_id, insight_type, description, confidence, created_at, expires_at")
      .order("created_at", { ascending: false })
      .limit(30);
    if (brandId) insQ = insQ.or(`brand_id.eq.${brandId},brand_id.is.null`);
    const { data: rawIns } = await insQ;
    const insights = (rawIns ?? [])
      .filter((r) => !r.expires_at || new Date(r.expires_at as string) > new Date())
      .map((r) => ({
        id: r.id as string,
        brand_id: (r.brand_id as string | null) ?? null,
        insight_type: r.insight_type as string,
        description: r.description as string,
        confidence: (r.confidence as number | null) ?? null,
        created_at: r.created_at as string,
      }));

    // Bump insight category count with active insights count so nodes have mass.
    catCounts.insight += insights.length;

    return {
      totalEvents: totalEvents ?? 0,
      events24h: recent24h?.length ?? 0,
      activeInsights: insights.length,
      categories: [
        { key: "content", label: "Conteúdo", count24h: catCounts.content },
        { key: "media", label: "Mídia paga", count24h: catCounts.media },
        { key: "messaging", label: "Mensageria", count24h: catCounts.messaging },
        { key: "insight", label: "Insights", count24h: catCounts.insight },
      ],
      recent: (recent24h ?? []).slice(0, 60).map((r) => ({
        id: r.id as string,
        brand_id: (r.brand_id as string | null) ?? null,
        event_type: r.event_type as string,
        source_module: r.source_module as string,
        payload: (r.payload as Record<string, unknown>) ?? {},
        created_at: r.created_at as string,
      })),
      insights,
    };
  });

/** Pure helper reused on client to bucket a realtime event. */
export function classifyBrainEvent(sourceModule: string, eventType: string): BrainCategoryStat["key"] {
  return categoryOf(sourceModule, eventType);
}