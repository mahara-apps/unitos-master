import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  callDeadlineFor,
  FIRST_RESPONSE_TIMEOUT_MS,
  GENERATE_TOTAL_TIMEOUT_MS,
  guardStream,
  withFirstResponseDeadline,
  isProviderTimeoutError,
} from "@/lib/ai-call-watchdog";
import { classifyAiError } from "@/lib/ai-failures.server";
import { deriveAiHealthWarnings } from "@/lib/ai-provider-health";

const never = () => new Promise<never>(() => {});
const streamOf = (parts: unknown[], hangAfter = false) =>
  new ReadableStream({
    async pull(c) {
      if (parts.length) { c.enqueue(parts.shift()); return; }
      if (hangAfter) await never();
      c.close();
    },
  });
async function readAll(s: ReadableStream<unknown>) {
  const out: unknown[] = []; const r = s.getReader();
  for (;;) { const x = await r.read(); if (x.done) return out; out.push(x.value); }
}

describe("vigia de chamadas de IA", () => {
  it("provedor que nunca responde vira falha 'provider_unavailable' (aciona reserva) e aborta a requisição", async () => {
    let aborted = false;
    const err = await withFirstResponseDeadline("gemini", undefined, (signal) => {
      signal.addEventListener("abort", () => { aborted = true; });
      return never();
    }, 30).catch((e) => e);
    expect(isProviderTimeoutError(err)).toBe(true);
    expect(classifyAiError(err)).toEqual({ kind: "provider_unavailable", retryable: true });
    expect(aborted).toBe(true);
  });

  it("resposta lenta, mas dentro do prazo, é aceita", async () => {
    const r = await withFirstResponseDeadline("gemini", undefined, () => new Promise((ok) => setTimeout(() => ok("ok"), 10)), 200);
    expect(r.value).toBe("ok");
  });

  it("chamada sem stream (generateText) tem teto de 5 minutos para a resposta inteira, não 45 s", () => {
    expect(callDeadlineFor("doGenerate")).toEqual({ ms: 300_000, phase: "generate_total" });
    expect(GENERATE_TOTAL_TIMEOUT_MS).toBeGreaterThan(FIRST_RESPONSE_TIMEOUT_MS);
  });

  it("chamada em stream mantém o prazo de 45 s só até começar a responder", () => {
    expect(callDeadlineFor("doStream")).toEqual({ ms: 45_000, phase: "first_response" });
  });

  it("geração completa mais longa que o prazo de início, mas dentro do teto, não é cortada", async () => {
    const r = await withFirstResponseDeadline("anthropic", undefined, () => new Promise((ok) => setTimeout(() => ok("pauta"), 80)), 200, "generate_total");
    expect(r.value).toBe("pauta");
  });

  it("teto da geração completa estourado vira falha classificável com a fase certa", async () => {
    const err = await withFirstResponseDeadline("gemini", undefined, () => never(), 30, "generate_total").catch((e) => e);
    expect(isProviderTimeoutError(err)).toBe(true);
    expect(err.phase).toBe("generate_total");
    expect(classifyAiError(err).kind).toBe("provider_unavailable");
  });

  it("o provedor aplica o prazo conforme a operação (sem cortar generateText em 45 s)", () => {
    const src = readFileSync("src/lib/ai-provider.server.ts", "utf8");
    expect(src).toMatch(/callDeadlineFor\(op\)/);
    expect(src).toMatch(/deadline\.ms,\s*deadline\.phase/);
  });

  it("agentes de estratégia não têm cronômetro próprio que corte a resposta ou a reserva", () => {
    const src = readFileSync("src/lib/ai-agents.functions.ts", "utf8");
    expect(src).not.toMatch(/AbortSignal\.timeout/);
  });

  it("etapas da estratégia do cliente não envolvem a IA num prazo de 90 s", () => {
    const src = readFileSync("src/routes/api/jobs/customer-pipeline.ts", "utf8");
    expect(src).not.toMatch(/withTimeout\(\s*generateText/);
    expect(src).not.toMatch(/LLM_TIMEOUT_MS/);
  });

  it("importação de briefing dá à interpretação tempo para o principal e uma reserva (10 min)", () => {
    const src = readFileSync("src/lib/briefing-import-executor.server.ts", "utf8");
    const ms = Number(/interpret:\s*([\d_]+)/.exec(src)?.[1]?.replace(/_/g, ""));
    expect(ms).toBe(600_000);
    expect(ms).toBeGreaterThanOrEqual(2 * GENERATE_TOTAL_TIMEOUT_MS);
  });

  it("stream aberto que só manda metadados e fica mudo falha antes de entregar (permite reserva)", async () => {
    const c = new AbortController();
    await expect(guardStream("gemini", streamOf([{ type: "stream-start" }], true), c, { firstMs: 30 })).rejects.toThrow("ai_provider_timeout");
    expect(c.signal.aborted).toBe(true);
  });

  it("stream que trava no meio termina com evento de erro classificável", async () => {
    const c = new AbortController();
    const s = await guardStream("gemini", streamOf([{ type: "text-delta", delta: "a" }], true), c, { firstMs: 100, idleMs: 30 });
    const parts = await readAll(s) as Array<{ type: string; error?: unknown }>;
    expect(parts[0]).toEqual({ type: "text-delta", delta: "a" });
    expect(parts[1]?.type).toBe("error");
    expect(classifyAiError(parts[1]?.error).kind).toBe("provider_unavailable");
  });

  it("stream normal passa intacto", async () => {
    const c = new AbortController();
    const s = await guardStream("groq", streamOf([{ type: "stream-start" }, { type: "text-delta", delta: "x" }, { type: "finish" }]), c, { firstMs: 100, idleMs: 100 });
    expect((await readAll(s)).length).toBe(3);
  });

  it("3 falhas recentes de indisponibilidade marcam o Gemini como instável; 2 não", () => {
    const base = { primary: "gemini", providers: { gemini: { connected: true, verified: "valid" }, groq: { connected: true, verified: "valid" } } };
    expect(deriveAiHealthWarnings({ ...base, recentUnavailable: { gemini: 3 } }).map((w) => w.kind)).toContain("unstable");
    expect(deriveAiHealthWarnings({ ...base, recentUnavailable: { gemini: 2 } }).map((w) => w.kind)).not.toContain("unstable");
  });
});
