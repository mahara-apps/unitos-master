import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const recovery = readFileSync(
  "supabase/master/recovery/20260919143000_recover_missing_legacy_reconciliation.sql",
  "utf8",
);
const preflight = readFileSync("supabase/master/recovery-control-plane-preflight.sql", "utf8");
const original1410 = readFileSync(
  "supabase/migrations/20260917184500_legacy_migration_reconciliation.sql",
  "utf8",
);
const original1411 = readFileSync(
  "supabase/migrations/20260917190721_f04a7c59-5fbb-4ef3-aa75-044844da8fa3.sql",
  "utf8",
);
const manifest = JSON.parse(
  readFileSync("supabase/master/recovery-control-plane.json", "utf8"),
) as Record<string, string | number>;

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

describe("recuperação local da lacuna 1.4.10", () => {
  it("sela origem, dependência, preflight e recuperação com hashes canônicos", () => {
    expect(manifest["releaseVersion"]).toBe("1.4.14");
    expect(manifest["targetProjectRef"]).toBe("tkjbhttylouamqxnbfgv");
    expect(manifest["repairsSha256"]).toBe(sha256(original1410));
    expect(manifest["requiresSha256"]).toBe(sha256(original1411));
    expect(manifest["recoverySha256"]).toBe(sha256(recovery));
    expect(manifest["preflightSha256"]).toBe(sha256(preflight));
  });

  it("exige a lacuna exata, dependências 1.4.11 e ausência integral dos objetos", () => {
    expect(preflight).toContain("version='20260917184500'");
    expect(preflight).toContain("version='20260917190721'");
    expect(preflight).toContain("version='20260919143000'");
    expect(preflight).toContain("objetos 1.4.10 integralmente ausentes");
    expect(recovery).toContain("estrutura 1.4.10 parcial ou divergente");
    expect(recovery).toContain("existe operação ativa ou retomável");
    expect(recovery).toContain("pg_advisory_xact_lock");
  });

  it("cria somente os objetos da 1.4.10 e não contém SQL da 1.4.11", () => {
    expect(recovery).toContain(
      "CREATE TABLE public.installation_migration_reconciliation_evidence",
    );
    expect(recovery).toContain(
      "CREATE FUNCTION public.record_installation_migration_reconciliation_evidence",
    );
    expect(recovery).toContain(
      "CREATE FUNCTION public.read_installation_migration_reconciliation_evidence",
    );
    expect(recovery).not.toContain(
      "CREATE OR REPLACE FUNCTION public.reconcile_installation_operation_migrations",
    );
    expect(recovery).not.toContain(
      "CREATE OR REPLACE FUNCTION public.normalize_legacy_installation_operations",
    );
    expect(recovery).not.toContain("SET status = 'manual_review'");
    expect(recovery).not.toContain("SET status = 'orphaned'");
    expect(sha256(recovery)).not.toBe(sha256(original1411));
  });

  it("mantém 1.4.10 ausente e registra somente a recuperação após pós-condições", () => {
    expect(recovery).not.toContain("VALUES ('20260917184500'");
    const postcondition = recovery.indexOf("$unitos_recovery_postcondition$");
    const ledgerInsert = recovery.lastIndexOf("INSERT INTO supabase_migrations.schema_migrations");
    expect(postcondition).toBeGreaterThan(0);
    expect(ledgerInsert).toBeGreaterThan(postcondition);
    expect(recovery).toContain("VALUES ('20260919143000'");
    expect(recovery).not.toContain("migration repair");
  });

  it("permanece fora do pacote Client e dos caminhos normais do Master", () => {
    const destinations = readFileSync(
      "supabase/baseline-snapshot/tools/migration-destinations.json",
      "utf8",
    );
    const convergence = readFileSync("supabase/master/convergence-control-plane.sql", "utf8");
    const bootstrap = readFileSync("supabase/master/bootstrap-control-plane.sql", "utf8");
    expect(destinations).not.toContain("20260919143000_recover_missing_legacy_reconciliation.sql");
    expect(convergence).not.toContain("20260919143000_recover_missing_legacy_reconciliation.sql");
    expect(bootstrap).not.toContain("20260919143000_recover_missing_legacy_reconciliation.sql");
  });
});
