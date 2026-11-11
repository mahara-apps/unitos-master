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
        "claude-sonnet-5-5",
        "claude-opus-4-8",
      ]),
    ).toEqual(["claude-opus-4-8", "claude-sonnet-5-5"]);
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

describe("catálogo de modelos — nov/2026", () => {
  it("nenhum padrão ou reserva aponta para modelo desligado", async () => {
    const { MODEL_CATALOG, MODEL_FALLBACKS, isRetiredModel } = await import("@/lib/ai-models-catalog.server");
    for (const [provider, roles] of Object.entries(MODEL_FALLBACKS)) {
      for (const [role, chain] of Object.entries(roles)) {
        const def = (MODEL_CATALOG as any)[provider][role];
        for (const id of [def, ...chain]) expect(isRetiredModel(provider as any, id)).toBe(false);
      }
    }
  });
  it("Sonnet 4.5 (desligado em 30/11/2026) não é mais o padrão operacional", async () => {
    const { MODEL_CATALOG } = await import("@/lib/ai-models-catalog.server");
    expect(MODEL_CATALOG.anthropic.operational).toBe("claude-sonnet-5-5");
    expect(MODEL_CATALOG.openai.strategic).toBe("gpt-6-astra");
  });
});
