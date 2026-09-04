import { describe, expect, it } from "vitest";
import { decideBriefingFormSync } from "@/lib/briefing-form-sync";

describe("decideBriefingFormSync", () => {
  it("monta o formulário na primeira carga", () => {
    expect(
      decideBriefingFormSync({
        hasForm: false,
        dirty: false,
        serverVersion: "2026-09-04T10:00:00Z",
        syncedVersion: null,
      }),
    ).toBe("apply");
  });

  it("reflete a versão nova vinda da IA quando não há edição local", () => {
    expect(
      decideBriefingFormSync({
        hasForm: true,
        dirty: false,
        serverVersion: "2026-09-04T11:00:00Z",
        syncedVersion: "2026-09-04T10:00:00Z",
      }),
    ).toBe("apply");
  });

  it("pergunta antes de sobrescrever edições não salvas", () => {
    expect(
      decideBriefingFormSync({
        hasForm: true,
        dirty: true,
        serverVersion: "2026-09-04T11:00:00Z",
        syncedVersion: "2026-09-04T10:00:00Z",
      }),
    ).toBe("prompt");
  });

  it("não remonta o formulário quando a versão é a mesma", () => {
    expect(
      decideBriefingFormSync({
        hasForm: true,
        dirty: true,
        serverVersion: "2026-09-04T10:00:00Z",
        syncedVersion: "2026-09-04T10:00:00Z",
      }),
    ).toBe("keep");
  });
});
