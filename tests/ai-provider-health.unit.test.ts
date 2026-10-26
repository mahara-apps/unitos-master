import { describe, expect, it } from "vitest";
import { deriveAiHealthWarnings } from "@/lib/ai-provider-health";

const kinds = (i: Parameters<typeof deriveAiHealthWarnings>[0]) =>
  deriveAiHealthWarnings(i).map((w) => w.kind);

describe("avisos de saúde dos provedores", () => {
  it("sem aviso quando principal e Groq estão ok", () => {
    expect(
      kinds({ primary: "gemini", providers: { gemini: { connected: true, verified: "valid" }, groq: { connected: true, verified: "valid" } } }),
    ).toEqual([]);
  });

  it("só Groq conectado = sem principal", () => {
    expect(kinds({ primary: "openai", providers: { groq: { connected: true, verified: "valid" } } })).toEqual(["no_primary"]);
  });

  it("Groq nunca conta como principal", () => {
    expect(kinds({ primary: "groq", providers: { groq: { connected: true } } })).toContain("no_primary");
  });

  it("chave recusada e sem crédito são distintos", () => {
    const k = kinds({
      primary: "anthropic",
      providers: {
        anthropic: { connected: false, verified: "invalid", verifyMessage: "Your credit balance is too low" },
        gemini: { connected: false, verified: "invalid", verifyMessage: "API key not valid" },
        groq: { connected: true },
      },
    });
    expect(k).toEqual(["no_primary", "no_credit", "key_rejected"]);
  });

  it("avisa fallback ausente", () => {
    expect(kinds({ primary: "gemini", providers: { gemini: { connected: true } } })).toEqual(["fallback_unavailable"]);
  });
});
