/**
 * Regra: a IA responde SEMPRE em pt-BR. Resposta em inglês é refeita UMA vez
 * com reforço de idioma; se voltar em inglês de novo, é output inválido e
 * nada é entregue ou salvo.
 */
import { describe, expect, it, vi } from "vitest";
import {
  PT_BR_RETRY_NOTE,
  isEnglishOutputError,
  runWithPtBrRetry,
  withRetryNote,
} from "@/lib/ai-language";

const PT =
  "Conheça uma proposta pensada para a sua marca, com conteúdo que gera resultado para quem não tem tempo de sobra.";
const EN =
  "The campaign will connect with your audience and bring the insights that they seek through this content for you.";

describe("retentativa de idioma", () => {
  it("entrega a primeira resposta em pt-BR sem nova chamada", async () => {
    const run = vi.fn(async () => PT);
    await expect(runWithPtBrRetry(run, (t) => t, "Teste")).resolves.toBe(PT);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith(null);
  });

  it("refaz exatamente uma vez com o reforço quando volta em inglês", async () => {
    const run = vi.fn(async (note: string | null) => (note ? PT : EN));
    await expect(runWithPtBrRetry(run, (t) => t, "Teste")).resolves.toBe(PT);
    expect(run).toHaveBeenCalledTimes(2);
    expect(run).toHaveBeenLastCalledWith(PT_BR_RETRY_NOTE);
  });

  it("falha como output inválido se a segunda resposta ainda vier em inglês", async () => {
    const run = vi.fn(async () => EN);
    const failure = runWithPtBrRetry(run, (t) => t, "Teste");
    await expect(failure).rejects.toThrow(/ai_invalid_output/);
    await failure.catch((err) => expect(isEnglishOutputError(err)).toBe(true));
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("o reforço só entra no prompt quando há retentativa", () => {
    expect(withRetryNote("Prompt", null)).toBe("Prompt");
    expect(withRetryNote("Prompt", PT_BR_RETRY_NOTE)).toContain(PT_BR_RETRY_NOTE);
  });

  it("outras falhas de formato não são tratadas como idioma", () => {
    expect(isEnglishOutputError(new Error("ai_invalid_output: schema"))).toBe(false);
  });
});

describe("fluxos que refazem resposta em inglês", () => {
  it.each([
    "src/lib/copilot-job.server.ts",
    "src/lib/brain/chat-gateway/llm.server.ts",
    "src/lib/brain/learning/synthesize.server.ts",
    "src/lib/brain/legacy/brain-consolidate.functions.ts",
    "src/lib/agents.functions.ts",
    "src/lib/media-plans-ai.functions.ts",
    "src/lib/dashboard.functions.ts",
  ])("%s usa a retentativa única", async (file) => {
    const { readFileSync } = await import("node:fs");
    expect(readFileSync(file, "utf8")).toContain("runWithPtBrRetry");
  });

  it.each([
    "src/lib/post-agents.server.ts",
    "src/lib/ai-agents.functions.ts",
    "src/lib/monthly-plan-agent.server.ts",
  ])("%s refaz uma vez dentro do próprio ciclo de tentativas", async (file) => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(file, "utf8");
    expect(src).toContain("isEnglishOutputError");
    expect(src).toContain("PT_BR_RETRY_NOTE");
  });
});
