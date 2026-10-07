import { callRpc } from "./supabase-rpc";
import { classifyAiError } from "./ai-failures.server";
import { financialMessage } from "./ai-finance";

export function blockedFinanceError(provider: string, reason: string): Error {
  return new Error(`ai_finance_blocked:${provider}:${reason}: ${financialMessage(provider, reason)}`);
}

export async function assertProviderFinance(brandId: string, provider: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.from("ai_provider_finance")
    .select("blocked,reason").eq("brand_id", brandId).eq("provider", provider).maybeSingle();
  if (error) throw new Error("Não foi possível verificar a disponibilidade financeira da IA.");
  if (data?.blocked) throw blockedFinanceError(provider, data.reason ?? "provider_credit");
}

export async function captureProviderFinance(brandId: string, provider: string, error: unknown): Promise<Error | null> {
  const { kind } = classifyAiError(error);
  if (kind !== "provider_credit" && kind !== "provider_financial_limit") return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const result = await callRpc(supabaseAdmin, "ai_finance_block", {
    _brand: brandId, _provider: provider, _reason: kind,
  });
  if (result.error) throw new Error("Não foi possível registrar o bloqueio financeiro da IA.");
  return blockedFinanceError(provider, kind);
}