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
const header = fs.readFileSync("src/components/projects/project-header.tsx", "utf8");
const taskRow = fs.readFileSync("src/components/projects/job-task-row.tsx", "utf8");
const taskTimer = fs.readFileSync("src/components/tasks/task-timer-widget.tsx", "utf8");
const visualState = fs.readFileSync("src/components/projects/work-item-visual-state.tsx", "utf8");
const styles = fs.readFileSync("src/styles.css", "utf8");

describe("gestão de jobs e tarefas no projeto", () => {
  it("separa Jobs e Pautas e agrupa jobs em três colunas", () => {
    expect(list).toContain('value="none"');
    expect(list).toContain('value="status"');
    expect(list).toContain('value="assignee"');
    expect(list).toContain('value="due"');
    expect(jobs).toContain("pautasCount");
    expect(jobs).toContain("JobListView");
  });

  it("abre o job em modal central e aceita link direto", () => {
    expect(detail).toContain("<Dialog");
    expect(detail).not.toContain("<Sheet");
    expect(detail).toContain("max-w-[1440px]");
    expect(route).toContain('job: z.string().uuid().optional()');
    expect(route).toContain("initialJobId={search.job ?? null}");
  });

  it("mantém a rota e evolui o modal com número, briefing e quatro abas", () => {
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

  it("prioriza o título e reduz o timer da lista a play ou pause", () => {
    expect(jobs).toContain("<JobTaskRow");
    expect(taskRow).toContain("line-clamp-2");
    expect(taskRow).toContain("@[900px]:contents");
    expect(taskTimer).toContain("if (compact)");
    expect(taskTimer).toContain('status === "running" ? <Pause');
    expect(taskTimer).toContain(": <Play");
    expect(taskTimer).toContain("Pausar timer");
    expect(taskTimer).toContain("Retomar timer");
  });

  it("mantém lista e quadro com arrastar por status", () => {
    expect(jobs).toContain('taskView === "board"');
    expect(jobs).toContain("<DndContext");
    expect(jobs).toContain("task-status:");
    expect(jobs).toContain("TaskTimerWidget");
  });

  it("diferencia concluídos, cancelados e arquivados em listas e quadros", () => {
    expect(visualState).toContain('"completed" | "cancelled" | "archived"');
    expect(visualState).toContain("normalizeStatusName(statusName).startsWith(\"cancelad\")");
    expect(list).toContain("workItemSurfaceClass(visualState)");
    expect(jobs).toContain("<WorkItemStateBadge");
    expect(taskRow).toContain("workItemSurfaceClass(visualState)");
    expect(styles).toContain("--work-completed-surface:");
    expect(styles).toContain("--work-cancelled-surface:");
    expect(styles).toContain("--work-archived-surface:");
  });

  it("oferece linhas densas, busca por número e criação contextual", () => {
    expect(list).toContain("Buscar nome ou número");
    expect(list).toContain("Adicionar um job");
    expect(list).toContain("DueDateChip");
    expect(list).toContain("StatusPicker");
    expect(list).toContain("job-status:");
    expect(list).toContain("Agrupar:");
    expect(list).toContain("text-work-done");
    expect(list).toContain("border-dashed");
    expect(jobs).toContain("Jobs & Pautas");
    expect(list).toContain("compactPill selectionOnly");
    expect(list).toContain('aria-label="Buscar jobs"');
    expect(list).toContain('useState(false)');
  });

  it("mantém todas as rotas e parâmetros do projeto durante a correção visual", () => {
    expect(route).toContain('tab: z.enum(PROJECT_TABS).optional()');
    expect(route).toContain('job: z.string().uuid().optional()');
    expect(route).toContain('pauta: z.string().optional()');
    expect(route).toContain('board: z.enum(["board", "list", "matrix"]).optional()');
    expect(route).toContain('estagio: z.enum(CONTENT_STAGES).optional()');
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

  it("separa o cabeçalho do projeto dos indicadores editoriais da pauta", () => {
    expect(header).not.toContain("peças concluídas");
    expect(header).not.toContain("StageFunnel");
    expect(header).not.toContain("periodLabel");
    expect(route).not.toContain('compact={tab === "overview"}');
    expect(route).toContain("Etapas das peças da pauta");
    expect(route).toContain("active={search.estagio ?? null}");
  });
});