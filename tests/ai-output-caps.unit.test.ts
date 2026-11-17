/**
 * Regra: toda chamada de texto define limite de saída explícito. Sem ele cada
 * provedor usa um padrão próprio e a resposta pode sair cortada ou gastar além
 * do necessário.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { TEXT_MAX_OUTPUT_TOKENS } from "@/lib/ai/output-budget";

describe("limite de tamanho das respostas", () => {
  it("chat, teste de agentes, Copiloto e insights do Brain têm teto próprio", () => {
    expect(TEXT_MAX_OUTPUT_TOKENS.chat).toBe(4_096);
    expect(TEXT_MAX_OUTPUT_TOKENS.agentTest).toBe(4_096);
    expect(TEXT_MAX_OUTPUT_TOKENS.copilot).toBe(4_096);
    expect(TEXT_MAX_OUTPUT_TOKENS.brainInsight).toBe(2_048);
  });

  it.each([
    ["src/lib/brain/chat-gateway/llm.server.ts", "TEXT_MAX_OUTPUT_TOKENS.chat", 2],
    ["src/lib/agents.functions.ts", "TEXT_MAX_OUTPUT_TOKENS.agentTest", 1],
    ["src/lib/copilot-job.server.ts", "TEXT_MAX_OUTPUT_TOKENS.copilot", 1],
    ["src/lib/brain/learning/synthesize.server.ts", "TEXT_MAX_OUTPUT_TOKENS.brainInsight", 1],
    [
      "src/lib/brain/legacy/brain-consolidate.functions.ts",
      "TEXT_MAX_OUTPUT_TOKENS.brainInsight",
      1,
    ],
  ])("%s aplica %s", (file, cap, times) => {
    const src = readFileSync(file, "utf8");
    expect(src.split(`maxOutputTokens: ${cap}`).length - 1).toBe(times);
  });

  it("todas as chamadas generateText/streamText do sistema definem maxOutputTokens", () => {
    const files = [
      "src/lib/brain/chat-gateway/llm.server.ts",
      "src/lib/agents.functions.ts",
      "src/lib/copilot-job.server.ts",
      "src/lib/brain/learning/synthesize.server.ts",
      "src/lib/brain/legacy/brain-consolidate.functions.ts",
      "src/lib/ai-model-health.server.ts",
    ];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      const calls = src.split(/(?:generateText|streamText)\(\{/).length - 1;
      const caps = src.split("maxOutputTokens").length - 1;
      expect(caps, file).toBeGreaterThanOrEqual(calls);
    }
  });
});
