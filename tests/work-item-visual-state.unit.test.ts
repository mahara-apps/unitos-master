import { describe, expect, it } from "vitest";
import { resolveWorkItemVisualState } from "@/components/projects/work-item-visual-state";

describe("estado visual de Jobs e Tasks", () => {
  it("identifica cancelado sem depender de acentos ou gênero", () => {
    expect(resolveWorkItemVisualState({ statusName: "Cancelado", statusIsDone: true })).toBe("cancelled");
    expect(resolveWorkItemVisualState({ statusName: "CANCELADA", statusIsDone: true })).toBe("cancelled");
  });

  it("mantém a conclusão distinta do arquivamento automático", () => {
    expect(resolveWorkItemVisualState({ done: true, archivedAt: "2026-09-13T12:00:00Z" })).toBe("completed");
    expect(resolveWorkItemVisualState({ statusIsDone: true, archivedAt: "2026-09-13T12:00:00Z" })).toBe("completed");
  });

  it("identifica arquivamento manual e deixa itens abertos neutros", () => {
    expect(resolveWorkItemVisualState({ archivedAt: "2026-09-13T12:00:00Z" })).toBe("archived");
    expect(resolveWorkItemVisualState({})).toBe("active");
  });
});