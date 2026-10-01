/** Read-only operational projection. Never treat a Task and its Sub-task as the same row. */
export type WorkItemSource = "task" | "sub_task";
export type WorkItem = {
  key: string;
  source: WorkItemSource;
  id: string;
  brandId: string;
  clientId: string | null;
  projectId: string | null;
  parentTaskId: string | null;
  title: string;
  assigneeId: string | null;
  status: string;
  priority: string | null;
  startDate: string | null;
  dueAt: string | null;
  archivedAt: string | null;
  createdAt: string;
};

export type JobRow = {
  id: string; brand_id: string; project_id: string; name: string;
  assignee_id: string | null; status_id: string | null;
  start_date: string | null; due_at: string | null;
  done_at: string | null; archived_at: string | null; created_at: string;
};
export type TaskRow = {
  id: string; brand_id: string; client_id: string | null;
  project_id: string | null; job_id: string | null; title: string;
  assignee_id: string | null; status: string; priority: string;
  start_date: string | null; due_at: string | null;
  archived_at: string | null; created_at: string;
};
export type ProjectRow = { id: string; brand_id: string; client_id: string | null };

/** A source tag is mandatory: independent records may happen to have the same UUID. */
export function projectWorkItems(jobs: JobRow[], tasks: TaskRow[], projects: ProjectRow[]): WorkItem[] {
  const byProject = new Map(projects.map((project) => [project.id, project]));
  const items: WorkItem[] = [];
  for (const job of jobs) {
    const project = byProject.get(job.project_id);
    if (!project || project.brand_id !== job.brand_id) {
      throw new Error("Projeto da Task indisponível ou inconsistente.");
    }
    items.push({
      key: `task:${job.id}`, source: "task", id: job.id,
      brandId: job.brand_id, clientId: project.client_id,
      projectId: job.project_id, parentTaskId: null, title: job.name,
      assigneeId: job.assignee_id,
      status: job.done_at ? "done" : (job.status_id ?? "todo"),
      priority: null, startDate: job.start_date, dueAt: job.due_at,
      archivedAt: job.archived_at, createdAt: job.created_at,
    });
  }
  for (const task of tasks) {
    if (task.project_id) {
      const project = byProject.get(task.project_id);
      if (!project || project.brand_id !== task.brand_id || project.client_id !== task.client_id) {
        throw new Error("Projeto da Sub-task indisponível ou inconsistente.");
      }
    }
    items.push({
      key: `sub_task:${task.id}`, source: "sub_task", id: task.id,
      brandId: task.brand_id, clientId: task.client_id,
      projectId: task.project_id, parentTaskId: task.job_id,
      title: task.title, assigneeId: task.assignee_id,
      status: task.status, priority: task.priority,
      startDate: task.start_date, dueAt: task.due_at,
      archivedAt: task.archived_at, createdAt: task.created_at,
    });
  }
  const keys = new Set(items.map((item) => item.key));
  if (keys.size !== items.length) throw new Error("Identidade de trabalho duplicada.");
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.key.localeCompare(b.key));
}
