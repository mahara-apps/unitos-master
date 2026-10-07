import type { AiUsageContext } from "./ai-usage.server";
import { callRpc, type RpcCapableClient } from "./supabase-rpc";

/** A failed or malformed limit check is never permission to spend. */
export async function assertAiBudget(client: RpcCapableClient, brandId: string, usage?: AiUsageContext): Promise<void> {
  let result;
  try {
    result = await callRpc<{ allowed?: boolean; blocked_by?: string; spent_usd?: number; limit_usd?: number } | null>(client, "check_ai_usage_budget", {
      _brand_id: brandId, _client_id: usage?.clientId ?? null, _user_id: usage?.userId ?? null,
    });
  } catch {
    throw new Error("ai_budget_check_failed: não foi possível confirmar os limites de IA. Tente novamente.");
  }
  if (result.error || typeof result.data?.allowed !== "boolean") {
    throw new Error("ai_budget_check_failed: não foi possível confirmar os limites de IA. Tente novamente.");
  }
  if (!result.data.allowed) {
    throw new Error(`ai_budget_exceeded:${result.data.blocked_by ?? "brand"}:${result.data.spent_usd ?? 0}:${result.data.limit_usd ?? 0}`);
  }
}