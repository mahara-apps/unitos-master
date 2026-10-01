import { describe, expect, it } from "vitest";
import { projectWorkItems, type JobRow, type TaskRow, type ProjectRow } from "@/lib/work-items";

const brand = "workspace-a";
const project: ProjectRow = { id: "project-1", brand_id: brand, client_id: "client-a" };
const job: JobRow = {
  id: "shared-id", brand_id: brand, project_id: project.id, name: "Criativos",
  assignee_id: "user-a", status_id: null, start_date: null, due_at: null,
  done_at: null, archived_at: null, created_at: "2026-09-20T12:00:00Z",
};
const task: TaskRow = {
  id: "shared-id", brand_id: brand, client_id: project.client_id, project_id: project.id,
  job_id: job.id, title: "Criar arte", assignee_id: "user-a", status: "todo",
  priority: "medium", start_date: null, due_at: null, archived_at: null,
  created_at: "2026-09-21T12:00:00Z",
};

describe("projeção canônica de trabalho", () => {
  it("preserva Task e Sub-task com o mesmo ID sem colapsar as origens", () => {
    const items = projectWorkItems([job], [task], [project]);
    expect(items.map((item) => item.key)).toEqual(["sub_task:shared-id", "task:shared-id"]);
    expect(items[0]?.parentTaskId).toBe(job.id);
    expect(items.every((item) => item.clientId === "client-a")).toBe(true);
  });
  it("ausência real resulta em lista vazia", () => {
    expect(projectWorkItems([], [], [])).toEqual([]);
  });
  it("falha de leitura ou projeto ausente nunca vira ausência real", () => {
    expect(() => projectWorkItems([job], [task], [])).toThrow("indisponível");
    expect(() => projectWorkItems([job, job], [], [project])).toThrow("duplicada");
  });
  it("rejeita associação cruzada de workspace ou cliente", () => {
    expect(() => projectWorkItems([job], [], [{ ...project, brand_id: "other" }])).toThrow();
    expect(() => projectWorkItems([], [task], [{ ...project, client_id: "other" }])).toThrow();
  });
});
