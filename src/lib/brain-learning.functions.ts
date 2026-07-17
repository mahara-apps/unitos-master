// ⚠️ Brain API boundary — este arquivo faz parte da plataforma Brain.
// Consumidores externos NÃO devem importar deste módulo diretamente:
// use o namespace `brain` exportado em `src/lib/brain/api.ts`.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const RunInput = z.object({ limit: z.number().int().min(1).max(1000).default(200) });

export const runBrainLearning = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => RunInput.parse(i ?? {}))
  .handler(async ({ data, context }) => {
    const { data: out, error } = await context.supabase.rpc(
      "process_brain_learning_queue",
      { _limit: data.limit },
    );
    if (error) throw new Error(error.message);
    return (out ?? { processed: 0, failed: 0, memories: 0, insights: 0 }) as {
      processed: number;
      failed: number;
      memories: number;
      insights: number;
    };
  });

export type BrainLearningStatus = {
  queued: number;
  processing: number;
  failed: number;
  doneLast24h: number;
  oldestQueuedAt: string | null;
};

export const getBrainLearningStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BrainLearningStatus> => {
    const sb = context.supabase;
    const [{ count: queued }, { count: processing }, { count: failed }, { count: doneLast24h }, oldest] =
      await Promise.all([
        sb.from("brain_learning_queue").select("id", { count: "exact", head: true }).eq("status", "queued"),
        sb.from("brain_learning_queue").select("id", { count: "exact", head: true }).eq("status", "processing"),
        sb.from("brain_learning_queue").select("id", { count: "exact", head: true }).eq("status", "failed"),
        sb
          .from("brain_learning_queue")
          .select("id", { count: "exact", head: true })
          .eq("status", "done")
          .gte("processed_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString()),
        sb
          .from("brain_learning_queue")
          .select("enqueued_at")
          .eq("status", "queued")
          .order("enqueued_at", { ascending: true })
          .limit(1)
          .maybeSingle(),
      ]);
    return {
      queued: queued ?? 0,
      processing: processing ?? 0,
      failed: failed ?? 0,
      doneLast24h: doneLast24h ?? 0,
      oldestQueuedAt: (oldest.data?.enqueued_at as string | undefined) ?? null,
    };
  });