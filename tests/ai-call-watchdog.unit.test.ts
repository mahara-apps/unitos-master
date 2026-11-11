import { describe, expect, it } from "vitest";
import { guardStream, withFirstResponseDeadline, isProviderTimeoutError } from "@/lib/ai-call-watchdog";
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
