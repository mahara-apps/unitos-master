import { describe, expect, it } from "vitest";
import { activityLevel, nextLogCursor } from "@/lib/log-levels";

describe("nível de Ações na Auditoria", () => {
  it("ai_generation_failed aparece como erro", () => {
    expect(activityLevel("ai_generation_failed", { ok: false })).toBe("error");
  });
  it("evento com ok:false aparece como erro", () => {
    expect(activityLevel("ai_agent_attempt", { ok: false })).toBe("error");
  });
  it("stage_changed continua como info", () => {
    expect(activityLevel("stage_changed", { from: "a", to: "b" })).toBe("info");
  });
});

describe("cursor de 'Carregar mais'", () => {
  it("página cheia avança até o último exibido", () => {
    expect(nextLogCursor(["2026-10-16T18:00:00Z", "2026-10-16T17:00:00Z"], 2, [])).toBe(
      "2026-10-16T17:00:00Z",
    );
  });
  it("página incompleta sem fonte cheia encerra", () => {
    expect(nextLogCursor(["2026-10-16T18:00:00Z"], 100, [])).toBeNull();
  });
  it("página filtrada usa a fonte cheia mais recente", () => {
    expect(
      nextLogCursor(["2026-10-16T18:00:00Z"], 100, ["2026-10-10T00:00:00Z", "2026-10-12T00:00:00Z"]),
    ).toBe("2026-10-12T00:00:00Z");
  });
});
