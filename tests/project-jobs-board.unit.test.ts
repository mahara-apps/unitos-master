import { describe, expect, it } from "vitest";
import fs from "node:fs";

const jobs = fs.readFileSync("src/components/projects/jobs-panel.tsx", "utf8");
const detail = fs.readFileSync("src/components/projects/job-detail-modal.tsx", "utf8");
const tasks = fs.readFileSync("src/lib/tasks.functions.ts", "utf8");
const jobFns = fs.readFileSync("src/lib/project-jobs.functions.ts", "utf8");
const route = fs.readFileSync("src/routes/_authenticated/projects.$projectId.tsx", "utf8");
const verify = fs.readFileSync("supabase/install/verify-installation.sql", "utf8");

describe("gestão de jobs e tarefas no projeto", () => {
  it("separa Jobs e Pautas e agrupa jobs em três colunas", () => {
    expect(jobs).toContain('label: "A fazer"');
    expect(jobs).toContain('label: "Em andamento"');
    expect(jobs).toContain('label: "Concluído"');
    expect(jobs).toContain("pautasCount");
    expect(jobs).toContain("groupFor(job)");
  });

  it("abre o job em drawer e aceita link direto", () => {
    expect(detail).toContain("<Sheet");
    expect(detail).not.toContain("<Dialog");
    expect(route).toContain('job: z.string().uuid().optional()');
    expect(route).toContain("initialJobId={search.job ?? null}");
  });

  it("mantém lista e quadro com arrastar por status", () => {
    expect(jobs).toContain('taskView === "board"');
    expect(jobs).toContain("<DndContext");
    expect(jobs).toContain("task-status:");
    expect(jobs).toContain("TaskTimerWidget");
  });

  it("valida e distribui o estado Bloqueada", () => {
    expect(tasks).toContain('["todo", "in_progress", "review", "blocked", "done"]');
    expect(jobFns).toContain("z.enum(TASK_STATUSES)");
    expect(jobFns).toContain("z.enum(TASK_PRIORITIES)");
    expect(verify).toContain("estado Bloqueada disponível");
  });
});