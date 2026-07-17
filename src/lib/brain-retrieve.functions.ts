// ⚠️ Brain API boundary — este arquivo faz parte da plataforma Brain.
// Consumidores externos NÃO devem importar deste módulo diretamente:
// use o namespace `brain` exportado em `src/lib/brain/api.ts`.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { embedText } from "./brain-embed.server";

const Input = z.object({
  brandId: z.string().uuid(),
  query: z.string().min(1).max(2000),
  k: z.number().int().min(1).max(20).default(8),
});

export type BrainRetrieveResult = {
  memories: Array<{
    event_id: string;
    content_summary: string;
    event_type: string;
    source_module: string;
    created_at: string;
    similarity: number;
  }>;
  insights: Array<{
    id: string;
    insight_type: string;
    description: string;
    confidence: number | null;
  }>;
  block: string;
};

/**
 * Brain — retrieve top-N similar memories + active insights.
 * Returns a prompt-ready markdown block.
 */
export const brainRetrieveFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Input.parse(i))
  .handler(async ({ data, context }): Promise<BrainRetrieveResult> => {
    const vec = await embedText(data.query);
    let memories: BrainRetrieveResult["memories"] = [];
    if (vec) {
      const { data: rows } = await context.supabase.rpc("match_brain_events", {
        _brand_id: data.brandId,
        _query: vec as unknown as string,
        _match_count: data.k,
      });
      memories = (rows ?? []) as BrainRetrieveResult["memories"];
    }
    const { data: ins } = await context.supabase
      .from("brain_insights")
      .select("id, insight_type, description, confidence, expires_at, brand_id")
      .or(`brand_id.eq.${data.brandId},brand_id.is.null`)
      .order("created_at", { ascending: false })
      .limit(10);
    const insights = (ins ?? [])
      .filter((r: { expires_at: string | null }) => !r.expires_at || new Date(r.expires_at) > new Date())
      .map((r) => ({
        id: r.id as string,
        insight_type: r.insight_type as string,
        description: r.description as string,
        confidence: (r.confidence as number | null) ?? null,
      }));

    const parts: string[] = [];
    if (insights.length) {
      parts.push(
        `### Insights ativos\n` +
          insights
            .map(
              (i) =>
                `- (${i.insight_type}${i.confidence != null ? ` · conf ${Math.round(i.confidence * 100)}%` : ""}) ${i.description}`,
            )
            .join("\n"),
      );
    }
    if (memories.length) {
      parts.push(
        `### Memórias relevantes\n` +
          memories
            .map((m) => `- ${m.content_summary} _(sim ${m.similarity.toFixed(2)})_`)
            .join("\n"),
      );
    }
    const block = parts.length
      ? `## Memória do Brain\n${parts.join("\n\n")}`
      : "";

    return { memories, insights, block };
  });