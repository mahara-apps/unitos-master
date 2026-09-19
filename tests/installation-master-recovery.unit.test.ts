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
    expect(manifest["schemaVersion"]).toBe(3);
    expect(manifest["supabaseCliVersion"]).toBe("2.117.0");
    expect(manifest["dryRunHeader"]).toBe(
      "DRY RUN: migrations will *not* be pushed to the database.",
    );
    expect(manifest["dryRunMigrationPrefix"]).toBe("Would push migration ");
    expect(manifest["dryRunFooter"]).toBe("Finished supabase db push.");
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

  it("mantém o ledger fora do SQL e delega o registro da recuperação ao executor oficial", () => {
    expect(recovery).not.toContain("VALUES ('20260917184500'");
    expect(recovery).not.toContain("INSERT INTO supabase_migrations.schema_migrations");
    expect(recovery).toContain("O executor oficial de migrations registra 20260919143000");
    expect(recovery).toContain("BEGIN;");
    expect(recovery).toContain("COMMIT;");
    expect(recovery).not.toContain("migration repair");
  });

  it("valida integralmente o contrato publicado da 1.4.11", () => {
    expect(preflight).toContain("pg_get_functiondef");
    expect(preflight).toContain("expected_signature");
    expect(preflight).toContain("pg_get_function_result");
    expect(preflight).toContain("pg_get_userbyid(p.proowner)");
    expect(preflight).toContain("aclexplode");
    expect(preflight).toContain("p.prosecdef");
    expect(preflight).toContain("search_path=public");
    expect(preflight).toContain("reconcile_overloads FROM overloads) = 1");
    expect(preflight).toContain("dependências estruturais da 1.4.11 presentes");
  });

  it("compara nomes, tipos, ordem e quantidade sem depender da representação textual", () => {
    expect(preflight).toContain(
      "ARRAY['_operation_id','_owner','_fencing_token','_migrations']::text[]",
    );
    expect(preflight).toContain("ARRAY['uuid','text','bigint','jsonb']::text[]");
    expect(preflight).toContain("ARRAY['_max_idle_seconds']::text[]");
    expect(preflight).toContain("ARRAY['integer']::text[]");
    expect(preflight).toContain("p.proargnames[i]");
    expect(preflight).toContain("format_type(p.proargtypes[i], NULL)");
    expect(preflight).toContain("pronargs = cardinality(expected_arg_types)");
    expect(preflight).toContain("actual_arg_names = expected_arg_names");
    expect(preflight).toContain("actual_arg_types = expected_arg_types");
    expect(preflight).not.toContain("actual_identity_args = expected_identity_args");
  });

  it("mantém o bloqueio explícito de overloads por nome", () => {
    expect(preflight).toContain("pp.proname = split_part(s.expected_signature, '(', 1)");
    expect(preflight).toContain("reconcile_overloads FROM overloads) = 1");
    expect(preflight).toContain("normalize_overloads FROM overloads) = 1");
  });

  it("possui ensaio PostgreSQL isolado para assinaturas e atomicidade", () => {
    const script = readFileSync(
      "supabase/master/tools/test_master_recovery_local.sh",
      "utf8",
    );
    expect(script).toContain("pg_get_function_identity_arguments");
    expect(script).toContain("assert_check_status 7");
    expect(script).toContain("argument name mismatch");
    expect(script).toContain("argument type mismatch");
    expect(script).toContain("argument count mismatch");
    expect(script).toContain("unexpected overload");
    expect(script).toContain("ROLLBACK");
    expect(script).toContain("20260919143000");
  });

  it("trata PUBLIC exclusivamente como grantee zero na ACL expandida", () => {
    expect(preflight).toContain("g.grantee = 0");
    expect(preflight).toContain("aclexplode(coalesce(proacl, acldefault('f', proowner)))");
    expect(preflight).not.toContain("has_function_privilege('public'");
    expect(preflight).not.toContain('has_function_privilege("public"');
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
