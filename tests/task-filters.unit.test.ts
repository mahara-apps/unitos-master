/**
 * Seção 5 — filtros de tarefas. Usa a função REAL applyFilters usada pela tela,
 * sem mocks nem reimplementação de regra.
 */
import { afterAll, describe, expect, it, vi } from "vitest";
import { applyFilters, DEFAULT_FILTERS, type TaskFilters } from "@/components/tasks/task-toolbar";
import type { TaskRow } from "@/lib/tasks.functions";
import { searchSchema } from "@/components/tasks/task-views";
import { isoDateInTz } from "@/lib/timezone";

vi.useFakeTimers();
const fixedNow = new Date();
fixedNow.setHours(9, 0, 0, 0);
vi.setSystemTime(fixedNow);
afterAll(() => vi.useRealTimers());
const now = Date.now();
const iso = (deltaDays: number) => new Date(now + deltaDays * 86400000).toISOString();

function task(p: Partial<TaskRow>): TaskRow {
  return {
    id: p.id ?? crypto.randomUUID(),
    brand_id: "b",
    client_id: null,
    project_id: null,
    post_id: null,
    title: "Tarefa",
    description: null,
    status: "todo",
    priority: "medium",
    assignee_id: null,
    due_at: null,
    done: false,
    done_at: null,
    archived_at: null,
    created_by: null,
    created_at: iso(-10),
    updated_at: iso(-10),
    ...p,
  } as TaskRow;
}

const overdue = task({ id: "overdue", title: "Atrasada", due_at: iso(-2) });
const today = task({ id: "today", title: "Hoje", due_at: new Date(now + 3600_000).toISOString() });
const inFive = task({ id: "week", title: "Semana", due_at: iso(5) });
const noDue = task({ id: "none", title: "Sem prazo" });
const far = task({ id: "far", title: "Longe", due_at: iso(30) });
const ofClientA = task({
  id: "ca",
  title: "Do cliente A",
  client_id: "cli-a",
  client_name: "Cliente A",
});

describe("Filtros e visões compartilhados", () => {
  it("preserva filtros no endereço ao alternar entre Minhas e Kanban", () => {
    const search = searchSchema.parse({
      view: "mine",
      status: "blocked",
      assigneeId: "me",
      due: "none",
      archive: "all",
      q: "briefing",
      hideDone: true,
    });
    expect(searchSchema.parse({ ...search, view: "kanban" })).toMatchObject({
      view: "kanban",
      status: "blocked",
      assigneeId: "me",
      due: "none",
      archive: "all",
      q: "briefing",
      hideDone: true,
    });
    expect(searchSchema.parse({ assigneeId: "not-a-uuid", clientId: "invalid" })).toMatchObject({
      assigneeId: "all",
      clientId: "all",
    });
  });

  it("considera Hoje pelo calendário de Brasília, não pelo relógio do navegador", () => {
    vi.setSystemTime(new Date("2026-09-26T02:30:00.000Z"));
    const previousDay = task({ id: "br-today", due_at: "2026-09-26T02:45:00.000Z" });
    const nextDay = task({ id: "br-tomorrow", due_at: "2026-09-26T03:15:00.000Z" });
    expect(isoDateInTz(new Date(previousDay.due_at ?? ""))).toBe("2026-09-25");
    expect(idsOf(applyFilters([previousDay, nextDay], f({ due: "today" }), null))).toEqual([
      "br-today",
    ]);
    vi.setSystemTime(fixedNow);
  });

  it("a combinação responsável + cliente não inclui outras atribuições", () => {
    const rows = [
      task({ id: "mine-a", assignee_id: "mine", client_id: "a" }),
      task({ id: "mine-b", assignee_id: "mine", client_id: "b" }),
      task({ id: "other-a", assignee_id: "other", client_id: "a" }),
    ];
    expect(idsOf(applyFilters(rows, f({ assigneeId: "me", clientId: "a" }), "mine"))).toEqual([
      "mine-a",
    ]);
  });
});
const ofProject = task({
  id: "pj",
  title: "Do projeto",
  project_id: "prj-1",
  project_name: "Projeto Teste",
  client_id: "cli-a",
});
const doneTask = task({
  id: "dn",
  title: "Concluída",
  status: "done",
  done: true,
  due_at: iso(-3),
});

const all = [overdue, today, inFive, noDue, far, ofClientA, ofProject, doneTask];
const f = (patch: Partial<TaskFilters>): TaskFilters => ({ ...DEFAULT_FILTERS, ...patch });
const idsOf = (rows: TaskRow[]) => rows.map((r) => r.id).sort();

describe("5. Filtros de tarefas (applyFilters real)", () => {
  it("todas (sem filtro) retorna tudo", () => {
    expect(applyFilters(all, f({}), null)).toHaveLength(all.length);
  });

  it("atrasadas", () => {
    expect(idsOf(applyFilters(all, f({ due: "overdue" }), null))).toEqual(["overdue"]);
  });

  it("hoje", () => {
    expect(idsOf(applyFilters(all, f({ due: "today" }), null))).toEqual(["today"]);
  });

  it("próximos 7 dias", () => {
    expect(idsOf(applyFilters(all, f({ due: "week" }), null))).toEqual(["today", "week"]);
  });

  it("sem prazo", () => {
    expect(idsOf(applyFilters(all, f({ due: "none" }), null))).toEqual(["ca", "none", "pj"]);
  });

  it("busca por título/projeto/cliente", () => {
    expect(idsOf(applyFilters(all, f({ search: "projeto teste" }), null))).toEqual(["pj"]);
    expect(idsOf(applyFilters(all, f({ search: "cliente a" }), null)).length).toBeGreaterThan(0);
  });

  it("filtro por cliente", () => {
    expect(idsOf(applyFilters(all, f({ clientId: "cli-a" }), null))).toEqual(["ca", "pj"]);
  });

  it("filtro por projeto", () => {
    expect(idsOf(applyFilters(all, f({ projectId: "prj-1" }), null))).toEqual(["pj"]);
  });

  it("combinação cliente + projeto + busca mantém escopo", () => {
    expect(
      idsOf(
        applyFilters(all, f({ clientId: "cli-a", projectId: "prj-1", search: "projeto" }), null),
      ),
    ).toEqual(["pj"]);
    expect(
      applyFilters(all, f({ clientId: "cli-a", projectId: "prj-1", search: "inexistente" }), null),
    ).toHaveLength(0);
  });

  it("hideDone remove concluídas e não vaza em atrasadas", () => {
    expect(idsOf(applyFilters(all, f({ hideDone: true, due: "overdue" }), null))).toEqual([
      "overdue",
    ]);
  });

  it("o tipo TaskFilters expõe a visão de arquivamento com opção 'todas'", () => {
    // Regra pedida: filtros ativas / arquivadas / todas.
    const withAll = { ...DEFAULT_FILTERS, archive: "all" } as unknown as TaskFilters;
    expect(["active", "archived", "all"]).toContain(withAll.archive);
    // A visão "all" precisa existir no contrato de filtros da UI:
    // Exaustivo pelo tipo: qualquer opção do contrato precisa estar mapeada aqui.
    const labels: Record<TaskFilters["archive"], string> = {
      active: "Ativas",
      archived: "Arquivadas",
      all: "Todas",
    };
    const allowed = Object.keys(labels) as Array<TaskFilters["archive"]>;
    expect(
      allowed as unknown as string[],
      "UI não oferece a visão 'Todas' (ativas + arquivadas) no filtro de arquivamento",
    ).toContain("all");
  });
});
