import { describe, expect, it } from "vitest";
import duplication from "../supabase/migrations/20260928000945_54133f19-7bcd-46a5-a721-e0b40ee42d7e.sql?raw";

describe("duplicação segura de projeto", () => {
  it("valida a origem antes de devolver o resultado de uma solicitação repetida", () => {
    const conflictCheck = duplication.indexOf("IF NOT EXISTS(SELECT 1 FROM public.project_duplication_requests");
    const cachedReturn = duplication.indexOf("IF _existing IS NOT NULL THEN RETURN _existing; END IF;");
    expect(conflictCheck).toBeGreaterThan(-1);
    expect(cachedReturn).toBeGreaterThan(conflictCheck);
    expect(duplication).toContain("source_project_id=_project_id AND brand_id=_brand_id");
  });

  it("mantém o chamador sujeito às políticas e restringe a execução", () => {
    expect(duplication).toContain("SECURITY INVOKER");
    expect(duplication).toContain("REVOKE ALL ON FUNCTION public.duplicate_project(uuid,uuid,uuid) FROM PUBLIC,anon");
    expect(duplication).toContain("GRANT EXECUTE ON FUNCTION public.duplicate_project(uuid,uuid,uuid) TO authenticated,service_role");
  });

  it("não replica execução, histórico ou vínculo editorial", () => {
    expect(duplication).toContain("'COPIA - '||_source.name");
    expect(duplication).toContain("'todo',_task.priority");
    expect(duplication).toContain("_task.estimated_minutes,0,_task.position,_uid,NULL");
    expect(duplication).toContain("SELECT _brand_id,_new_task,s.title,false,s.position,_uid");
    expect(duplication).not.toMatch(/INSERT INTO public\.(?:task_time_entries|work_comments|task_comments|posts|monthly_plans)/);
  });
});