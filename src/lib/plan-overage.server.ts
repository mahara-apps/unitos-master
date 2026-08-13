import type { SupabaseClient } from "@supabase/supabase-js";
import { PLAN_CHANNELS, type PlanChannel } from "@/lib/monthly-plan-fields";

/** Primeiro dia do mês corrente (UTC) em formato date (YYYY-MM-DD). */
export function currentPeriodMonth(now: Date = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return d.toISOString().slice(0, 10);
}

export type OverageMap = Record<PlanChannel, number>;

function emptyMap(): OverageMap {
  return PLAN_CHANNELS.reduce<OverageMap>((acc, c) => {
    acc[c] = 0;
    return acc;
  }, {} as OverageMap);
}

/** Excedentes já autorizados no mês corrente, por canal. */
export async function loadApprovedOverage(
  supabase: SupabaseClient,
  args: { brandId?: string; clientId: string; periodMonth?: string },
): Promise<OverageMap> {
  const map = emptyMap();
  let q = supabase
    .from("plan_overage_requests" as never)
    .select("channel, overage, status")
    .eq("client_id", args.clientId)
    .eq("period_month", args.periodMonth ?? currentPeriodMonth())
    .eq("status", "approved");
  if (args.brandId) q = q.eq("brand_id", args.brandId);
  const { data } = await q;
  for (const r of (data ?? []) as Array<{ channel: string; overage: number }>) {
    const c = (r.channel ?? "").toLowerCase() as PlanChannel;
    if (c in map) map[c] = (map[c] ?? 0) + (Number(r.overage) || 0);
  }
  return map;
}
