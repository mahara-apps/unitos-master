import { describe, expect, it } from "vitest";
import {
  orderedUsableEmbeddingProviders,
  orderedUsableTextProviders,
} from "@/lib/ai-provider-availability";

const casa8 = {
  providers: {
    anthropic: { connected: true },
    gemini: { connected: true },
    groq: { connected: true },
  },
  credentialProviders: ["anthropic", "gemini", "groq"],
};

describe("memória da IA (embeddings) com principal Anthropic", () => {
  it("reproduz o defeito: a cadeia de texto não tem provedor de embedding", () => {
    const chain = orderedUsableTextProviders({ primary: "anthropic", fallback: "groq", ...casa8 });
    expect(chain.filter((p) => p === "openai" || p === "gemini")).toEqual([]);
  });

  it("usa o Gemini conectado quando a principal é Anthropic", () => {
    expect(
      orderedUsableEmbeddingProviders({ primary: "anthropic", ...casa8, allowed: ["openai", "gemini"] }),
    ).toEqual(["gemini"]);
  });

  it("prefere a principal quando ela gera embeddings", () => {
    expect(
      orderedUsableEmbeddingProviders({
        primary: "gemini",
        providers: { openai: { connected: true }, gemini: { connected: true } },
        credentialProviders: ["openai", "gemini"],
        allowed: ["openai", "gemini"],
      }),
    ).toEqual(["gemini", "openai"]);
  });

  it("não usa provedor sem chave gravada nem desconectado", () => {
    expect(
      orderedUsableEmbeddingProviders({
        primary: "anthropic",
        providers: { openai: { connected: false }, gemini: { connected: true } },
        credentialProviders: ["openai"],
        allowed: ["openai", "gemini"],
      }),
    ).toEqual([]);
  });
});
