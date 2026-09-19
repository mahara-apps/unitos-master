import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const freezeSql = readFileSync("supabase/master/002_control_plane_global_freeze.sql", "utf8");
const recovery = readFileSync(
  "supabase/master/recovery/20260919143000_recover_missing_legacy_reconciliation.sql",
  "utf8",
);
const preflight = readFileSync("supabase/master/recovery-control-plane-preflight.sql", "utf8");
const promotion = readFileSync("supabase/master/tools/promote_master_control_plane.sh", "utf8");
const operator = readFileSync("supabase/master/tools/control_plane_freeze.sh", "utf8");

describe("congelamento global fail-closed do Control-plane", () => {
  it("mantém estado singleton e histórico auditável com grants antes do RLS", () => {
    expect(freezeSql).toContain("CREATE TABLE public.installation_operations_freeze (");
    expect(freezeSql).toContain("PRIMARY KEY DEFAULT true CHECK (singleton)");
    expect(freezeSql).toContain("CREATE TABLE public.installation_operations_freeze_events (");
    expect(freezeSql.indexOf("GRANT SELECT ON public.installation_operations_freeze")).toBeLessThan(
      freezeSql.indexOf(
        "ALTER TABLE public.installation_operations_freeze ENABLE ROW LEVEL SECURITY",
      ),
    );
    expect(freezeSql).toContain("installation_operations_freeze_super_admin_read");
    expect(freezeSql).toContain("installation_operations_freeze_events_super_admin_read");
  });

  it("serializa mudança e mutações com a mesma advisory lock", () => {
    expect(
      freezeSql.match(/hashtextextended\('unitos:master:installation-operations-freeze',0\)/g),
    ).toHaveLength(2);
    expect(freezeSql).toContain("FOR UPDATE");
    expect(freezeSql).toContain("_current.generation <> _expected_generation");
    expect(freezeSql).toContain("status IN ('pending','running','retryable')");
    expect(freezeSql).toContain("status IN ('running','retryable')");
  });

  it("bloqueia fail-closed todas as tabelas operacionais inclusive service_role", () => {
    for (const table of [
      "installations",
      "installation_credentials",
      "installation_operations",
      "installation_operation_attempts",
      "installation_operation_steps",
      "installation_operation_outbox",
      "installation_operation_migrations",
    ]) {
      expect(freezeSql).toContain(`'${table}'`);
    }
    expect(freezeSql).toContain("BEFORE INSERT OR UPDATE OR DELETE");
    expect(freezeSql).toContain("SELECT frozen INTO STRICT _frozen");
    expect(freezeSql).toContain("Estado do congelamento ausente ou inválido; mutação bloqueada");
  });

  it("restringe a escrita do estado às RPCs privilegiadas", () => {
    expect(freezeSql).toContain(
      "REVOKE ALL ON FUNCTION public.set_installation_operations_freeze(boolean,text,text,bigint)",
    );
    expect(freezeSql).toContain("TO service_role");
    expect(freezeSql).toContain(
      "GRANT SELECT ON public.installation_operations_freeze TO service_role",
    );
    expect(freezeSql).not.toContain(
      "GRANT ALL ON public.installation_operations_freeze TO service_role",
    );
  });

  it("obriga preflight e recovery a confirmarem freeze ativo", () => {
    expect(preflight).toContain("congelamento global instalado e ativo");
    expect(preflight).toContain("freeze_active");
    expect(recovery).toContain("congelamento global não está ativo");
    expect(recovery).toContain("unitos:master:installation-operations-freeze");
    expect(recovery).toContain("installation_operations_freeze_guard");
  });

  it("separa instalação, ativação e desativação da recovery e do UPDATE", () => {
    expect(promotion).toContain("--install-global-freeze");
    expect(promotion).toContain("INSTALL_GLOBAL_FREEZE_ONLY");
    expect(operator).toContain("status|freeze|unfreeze");
    expect(operator).toContain("I_UNDERSTAND_GLOBAL_CONTROL_PLANE_FREEZE");
    expect(operator).toContain("UNITOS_FREEZE_REASON");
    expect(operator).toContain("UNITOS_FREEZE_ACTOR");
    expect(operator).not.toContain("recover-missing-1.4.10");
    expect(operator).not.toContain("UPDATE");
  });
});
