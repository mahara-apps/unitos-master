import { describe, expect, it } from "vitest";
import { groupProjectsByStatus, statusIdFromDropTarget } from "@/lib/projects-kanban";

const statuses = [
  { id: "s2", name: "Em produção", color: null, position: 2 },
  { id: "s1", name: "Planejamento", color: null, position: 1 },
];

describe("Kanban de projetos", () => {
  it("colunas seguem a ordem dos status do workspace e terminam em Sem status", () => {
    const cols = groupProjectsByStatus([], statuses);
    expect(cols.map((c) => c.name)).toEqual(["Planejamento", "Em produção", "Sem status"]);
  });
  it("projeto com status removido aparece em Sem status, não some", () => {
    const cols = groupProjectsByStatus([{ id: "p", status_id: "apagado" }], statuses);
    expect(cols.at(-1)?.projects.map((p) => p.id)).toEqual(["p"]);
  });
  it("soltar em uma coluna define o status; em Sem status limpa; fora não muda", () => {
    expect(statusIdFromDropTarget("project-status:s2")).toBe("s2");
    expect(statusIdFromDropTarget("project-status:none")).toBeNull();
    expect(statusIdFromDropTarget(undefined)).toBeUndefined();
  });
});
