import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("reinstalação limpa de instalação", () => {
  it("mantém o ambiente antigo até o novo projeto vazio ser provisionado", () => {
    const source = read("src/lib/installation/manager.functions.ts");
    expect(source).toContain("clean_replacement_of: data.id");
    expect(source).toContain("pending_domain: current.domain");
    expect(source).toContain("auth.users");
    expect(source).toContain("storage.objects");
    expect(source).toContain("oldProjectRef === newProjectRef");
    expect(source).toContain("openAutomatedProvision(context, replacement.id)");
  });

  it("faz o cutover somente com release e saúde verificadas", () => {
    const sql = read("supabase/master/006_clean_installation_replacement.sql");
    expect(sql).toContain("_replacement.status <> 'up_to_date'");
    expect(sql).toContain("_replacement.health <> 'healthy'");
    expect(sql).toContain("_replacement.current_version IS DISTINCT FROM _expected_release");
    expect(sql).toContain("_source.active_operation_id IS NOT NULL");
    expect(sql).toContain("DELETE FROM public.installations WHERE id=_source.id");
  });

  it("permanece exclusivo do Control-plane MASTER", () => {
    const builder = read("supabase/master/tools/build_master_bootstrap.py");
    const destinations = read("supabase/baseline-snapshot/tools/migration-destinations.json");
    expect(builder).toContain("006_clean_installation_replacement.sql");
    expect(destinations).not.toContain("006_clean_installation_replacement.sql");
  });
});
