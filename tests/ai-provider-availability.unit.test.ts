import { describe, expect, it } from "vitest";
import { orderedUsableTextProviders } from "@/lib/ai-provider-availability";

describe("provedores de IA utilizáveis", () => {
  it("ordena somente o principal e o fallback Groq", () => {
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
    ).toEqual(["gemini", "groq"]);
  });

  it("ignora o principal sem chave e usa somente o Groq configurado", () => {
    expect(
      orderedUsableTextProviders({
        primary: "openai",
        fallback: "groq",
        providers: { groq: { connected: true }, gemini: { connected: true } },
        credentialProviders: ["groq", "gemini"],
      }),
    ).toEqual(["groq"]);
  });

  it("não aceita Groq como principal nem outro provedor como fallback", () => {
    expect(
      orderedUsableTextProviders({
        primary: "groq",
        fallback: "anthropic",
        providers: { groq: { connected: true }, anthropic: { connected: true } },
        credentialProviders: ["groq", "anthropic"],
      }),
    ).toEqual([]);
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