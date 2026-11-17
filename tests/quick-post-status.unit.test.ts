import { describe, expect, it } from "vitest";
import { quickPostStatusFrom } from "@/lib/post-copy-status";

describe("andamento da legenda da peça expressa", () => {
  it("legenda escrita = pronta", () => {
    expect(
      quickPostStatusFrom({ title: "T", copy: "Legenda", ai_phase: "copy_ready" }),
    ).toMatchObject({
      state: "ready",
      copy: "Legenda",
    });
  });

  it("recém-criada (sem fase) ou em produção = escrevendo", () => {
    expect(quickPostStatusFrom({ copy: null, ai_phase: null }).state).toBe("writing");
    expect(quickPostStatusFrom({ copy: null, ai_phase: "idea" }).state).toBe("writing");
    expect(quickPostStatusFrom({ copy: null, ai_phase: "copy_running" }).state).toBe("writing");
  });

  it("falha mostra o motivo gravado na peça", () => {
    expect(
      quickPostStatusFrom({
        copy: null,
        ai_phase: "copy_failed_retryable",
        ai_phase_error: "Limite de IA atingido",
      }),
    ).toMatchObject({ state: "failed", error: "Limite de IA atingido" });
    expect(quickPostStatusFrom({ copy: "", ai_phase: "copy_failed_permanent" }).state).toBe(
      "failed",
    );
  });

  it("fim sem legenda não fica preso em escrevendo", () => {
    expect(quickPostStatusFrom({ copy: "", ai_phase: "copy_ready" }).state).toBe("failed");
  });
});
