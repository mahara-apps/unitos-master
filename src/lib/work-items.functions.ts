import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertBrandMember } from "@/lib/access-guard";
import { projectWorkItems, type JobRow, type TaskRow, type ProjectRow, type WorkItem } from "@/lib/work-items";

const PAGE_SIZE = 200;

/** Read only; every source query is evaluated as the signed-in user under RLS. */
export const listWorkItemsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    brandId: z.string().uuid(),
    assigneeId: z.string().uuid().optional(),
    archive: z.enum(["active", "archived", "all"]).default("active"),
    offset: z.number().int().min(0).max(100_000).default(0),
    limit: z.number().int().min(1).max(200).default(50),
  }).parse(input))
  .handler(async ({ data, context }): Promise<{ items: WorkItem[]; total: number; hasMore: boolean }> => {
    await assertBrandMember(context.supabase, context.userId, data.brandId);
    // Restrict the personal read to the caller. Cross-person visibility requires
    // its own authority contract and is deliberately not part of this phase.
    if (data.assigneeId && data.assigneeId !== context.userId) {
      throw new Error("Consulte somente os itens atribuídos a você.");
    }
    const assigneeId = data.assigneeId ?? context.userId;
    const readAll = async <T>(table: "project_jobs" | "tasks", columns: string): Promise<T[]> => {
      const rows: T[] = [];
      for (let offset = 0; ; offset += PAGE_SIZE) {
        let query = context.supabase.from(table).select(columns)
          .eq("brand_id", data.brandId).eq("assignee_id", assigneeId);
        if (data.archive === "active") query = query.is("archived_at", null);
        if (data.archive === "archived") query = query.not("archived_at", "is", null);
        const { data: page, error } = await query.order("id", { ascending: true })
          .range(offset, offset + PAGE_SIZE - 1);
        if (error) throw error;
        if (!Array.isArray(page)) throw new Error("Resposta inválida ao ler itens de trabalho.");
        rows.push(...(page as T[]));
        if (page.length < PAGE_SIZE) break;
      }
      return rows;
    };
    const [jobs, tasks] = await Promise.all([
      readAll<JobRow>("project_jobs", "id,brand_id,project_id,name,assignee_id,status_id,start_date,due_at,done_at,archived_at,created_at"),
      readAll<TaskRow>("tasks", "id,brand_id,client_id,project_id,job_id,title,assignee_id,status,priority,start_date,due_at,archived_at,created_at"),
    ]);
    const projectIds = [...new Set([
      ...jobs.map((j) => j.project_id),
      ...tasks.map((t) => t.project_id).filter((id): id is string => id !== null),
    ])];
    const projects: ProjectRow[] = [];
    for (let offset = 0; offset < projectIds.length; offset += PAGE_SIZE) {
      const { data: page, error } = await context.supabase.from("projects")
        .select("id,brand_id,client_id").eq("brand_id", data.brandId)
        .in("id", projectIds.slice(offset, offset + PAGE_SIZE));
      if (error) throw error;
      if (!Array.isArray(page)) throw new Error("Resposta inválida ao ler projetos.");
      projects.push(...page);
    }
    const all = projectWorkItems(jobs, tasks, projects);
    return {
      items: all.slice(data.offset, data.offset + data.limit),
      total: all.length,
      hasMore: data.offset + data.limit < all.length,
    };
  });
