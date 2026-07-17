// ⚠️ Brain API boundary — este arquivo faz parte da plataforma Brain.
// Consumidores externos NÃO devem importar deste módulo diretamente:
// use o namespace `brain` exportado em `src/lib/brain/api.ts`.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { waitUntil } from "../../wait-until.server";

const IngestInput = z.object({
  brandId: z.string().uuid(),
  eventType: z.string().min(1).max(64),
  sourceModule: z.string().min(1).max(64),
  payload: z.record(z.string(), z.unknown()).default({}),
  outcomeScore: z.number().optional(),
});

/**
 * Brain — ingest an event into the memory layer.
 * Fire-and-forget from any module. Embedding runs in background.
 */
export const brainIngestFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => IngestInput.parse(i))
  .handler(async ({ data, context }) => {
    // RLS: user must be brand member (policy enforces).
    const { data: row, error } = await context.supabase
      .from("brain_events")
      .insert({
        brand_id: data.brandId,
        event_type: data.eventType,
        source_module: data.sourceModule,
        payload: data.payload as never,
        outcome_score: data.outcomeScore ?? null,
      })
      .select("id")
      .single();
    if (error) throw error;

    waitUntil(
      (async () => {
        const [{ supabaseAdmin }, embed] = await Promise.all([
          import("@/integrations/supabase/client.server"),
          import("./brain-embed.server"),
        ]);
        const summary = embed.summarizeEvent({
          event_type: data.eventType,
          source_module: data.sourceModule,
          payload: data.payload,
        });
        await embed.embedEventNow(supabaseAdmin, row.id, data.brandId, summary);
      })(),
    );

    return { ok: true as const, id: row.id };
  });