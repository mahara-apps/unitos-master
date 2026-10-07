import { describe, expect, it } from "vitest";
import { classifyAiError, userFacingAiError } from "@/lib/ai-failures.server";
import { budgetAlertLevel, financialErrorMessage } from "@/lib/ai-finance";
import { aiErrorMessage } from "@/lib/ai-error-display";
import { isRecoverableFailure } from "@/lib/ai-observability";

describe("avisos financeiros de IA", () => {
  it.each([
    [{ statusCode: 400, message: "Your credit balance is too low to access the Anthropic API" }, "provider_credit"],
    [{ statusCode: 429, responseBody: '{"error":{"code":"insufficient_quota"}}' }, "provider_credit"],
    [{ statusCode: 402, message: "Payment required" }, "provider_credit"],
    [{ statusCode: 400, message: "billing_hard_limit_reached" }, "provider_financial_limit"],
  ])("não repete erros financeiros comprovados", (error, kind) => {
    expect(classifyAiError(error)).toEqual({ kind, retryable: false });
    expect(isRecoverableFailure(kind)).toBe(false);
  });
  it("não confunde rate limit ou quota diária com saldo", () => {
    expect(classifyAiError({statusCode: 429, message: "rate limit"}).kind).toBe("provider_rate_limit");
    expect(classifyAiError({statusCode: 429, message: "daily quota exceeded"}).kind).toBe("provider_quota");
  });
  it("mostra o provedor que realmente falhou", () => {
    const error = new Error("ai_finance_blocked:groq:provider_credit");
    expect(financialErrorMessage(error.message)).toContain("Groq");
    expect(aiErrorMessage(error, "erro")).toContain("Groq");
    expect(userFacingAiError(error).body).toContain("Groq");
  });
  it("orçamento zero não representa saldo esgotado", () => {
    expect(budgetAlertLevel(200, 0)).toBeNull();
    expect(budgetAlertLevel(79, 100)).toBeNull();
    expect(budgetAlertLevel(80, 100)).toBe(80);
    expect(budgetAlertLevel(95, 100)).toBe(95);
    expect(budgetAlertLevel(140, 100)).toBe(100);
    expect(budgetAlertLevel(70, 100, [50, 70, 90])).toBe(70);
  });
});