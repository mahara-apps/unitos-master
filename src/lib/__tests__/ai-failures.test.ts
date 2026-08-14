import { describe, expect, it } from "vitest";
import { NoOutputGeneratedError } from "ai";
import {
  classifyAiError,
  unwrapAiError,
  BACKOFF_MS,
  SPACING_MS,
  FAILURE_MESSAGE_PT,
} from "@/lib/ai-failures.server";

/** Erro no formato que o @ai-sdk/google produz para respostas HTTP de erro. */
function providerError(status: number, message: string) {
  const err = new Error(message) as Error & { statusCode: number };
  err.name = "AI_APICallError";
  err.statusCode = status;
  return err;
}

describe("classifyAiError", () => {
  it("TESTE 2 — 429 com quota do Gemini → provider_quota retryable", () => {
    const err = providerError(
      429,
      "You exceeded your current quota. Quota exceeded for metric: generativelanguage.googleapis.com/generate_requests",
    );
    expect(classifyAiError(err)).toEqual({ kind: "provider_quota", retryable: true });
  });

  it("429 puro (sem quota) → provider_rate_limit retryable", () => {
    expect(classifyAiError(providerError(429, "Too Many Requests"))).toEqual({
      kind: "provider_rate_limit",
      retryable: true,
    });
  });

  it("TESTE 3 — 503 high demand → provider_unavailable retryable", () => {
    const err = providerError(503, "This model is currently experiencing high demand");
    expect(classifyAiError(err)).toEqual({ kind: "provider_unavailable", retryable: true });
  });

  it("TESTE 4 — NoOutputGeneratedError com cause 429/quota → provider_quota, nunca unknown", () => {
    const cause = providerError(429, "Quota exceeded for metric: generativelanguage.googleapis.com");
    const wrapped = new NoOutputGeneratedError({
      message: "No output generated. Check the stream for errors.",
      cause,
    });
    const out = classifyAiError(wrapped);
    expect(out.kind).toBe("provider_quota");
    expect(out.retryable).toBe(true);
    expect(out.kind).not.toBe("unknown");
  });

  it("NoOutputGeneratedError com cause 503 → provider_unavailable", () => {
    const wrapped = new NoOutputGeneratedError({
      message: "No output generated. Check the stream for errors.",
      cause: providerError(503, "model overloaded"),
    });
    expect(classifyAiError(wrapped)).toEqual({ kind: "provider_unavailable", retryable: true });
  });

  it("NoOutputGeneratedError sem pista → invalid_output retryable (nunca unknown/permanente)", () => {
    const wrapped = new NoOutputGeneratedError({
      message: "No output generated. Check the stream for errors.",
    });
    const out = classifyAiError(wrapped);
    expect(out.kind).toBe("invalid_output");
    expect(out.retryable).toBe(true);
  });

  it("TESTE 5 — output vazio/JSON inválido → invalid_output", () => {
    expect(classifyAiError(new Error("ai_invalid_output: voice card sem personalidade")).kind).toBe(
      "invalid_output",
    );
    expect(classifyAiError(new Error("A IA não retornou JSON válido.")).kind).toBe("invalid_output");
  });

  it("configuração/credencial → config permanente", () => {
    expect(classifyAiError(new Error("ai_provider_key_missing:gemini"))).toEqual({
      kind: "config",
      retryable: false,
    });
    expect(classifyAiError(providerError(403, "API key not valid"))).toEqual({
      kind: "config",
      retryable: false,
    });
    expect(classifyAiError(new Error("ai_model_unavailable:gemini:strategic")).retryable).toBe(false);
  });

  it("erro sem qualquer pista → unknown permanente", () => {
    expect(classifyAiError(new Error("algo estranho aconteceu"))).toEqual({
      kind: "unknown",
      retryable: false,
    });
  });

  it("timeout da nossa trava → unavailable retryable", () => {
    expect(classifyAiError(new Error("Timeout de 90000ms em strategic")).kind).toBe(
      "provider_unavailable",
    );
  });
});

describe("unwrapAiError", () => {
  it("recupera status e mensagem do cause aninhado", () => {
    const deep = providerError(429, "Quota exceeded");
    const mid = new Error("stream error");
    (mid as Error & { cause?: unknown }).cause = deep;
    const top = new NoOutputGeneratedError({ message: "No output generated.", cause: mid });
    const out = unwrapAiError(top);
    expect(out.status).toBe(429);
    expect(out.hadNoOutput).toBe(true);
    expect(out.text.toLowerCase()).toContain("quota exceeded");
  });
});

describe("contrato de resiliência", () => {
  it("backoff 15s/45s e 3 tentativas, spacing 4s", () => {
    expect(BACKOFF_MS).toEqual([15_000, 45_000]);
    expect(BACKOFF_MS.length + 1).toBe(3);
    expect(SPACING_MS).toBe(4000);
  });

  it("toda classificação possui mensagem em pt-BR sem jargão do SDK", () => {
    for (const [kind, m] of Object.entries(FAILURE_MESSAGE_PT)) {
      expect(m.title.length).toBeGreaterThan(3);
      expect(m.body.length).toBeGreaterThan(10);
      expect(`${m.title} ${m.body}`).not.toMatch(/no output generated/i);
      expect(kind).toBeTruthy();
    }
  });
});
