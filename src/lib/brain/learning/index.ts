// ⚠️ Brain Learning Engine — enfileiramento e leitura de status.
// O worker roda via pg_cron; esta camada só interage com a fila.
import type { BrainContext } from "../core";

export async function enqueue(
  ctx: BrainContext,
  args: { job_type: string; payload: Record<string, unknown> },
): Promise<void> {
  await ctx.supabase.from("brain_learning_queue").insert({
    brand_id: ctx.brandId ?? null,
    job_type: args.job_type,
    payload: args.payload,
    status: "pending",
  });
}

export async function pending(ctx: BrainContext): Promise<number> {
  const q = ctx.supabase
    .from("brain_learning_queue")
    .select("*", { count: "exact", head: true })
    .eq("status", "pending");
  const { count } = ctx.brandId ? await q.eq("brand_id", ctx.brandId) : await q;
  return count ?? 0;
}
