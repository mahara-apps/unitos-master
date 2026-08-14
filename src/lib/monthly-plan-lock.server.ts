import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Trava server-side contra geração duplicada de pauta.
 *
 * Usa `ai_jobs` (kind = "monthly_plan") como registro de execução:
 *   1. insere a própria trava;
 *   2. relê as travas ativas do mesmo brand + client + período;
 *   3. se a trava mais antiga não é a minha, libera a minha e devolve conflito.
 *
 * Não altera schema, RLS nem migrations — apenas usa a tabela existente.
 */

const LOCK_KIND = "monthly_plan";
/** Travas mais antigas que isso são consideradas órfãs (worker morreu). */
const LOCK_TTL_MS = 10 * 60 * 1000;

export type PlanLock = { jobId: string } | { conflict: true };

export async function acquirePlanGenerationLock(
  supabase: SupabaseClient,
  args: { brandId: string; clientId: string; userId: string; period: string },
): Promise<PlanLock> {
  const nowIso = new Date().toISOString();
  const { data: mine, error } = await supabase
    .from("ai_jobs")
    .insert({
      brand_id: args.brandId,
      client_id: args.clientId,
      user_id: args.userId,
      kind: LOCK_KIND,
      title: "Gerando pauta mensal",
      status: "running",
      started_at: nowIso,
      step_label: "Gerando pauta",
      input: { period: args.period, lock: true },
    })
    .select("id, created_at")
    .single();
  if (error) throw error;
  const lockId = (mine as { id: string }).id;

  const since = new Date(Date.now() - LOCK_TTL_MS).toISOString();
  const { data: active, error: readErr } = await supabase
    .from("ai_jobs")
    .select("id, created_at")
    .eq("brand_id", args.brandId)
    .eq("client_id", args.clientId)
    .eq("kind", LOCK_KIND)
    .eq("status", "running")
    .gte("created_at", since)
    .filter("input->>period", "eq", args.period)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (readErr) {
    await releasePlanGenerationLock(supabase, lockId, { ok: false, error: readErr.message });
    throw readErr;
  }

  const first = (active ?? [])[0] as { id: string } | undefined;
  if (first && first.id !== lockId) {
    await releasePlanGenerationLock(supabase, lockId, {
      ok: false,
      error: "generation_in_progress",
    });
    return { conflict: true };
  }
  return { jobId: lockId };
}

export async function releasePlanGenerationLock(
  supabase: SupabaseClient,
  jobId: string,
  outcome: { ok: boolean; error?: string; planId?: string },
): Promise<void> {
  try {
    await supabase
      .from("ai_jobs")
      .update({
        status: outcome.ok ? "succeeded" : "failed",
        progress: outcome.ok ? 100 : 0,
        finished_at: new Date().toISOString(),
        error: outcome.error ? outcome.error.slice(0, 2000) : null,
        ...(outcome.planId ? { result: { monthly_plan_id: outcome.planId } } : {}),
      })
      .eq("id", jobId);
  } catch (err) {
    console.warn("[monthly-plan] release lock failed", err);
  }
}
