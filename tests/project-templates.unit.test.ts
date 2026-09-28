import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync("src/lib/project-templates.functions.ts", "utf8");
const dialog = readFileSync("src/components/projects/new-from-template-dialog.tsx", "utf8");
const models = readFileSync("src/routes/_authenticated/projects.models.tsx", "utf8");
const modelsIndex = readFileSync("src/routes/_authenticated/projects.models.index.tsx", "utf8");
const modelsNew = readFileSync("src/routes/_authenticated/projects.models.new.tsx", "utf8");
const modelsEdit = readFileSync("src/routes/_authenticated/projects.models.$templateId.tsx", "utf8");
const adminMigration = readFileSync("supabase/migrations/20260928013316_2818f617-12f0-4957-aeef-5330cf7a7f18.sql", "utf8");
const identityMigration = readFileSync("supabase/migrations/20260928013858_903164d8-e054-42f2-a15a-1bb51815a2d2.sql", "utf8");
const migrations = [
  "supabase/migrations/20260928004126_a3b8f3f4-41df-4cff-9f55-86c8916f0e7c.sql",
  "supabase/migrations/20260928004322_7707cf99-e209-4147-a370-cbf5f9663684.sql",
  "supabase/migrations/20260928004649_5a9beab8-4348-4437-b7ec-55716bc2620d.sql",
  "supabase/migrations/20260928005017_ab27812d-f011-46da-ba3c-6474bc1399de.sql",
].map(path => readFileSync(path, "utf8")).join("\n");

describe("modelos de projeto", () => {
  test("captura tarefas diretas e textos sem seleção automática", () => {
    expect(source).toContain("directTasks:");
    expect(source).toContain('sourceKind: "task_comment"');
    expect(source).toContain('sourceKind: "brand_briefing"');
    expect(models).toContain("selected: false");
  });

  test("revisa pessoas e cria uma única vez", () => {
    expect(source).toContain('"instantiate_project_template_once"');
    expect(source).toContain('"can_access_client"');
    expect(dialog).toContain("requestId");
    expect(dialog).toContain("pessoas sem acesso ao cliente");
  });

  test("não recria autoria histórica e valida origem dos textos", () => {
    expect(migrations).toContain("Missing source text proof");
    expect(migrations).toContain("description=concat_ws");
    expect(migrations).not.toContain("author_id,_uid");
  });
  test("separa lista, criação e edição em páginas com proteção de alterações não salvas", () => {
    expect(models).toContain("component: () => <Outlet />");
    expect(modelsIndex).toContain("component: ProjectModelsPage");
    expect(modelsNew).toContain('mode="new"');
    expect(modelsEdit).toContain('mode="edit"');
    expect(models).toContain("useBlocker({ shouldBlockFn:");
    expect(models).toContain("Descartar alterações não salvas?");
    expect(models).toContain('setFilter(key)');
    expect(models).toContain('setSearch(e.target.value)');
  });
  test("gestão administrativa impede escrita por outros papéis e protege modelos de sistema", () => {
    expect(identityMigration).toContain("_user_id=auth.uid()");
    expect(identityMigration).toContain("public.is_super_admin(auth.uid())");
    expect(identityMigration).toContain("public.app_access_role(auth.uid(),_brand_id)='admin'");
    expect(adminMigration).toContain("NOT t.is_system");
    expect(adminMigration).toContain("t.brand_id=_brand_id");
    expect(adminMigration).toContain("_confirmation IS DISTINCT FROM _model.name");
    expect(adminMigration).toContain("Model has creation records; archive instead");
    expect(adminMigration).toContain("REVOKE INSERT, UPDATE, DELETE ON public.project_template_jobs,public.project_template_tasks FROM authenticated");
    expect(source).toContain('"can_manage_project_templates"');
  });
});