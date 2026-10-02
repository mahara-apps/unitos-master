import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, cleanup, seed, testTag, type Fixture } from "./helpers/fixtures";
import { projectWorkItems, type JobRow, type ProjectRow, type TaskRow } from "@/lib/work-items";

let fx: Fixture;
let projectA: string;
let projectB: string;
let ownJob: string;
let ownTask: string;
let hiddenJob: string;
let hiddenTask: string;

beforeAll(async () => {
  fx = await seed();
  const projects = await admin.from("projects").insert([
    { brand_id: fx.brandId, client_id: fx.clientA, name: `Trabalho A ${testTag}`, status: "active" },
    { brand_id: fx.brandId, client_id: fx.clientB, name: `Trabalho B ${testTag}`, status: "active" },
  ]).select("id,client_id");
  if (projects.error || projects.data?.length !== 2) throw new Error(`Projetos: ${projects.error?.message ?? "dados incompletos"}`);
  projectA = projects.data.find((p) => p.client_id === fx.clientA)?.id ?? "";
  projectB = projects.data.find((p) => p.client_id === fx.clientB)?.id ?? "";
  if (!projectA || !projectB) throw new Error("Projetos QA inconsistentes.");
  const jobs = await admin.from("project_jobs").insert([
    { brand_id: fx.brandId, project_id: projectA, name: `Task A ${testTag}`, assignee_id: fx.userA.id },
    { brand_id: fx.brandId, project_id: projectB, name: `Task B ${testTag}`, assignee_id: fx.userA.id },
  ]).select("id,project_id");
  if (jobs.error || jobs.data?.length !== 2) throw new Error(`Tasks: ${jobs.error?.message ?? "dados incompletos"}`);
  ownJob = jobs.data.find((j) => j.project_id === projectA)?.id ?? "";
  hiddenJob = jobs.data.find((j) => j.project_id === projectB)?.id ?? "";
  const tasks = await admin.from("tasks").insert([
    { brand_id: fx.brandId, client_id: fx.clientA, project_id: projectA, job_id: ownJob, title: `Sub-task A ${testTag}`, assignee_id: fx.userA.id },
    { brand_id: fx.brandId, client_id: fx.clientB, project_id: projectB, job_id: hiddenJob, title: `Sub-task B ${testTag}`, assignee_id: fx.userA.id },
  ]).select("id,client_id");
  if (tasks.error || tasks.data?.length !== 2) throw new Error(`Sub-tasks: ${tasks.error?.message ?? "dados incompletos"}`);
  ownTask = tasks.data.find((t) => t.client_id === fx.clientA)?.id ?? "";
  hiddenTask = tasks.data.find((t) => t.client_id === fx.clientB)?.id ?? "";
}, 120_000);

afterAll(async () => { await cleanup(fx); }, 120_000);

describe("projeção pessoal sob RLS real", () => {
  it("reconcilia Task e Sub-task atribuídas, sem revelar cliente não atribuído", async () => {
    const user = fx.userA.client;
    const jobs = await user.from("project_jobs")
      .select("id,brand_id,project_id,name,assignee_id,status_id,start_date,due_at,done_at,archived_at,created_at")
      .eq("brand_id", fx.brandId).eq("assignee_id", fx.userA.id);
    const tasks = await user.from("tasks")
      .select("id,brand_id,client_id,project_id,job_id,title,assignee_id,status,priority,start_date,due_at,archived_at,created_at")
      .eq("brand_id", fx.brandId).eq("assignee_id", fx.userA.id);
    const projects = await user.from("projects").select("id,brand_id,client_id")
      .eq("brand_id", fx.brandId).in("id", [projectA, projectB]);
    expect(jobs.error).toBeNull();
    expect(tasks.error).toBeNull();
    expect(projects.error).toBeNull();
    const items = projectWorkItems(jobs.data as JobRow[], tasks.data as TaskRow[], projects.data as ProjectRow[]);
    expect(items.map((item) => item.key).sort()).toEqual([`sub_task:${ownTask}`, `task:${ownJob}`].sort());
    expect(items.every((item) => item.brandId === fx.brandId && item.clientId === fx.clientA)).toBe(true);
    expect(items.map((item) => item.id)).not.toContain(hiddenJob);
    expect(items.map((item) => item.id)).not.toContain(hiddenTask);
    expect(items.find((item) => item.id === ownTask)?.parentTaskId).toBe(ownJob);
  });

  it("owner vê os dois clientes sem fundir Tasks e Sub-tasks", async () => {
    const user = fx.userOwner.client;
    const [jobs, tasks, projects] = await Promise.all([
      user.from("project_jobs").select("id,brand_id,project_id,name,assignee_id,status_id,start_date,due_at,done_at,archived_at,created_at").in("id", [ownJob, hiddenJob]),
      user.from("tasks").select("id,brand_id,client_id,project_id,job_id,title,assignee_id,status,priority,start_date,due_at,archived_at,created_at").in("id", [ownTask, hiddenTask]),
      user.from("projects").select("id,brand_id,client_id").in("id", [projectA, projectB]),
    ]);
    expect(jobs.error).toBeNull();
    expect(tasks.error).toBeNull();
    expect(projects.error).toBeNull();
    expect(projectWorkItems(jobs.data as JobRow[], tasks.data as TaskRow[], projects.data as ProjectRow[])).toHaveLength(4);
  });
});