/**
 * Regra: o teste automático de chaves entra na conta de consumo e não paga
 * duas vezes pela mesma verificação na mesma rodada.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createHealthPingCache, HEALTH_PING_MAX_OUTPUT_TOKENS } from "@/lib/ai-model-health.server";

describe("teste automático de chaves", () => {
  it("mesmo workspace + provedor + modelo = uma única chamada por rodada", async () => {
    const ping = vi.fn(async () => undefined);
    const once = createHealthPingCache(ping);
    await once("gemini", "k", "gemini-flash", "b1");
    await once("gemini", "k", "gemini-flash", "b1");
    expect(ping).toHaveBeenCalledTimes(1);
    await once("gemini", "k", "gemini-pro", "b1");
    await once("gemini", "k", "gemini-flash", "b2");
    expect(ping).toHaveBeenCalledTimes(3);
  });

  it("falha reaproveitada continua sendo falha", async () => {
    const ping = vi.fn(async () => {
      throw new Error("ai_model_unavailable");
    });
    const once = createHealthPingCache(ping);
    await expect(once("openai", "k", "m", "b")).rejects.toThrow("ai_model_unavailable");
    await expect(once("openai", "k", "m", "b")).rejects.toThrow("ai_model_unavailable");
    expect(ping).toHaveBeenCalledTimes(1);
  });

  it("a verificação pede no máximo 32 tokens", () => {
    expect(HEALTH_PING_MAX_OUTPUT_TOKENS).toBe(32);
  });

  it("sucesso e falha da verificação são registrados no consumo", () => {
    const src = readFileSync("src/lib/ai-model-health.server.ts", "utf8");
    const fn = src.slice(
      src.indexOf("async function pingTextModel("),
      src.indexOf("export const HEALTH_PING_MAX_OUTPUT_TOKENS"),
    );
    expect(fn).toContain("assertAiBudget");
    expect(fn).toContain("success: false");
    expect(fn).toContain("success: true");
    expect(fn.split('agent: "model.health"').length - 1).toBe(3);
  });
});
