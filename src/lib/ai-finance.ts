export const AI_PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI", anthropic: "Anthropic", gemini: "Gemini", groq: "Groq",
};

export function financialMessage(provider: string, reason = "provider_credit"): string {
  const label = AI_PROVIDER_LABELS[provider] ?? "provedor de IA";
  return reason === "provider_financial_limit"
    ? `Limite financeiro atingido na ${label}. Solicite ao administrador a revisão do limite no provedor para continuar.`
    : `Créditos insuficientes na ${label}. Solicite ao administrador a reposição do saldo para continuar.`;
}

export function financialErrorMessage(text: string): string | null {
  const match = text.match(/ai_finance_blocked:(openai|anthropic|gemini|groq):(provider_credit|provider_financial_limit)/);
  return match ? financialMessage(match[1], match[2]) : null;
}

export function budgetAlertLevel(spent: number, budget: number, thresholds: number[] = [80, 95, 100]): number | null {
  if (!Number.isFinite(spent) || !Number.isFinite(budget) || budget <= 0) return null;
  return thresholds.filter((t) => spent * 100 >= budget * t).at(-1) ?? null;
}