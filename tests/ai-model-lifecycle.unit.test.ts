import { describe, expect, it } from "vitest";
import {
  MODEL_CATALOG,
  MODEL_FALLBACKS,
  RETIRED_MODELS,
  compatibleSuccessorCandidates,
  isModelUnavailableError,
  nextFallbackModel,
} from "@/lib/ai-models-catalog.server";
import { pickSuccessor } from "@/lib/ai-model-health.server";

describe("ciclo de vida dos modelos de IA", () => {
  it("não publica modelos aposentados em defaults ou fallbacks", () => {
    for (const [provider, retired] of Object.entries(RETIRED_MODELS)) {
      for (const modelId of retired ?? []) {
        expect(Object.values(MODEL_CATALOG[provider as keyof typeof MODEL_CATALOG])).not.toContain(
          modelId,
        );
        expect(
          Object.values(MODEL_FALLBACKS[provider as keyof typeof MODEL_FALLBACKS]).flat(),
        ).not.toContain(modelId);
      }
    }
  });

  it("substitui Anthropic estratégico por Opus disponível, sem rebaixar primeiro para Sonnet", () => {
    const listed = [
      { id: "claude-sonnet-5", created: 30 },
      { id: "claude-opus-5", created: 20 },
      { id: "claude-haiku-4-5", created: 40 },
    ];
    expect(pickSuccessor("anthropic", "claude-opus-4-1", "strategic", listed)).toBe(
      "claude-opus-5",
    );
  });

  it("cruza a cadeia aprovada com os modelos liberados para a conta", () => {
    expect(
      compatibleSuccessorCandidates("anthropic", "strategic", "claude-opus-4-1", [
        "claude-sonnet-4-5",
        "claude-opus-4-8",
      ]),
    ).toEqual(["claude-opus-4-8", "claude-sonnet-4-5"]);
  });

  it("nunca devolve um modelo aposentado mesmo que ainda apareça na cadeia tentada", () => {
    expect(nextFallbackModel("anthropic", "strategic", ["claude-opus-5-5"])).toBe("claude-opus-5");
  });

  it("não confunde chave, quota ou rate limit com descontinuação", () => {
    expect(isModelUnavailableError("HTTP 404 model not found")).toBe(true);
    expect(isModelUnavailableError("HTTP 401 invalid api key")).toBe(false);
    expect(isModelUnavailableError("HTTP 429 rate limit quota exceeded")).toBe(false);
  });
});
