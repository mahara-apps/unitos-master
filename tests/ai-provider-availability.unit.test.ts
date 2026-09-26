import { describe, expect, it } from "vitest";
import { orderedUsableTextProviders } from "@/lib/ai-provider-availability";

describe("provedores de IA utilizáveis", () => {
  it("ordena principal, fallback e demais conexões", () => {
    expect(
      orderedUsableTextProviders({
        primary: "gemini",
        fallback: "groq",
        providers: {
          gemini: { connected: true },
          groq: { connected: true },
          anthropic: { connected: true },
        },
        credentialProviders: ["gemini", "groq", "anthropic"],
      }),
    ).toEqual(["gemini", "groq", "anthropic"]);
  });

  it("ignora o principal sem chave e promove conexões utilizáveis", () => {
    expect(
      orderedUsableTextProviders({
        primary: "openai",
        fallback: "groq",
        providers: { groq: { connected: true }, gemini: { connected: true } },
        credentialProviders: ["groq", "gemini"],
      }),
    ).toEqual(["groq", "gemini"]);
  });

  it("não oferece conexão sem chave, desconectada ou desconhecida", () => {
    expect(
      orderedUsableTextProviders({
        primary: "openai",
        fallback: "groq",
        providers: {
          openai: { connected: true },
          groq: { connected: false },
          legado: { connected: true },
        },
        credentialProviders: ["groq", "legado"],
      }),
    ).toEqual([]);
  });
});