import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync("src/lib/project-templates.functions.ts", "utf8");
const dialog = readFileSync("src/components/projects/new-from-template-dialog.tsx", "utf8");
const models = readFileSync("src/routes/_authenticated/projects.models.tsx", "utf8");
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
});