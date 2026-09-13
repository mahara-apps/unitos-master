import { describe, expect, it } from "vitest";
import fs from "node:fs";

const jobs = fs.readFileSync("src/components/projects/jobs-panel.tsx", "utf8");
const detail = fs.readFileSync("src/components/projects/job-detail-modal.tsx", "utf8");
const tasks = fs.readFileSync("src/lib/tasks.functions.ts", "utf8");
const jobFns = fs.readFileSync("src/lib/project-jobs.functions.ts", "utf8");
const route = fs.readFileSync("src/routes/_authenticated/projects.$projectId.tsx", "utf8");
const verify = fs.readFileSync("supabase/install/verify-installation.sql", "utf8");
const list = fs.readFileSync("src/components/projects/job-list-view.tsx", "utf8");
const overview = fs.readFileSync("src/components/projects/project-overview.tsx", "utf8");

describe("gestão de jobs e tarefas no projeto", () => {
  it("separa Jobs e Pautas e agrupa jobs em três colunas", () => {
    expect(list).toContain('value="status"');
    expect(list).toContain('value="assignee"');
    expect(list).toContain('value="due"');
    expect(jobs).toContain("pautasCount");
    expect(jobs).toContain("JobListView");
  });

  it("abre o job em drawer e aceita link direto", () => {
    expect(detail).toContain("<Sheet");
    expect(detail).not.toContain("<Dialog");
    expect(route).toContain('job: z.string().uuid().optional()');
    expect(route).toContain("initialJobId={search.job ?? null}");
  });

  it("mantém a rota e evolui o drawer com número, briefing e quatro abas", () => {
    expect(jobs).toContain('code={currentJob ? `#${currentJob.job_number}.1`');
    expect(jobs).toContain("JobBriefingEditor");
    expect(jobs).toContain('label: "Comentários"');
    expect(jobs).toContain('label: "Anexos"');
    expect(jobs).toContain('label: "Timesheet"');
    expect(jobs).toContain('label: "Histórico"');
    expect(route).toContain("tab: z.enum(PROJECT_TABS).optional()");
  });

  it("oferece status pesquisável, timer direto e subtarefas", () => {
    expect(jobs).toContain('scope="task"');
    expect(jobs).toContain('placeholder="+ status"');
    expect(jobs).toContain("JobTimerWidget");
    expect(jobs).toContain("TaskSubtasksPopover");
  });

  it("mantém lista e quadro com arrastar por status", () => {
    expect(jobs).toContain('taskView === "board"');
    expect(jobs).toContain("<DndContext");
    expect(jobs).toContain("task-status:");
    expect(jobs).toContain("TaskTimerWidget");
  });

  it("oferece linhas densas, busca por número e criação contextual", () => {
    expect(list).toContain("Buscar nome ou número");
    expect(list).toContain("Adicionar um job");
    expect(list).toContain("DueDateChip");
    expect(list).toContain("StatusPicker");
    expect(list).toContain("job-status:");
    expect(list).toContain("Agrupar por:");
    expect(list).toContain("text-work-done");
    expect(list).toContain("border-dashed");
    expect(jobs).toContain("Jobs & Pautas");
  });

  it("distribui os cinco status oficiais de job sem os legados", () => {
    for (const status of ["não iniciado", "em andamento", "em revisão", "bloqueado", "concluído"]) {
      expect(verify).toContain(status);
    }
    expect(verify).toContain("legados_job");
    expect(verify).toContain("campanha pausada");
  });

  it("duplica job e tarefas por operação transacional protegida", () => {
    expect(jobs).toContain("duplicateJobFn");
    expect(jobFns).toContain('"duplicate_project_job"');
    expect(verify).toContain("duplicate_project_job");
  });

  it("valida e distribui o estado Bloqueada", () => {
    expect(tasks).toContain('["todo", "in_progress", "review", "blocked", "done"]');
    expect(jobFns).toContain("z.enum(TASK_STATUSES)");
    expect(jobFns).toContain("z.enum(TASK_PRIORITIES)");
    expect(verify).toContain("estado Bloqueada disponível");
  });

  it("mantém a Visão geral como resumo operacional sem alterar a rota", () => {
    expect(route).toContain('tab === "overview"');
    expect(route).toContain("<ProjectOverview");
    expect(overview).toContain("PageKpiGrid");
    expect(overview).toContain("Resumo de jobs");
    expect(overview).toContain("Pipeline de conteúdo");
    expect(overview).toContain("Atividade recente");
    expect(jobFns).toContain("getProjectOverviewFn");
    expect(jobFns).toContain('.eq("project_id", data.projectId)');
  });
});