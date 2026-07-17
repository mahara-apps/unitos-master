// ⚠️ Brain Learning Engine — enfileiramento e leitura de status.
// O worker roda via pg_cron; esta camada só interage com a fila.
import type { BrainContext } from "../core";
import { waitUntil } from "@/lib/wait-until.server";

export async function enqueue(
  ctx: BrainContext,
  args: { job_type: string; payload: Record<string, unknown> },
): Promise<void> {
  // Fire-and-forget: o worker processa via pg_cron; o produtor NÃO precisa esperar.
  waitUntil(
    (async () => {
      const { error } = await ctx.supabase.from("brain_learning_queue").insert({
        brand_id: ctx.brandId ?? null,
        job_type: args.job_type,
        payload: args.payload,
        status: "pending",
      });
      if (error) console.error("[brain.learning.enqueue]", error.message);
    })(),
  );
}

export async function pending(ctx: BrainContext): Promise<number> {
  const q = ctx.supabase
    .from("brain_learning_queue")
    .select("*", { count: "exact", head: true })
    .eq("status", "pending");
  const { count } = ctx.brandId ? await q.eq("brand_id", ctx.brandId) : await q;
  return count ?? 0;
}
