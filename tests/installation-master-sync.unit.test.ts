import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { MASTER_RELEASE_VERSION } from "@/lib/installation/manager-contract";
import delta from "../supabase/baseline-snapshot/007_delta_migrations.sql?raw";
import manifestRaw from "../supabase/baseline-snapshot/tools/delta_manifest.txt?raw";
import versionRaw from "../supabase/baseline-snapshot/tools/delta_version.txt?raw";
import verifySql from "../supabase/install/verify-installation-client.sql?raw";
import verifyMasterSql from "../supabase/install/verify-installation-master.sql?raw";
import masterBootstrap from "../supabase/master/bootstrap-control-plane.sql?raw";
import convergence from "../supabase/master/001_control_plane_convergence_v1_4_3.sql?raw";
import convergenceEntry from "../supabase/master/convergence-control-plane.sql?raw";
import reconciliation from "../supabase/migrations/20260917184500_legacy_migration_reconciliation.sql?raw";
import p0Hardening from "../supabase/migrations/20260917190721_f04a7c59-5fbb-4ef3-aa75-044844da8fa3.sql?raw";
import extensions from "../supabase/baseline-snapshot/000_extensions.sql?raw";

/**
 * MASTER-first: nenhuma alteracao do sistema pode ficar fora do pacote que as
 * instalacoes recebem. Este teste é o guardiao da regra:
 *  1. o pacote precisa estar regenerado (impressao digital registrada);
 *  2. a versao anunciada pelo MASTER precisa acompanhar o pacote;
 *  3. toda tabela criada pelo pacote precisa ser conferida no relatorio de saude.
 */

function parseVersionFile(raw: string): { version: string; sha256: string } {
  const get = (key: string) =>
    raw
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.startsWith(`${key}=`))
      ?.slice(key.length + 1)
      .trim() ?? "";
  return { version: get("version"), sha256: get("sha256") };
}

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function tabelasDoDelta(sql: string): string[] {
  // Tabelas criadas apenas como passo intermediario e renomeadas no mesmo
  // pacote (ex.: brain_events_new -> brain_events) nunca existem no destino:
  // o nome final entra na verificacao, o intermediario sai.
  const renomeadas = new Map<string, string>();
  const reRename = /ALTER TABLE (?:IF EXISTS )?public\.([a-z0-9_]+)\s+RENAME TO ([a-z0-9_]+)/gi;
  for (const m of sql.matchAll(reRename)) {
    renomeadas.set(m[1]!.toLowerCase(), m[2]!.toLowerCase());
  }

  const re = /CREATE TABLE (?:IF NOT EXISTS )?public\.([a-z0-9_]+)/gi;
  const out = new Set<string>();
  for (const m of sql.matchAll(re)) {
    let nome = m[1]!.toLowerCase();
    // Segue a cadeia de renomeacoes ate o nome final.
    const vistos = new Set<string>();
    while (renomeadas.has(nome) && !vistos.has(nome)) {
      vistos.add(nome);
      nome = renomeadas.get(nome)!;
    }
    if (nome.startsWith("_unitos_")) continue;
    out.add(nome);
  }
  return [...out].sort();
}

describe("sincronia MASTER-first", () => {
  const { version, sha256 } = parseVersionFile(versionRaw);

  it("delta_version.txt declara versao e impressao digital", () => {
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("o pacote foi regenerado (impressao digital confere)", async () => {
    expect(await sha256Hex(delta)).toBe(sha256);
  });

  it("MASTER_RELEASE_VERSION acompanha o pacote", () => {
    expect(MASTER_RELEASE_VERSION).toBe(version);
  });

  it("manifesto declara cada migration em ordem com SHA-256", () => {
    const entries = manifestRaw.trim().split("\n");
    const files = [...delta.matchAll(/^-- ([0-9]{14}_[A-Za-z0-9_-]+\.sql)$/gm)].map(
      (match) => match[1],
    );
    expect(entries).toHaveLength(files.length);
    expect(entries.map((entry) => entry.split(/\s+/)[0])).toEqual(files);
    expect(entries.every((entry) => /^[^\s]+\.sql\s+[0-9a-f]{64}$/.test(entry))).toBe(true);
  });

  it("instalação limpa recebe o ledger canônico endurecido sem backfill", () => {
    expect(extensions).toContain("CREATE TABLE IF NOT EXISTS public._unitos_applied_deltas");
    expect(extensions).toContain("ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'blob'");
    expect(extensions).toContain("ADD COLUMN IF NOT EXISTS file text");
    expect(extensions).toContain("ADD COLUMN IF NOT EXISTS fingerprint text");
    expect(extensions).toContain("_unitos_applied_deltas_file_fingerprint_key");
    expect(extensions).toContain("ENABLE ROW LEVEL SECURITY");
    expect(extensions).toContain(
      "REVOKE ALL ON public._unitos_applied_deltas FROM anon, authenticated",
    );
    expect(extensions).not.toMatch(/UPDATE\s+public\._unitos_applied_deltas/i);
  });

  it("converge pgvector para public sem remover a extensão ou seus objetos", () => {
    expect(extensions).toContain("detected_schema text");
    expect(extensions).not.toMatch(/\bcurrent_schema\s+text\b/i);
    expect(extensions).toContain("WHERE e.extname = 'vector'");
    expect(extensions).toContain("CREATE EXTENSION vector WITH SCHEMA public");
    expect(extensions).toContain("ALTER EXTENSION vector SET SCHEMA public");
    expect(extensions).not.toMatch(/DROP\s+EXTENSION(?:\s+IF\s+EXISTS)?\s+vector/i);
    expect(extensions).toContain("pg_extension não confirmou vector no schema public");
    expect(extensions).toContain("to_regtype('public.vector') IS NULL");
    expect(extensions).toContain("oc.opcname = 'vector_cosine_ops'");
  });

  it.each([
    ["ausente", "detected_schema IS NULL", "CREATE EXTENSION vector WITH SCHEMA public"],
    ["em extensions", "detected_schema <> 'public'", "ALTER EXTENSION vector SET SCHEMA public"],
    ["em public", "ELSIF detected_schema <> 'public'", "END IF"],
  ])("cobre vector %s no bootstrap descartável", (_state, branch, action) => {
    expect(extensions).toContain(branch);
    expect(extensions).toContain(action);
  });

  it("ensaio descartável executa os três estados e depois 001_initial_schema", () => {
    const script = readFileSync(
      "supabase/baseline-snapshot/tools/verify_on_disposable_project.sh",
      "utf8",
    );
    expect(script).toContain("DROP EXTENSION IF EXISTS vector");
    expect(script).toContain("ALTER EXTENSION vector SET SCHEMA extensions");
    expect(script.match(/000_extensions\.sql/g)).toHaveLength(3);
    expect(script.indexOf("000_extensions.sql")).toBeLessThan(
      script.indexOf("001_initial_schema.sql"),
    );
    expect(script).toContain("to_regtype('public.vector') IS NULL");
    expect(script).toContain("oc.opcname = 'vector_cosine_ops'");
  });

  it("ensaio PostgreSQL local cobre CREATE, ALTER, reexecução, pós-condição e rollback", () => {
    const script = readFileSync(
      "supabase/baseline-snapshot/tools/test_pgvector_wrapper_local.sh",
      "utf8",
    );
    expect(script).toContain("000_extensions.sql");
    expect(script).toContain("CREATE EXTENSION vector WITH SCHEMA extensions");
    expect(script).toContain("ALTER EXTENSION vector SET SCHEMA public");
    expect(script.split('cat "$WRAPPER"').length - 1).toBeGreaterThanOrEqual(4);
    expect(script).toContain("to_regtype('public.vector') IS NULL");
    expect(script).toContain("oc.opcname = 'vector_cosine_ops'");
    expect(script.match(/ROLLBACK;/g)?.length).toBe(3);
    expect(script).toContain("vector_oid_before");
  });

  it("relatorio de saude confere todas as tabelas do pacote", () => {
    const faltando = tabelasDoDelta(delta).filter(
      (t) => !verifySql.includes(`'${t}'`) && !verifySql.includes(`public.${t}`),
    );
    expect(faltando).toEqual([]);
  });

  it("relatório exige tipo e operator class do pgvector no schema public", () => {
    expect(verifySql).toContain("pgvector canônico (public.vector + public.vector_cosine_ops)");
    expect(verifySql).toContain("to_regtype('public.vector') IS NOT NULL");
    expect(verifySql).toContain("oc.opcname = 'vector_cosine_ops'");
    expect(verifySql).toContain("n.nspname = 'public'");
  });

  it("bootstrap e verificação Master incluem o workflow durável fora do Client", () => {
    expect(masterBootstrap).toContain(
      "CREATE OR REPLACE FUNCTION public.start_durable_installation_operation",
    );
    expect(masterBootstrap).toContain("_retry_of_operation_id uuid DEFAULT NULL");
    expect(masterBootstrap).toContain("'retryOfOperationId', _retry_of_operation_id");
    expect(verifyMasterSql).toContain("start_durable_installation_operation");
    expect(delta).not.toContain("start_durable_installation_operation");
    expect(verifySql).not.toContain("installation-provision-resume");
  });

  it("convergência Master antecede o primeiro produtor que usa outbox e lease", () => {
    expect(masterBootstrap.indexOf("-- MASTER CONVERGENCE")).toBeGreaterThan(-1);
    expect(masterBootstrap.indexOf("-- MASTER CONVERGENCE")).toBeLessThan(
      masterBootstrap.indexOf(
        "-- MIGRATION 20260913230055_f50b7d0b-e5e5-4cc8-9ad0-ddcfd8104005.sql",
      ),
    );
    for (const column of [
      "workflow_version",
      "baseline_id",
      "baseline_hash",
      "heartbeat_at",
      "blocked_reason",
      "reconciled_at",
      "next_command",
    ]) {
      expect(convergence).toContain(`ADD COLUMN IF NOT EXISTS ${column}`);
    }
    expect(convergence).toContain("CREATE TABLE IF NOT EXISTS public.installation_operation_steps");
    expect(convergence).toContain(
      "CREATE TABLE IF NOT EXISTS public.installation_operation_outbox",
    );
    expect(convergence).toContain("installation_operation_outbox_disable_legacy");
    expect(convergence).toContain("installation_operations_reconcile_idx");
    expect(convergence).not.toContain(
      "CREATE TABLE IF NOT EXISTS public.installation_operation_effects",
    );
    expect(convergence).not.toContain(
      "CREATE TABLE IF NOT EXISTS public.installation_migration_ledger",
    );
    expect(masterBootstrap).toContain("installation_migration_reconciliation_evidence");
    expect(masterBootstrap).toContain("record_installation_migration_reconciliation_evidence");
    expect(masterBootstrap).toContain("read_installation_migration_reconciliation_evidence");
    expect(delta).not.toContain("installation_migration_reconciliation_evidence");
  });

  it("reprova o contrato quando a RPC de leitura legada está ausente", () => {
    expect(masterBootstrap).toContain(
      "CREATE OR REPLACE FUNCTION public.read_installation_migration_reconciliation_evidence",
    );
    expect(verifyMasterSql).toContain(
      "('read_installation_migration_reconciliation_evidence(uuid,text)')",
    );
  });

  it("mantém convergência isolada e preserva os grants mínimos da RPC legada", () => {
    const signature = "read_installation_migration_reconciliation_evidence(uuid,text)";
    expect(convergenceEntry.trim()).toBe(
      "\\set ON_ERROR_STOP on\n\\ir 001_control_plane_convergence_v1_4_3.sql",
    );
    expect(reconciliation).toMatch(
      /CREATE OR REPLACE FUNCTION public\.read_installation_migration_reconciliation_evidence\(_installation_id uuid,_package_hash text\)/,
    );
    expect(verifyMasterSql).toContain(`('${signature}')`);
    expect(reconciliation).toContain(
      `REVOKE ALL ON FUNCTION public.${signature} FROM PUBLIC,anon,authenticated;`,
    );
    expect(reconciliation).toContain(
      `GRANT EXECUTE ON FUNCTION public.${signature} TO service_role;`,
    );
  });

  it("reconciliação P0 valida inventário, lease/fencing e rejeita persistência parcial", () => {
    const reconcileSignature =
      "reconcile_installation_operation_migrations(uuid,text,bigint,jsonb)";
    expect(p0Hardening).toContain(
      "CREATE OR REPLACE FUNCTION public.reconcile_installation_operation_migrations",
    );
    expect(p0Hardening).toContain("AND fencing_token = _fencing_token");
    expect(p0Hardening).toContain("AND lease_expires_at > now()");
    expect(p0Hardening).toContain("IF _saved <> _expected THEN");
    expect(p0Hardening).toContain("Reconciliação parcial rejeitada");
    expect(p0Hardening).toContain(
      `REVOKE ALL ON FUNCTION public.${reconcileSignature} FROM PUBLIC, anon, authenticated;`,
    );
    expect(p0Hardening).toContain(
      `GRANT EXECUTE ON FUNCTION public.${reconcileSignature} TO service_role;`,
    );
  });

  it("normalização histórica não executa migrations e preserva attempt_count", () => {
    const normalizeSignature = "normalize_legacy_installation_operations(integer)";
    expect(p0Hardening).toContain(
      "CREATE OR REPLACE FUNCTION public.normalize_legacy_installation_operations",
    );
    expect(p0Hardening).toContain("'migrationsExecuted', 0");
    expect(p0Hardening).not.toMatch(/SET[\s\S]{0,160}attempt_count\s*=/i);
    expect(p0Hardening).toContain("SET status = 'manual_review'");
    expect(p0Hardening).toContain("SET status = 'orphaned'");
    expect(p0Hardening).toContain(
      `REVOKE ALL ON FUNCTION public.${normalizeSignature} FROM PUBLIC, anon, authenticated;`,
    );
    expect(verifyMasterSql).toContain(`('${normalizeSignature}')`);
  });

  it("promoção Master é executável, selada e bloqueada fora do fluxo explícito", async () => {
    const metadata = JSON.parse(
      readFileSync("supabase/master/bootstrap-control-plane.json", "utf8"),
    ) as {
      releaseVersion: string;
      controlPlaneMigrations: number;
      convergenceSha256: string;
      bootstrapSha256: string;
      reconciliationFile: string;
      reconciliationSha256: string;
      p0HardeningFile: string;
      p0HardeningSha256: string;
      globalFreezeFile: string;
      globalFreezeSha256: string;
      deterministicUpdateFile: string;
      deterministicUpdateSha256: string;
    };
    const promotion = readFileSync("supabase/master/tools/promote_master_control_plane.sh", "utf8");
    const packageJson = readFileSync("package.json", "utf8");

    expect(metadata.releaseVersion).toBe(MASTER_RELEASE_VERSION);
    expect(metadata.controlPlaneMigrations).toBe(34);
    expect(metadata.convergenceSha256).toBe(await sha256Hex(convergence));
    expect(metadata.bootstrapSha256).toBe(await sha256Hex(masterBootstrap));
    expect(metadata.reconciliationFile).toBe("20260917184500_legacy_migration_reconciliation.sql");
    expect(metadata.reconciliationSha256).toBe(await sha256Hex(reconciliation));
    expect(metadata.p0HardeningFile).toBe(
      "20260917190721_f04a7c59-5fbb-4ef3-aa75-044844da8fa3.sql",
    );
    expect(metadata.p0HardeningSha256).toBe(await sha256Hex(p0Hardening));
    const globalFreeze = readFileSync(
      "supabase/master/002_control_plane_global_freeze.sql",
      "utf8",
    );
    expect(metadata.globalFreezeFile).toBe("002_control_plane_global_freeze.sql");
    expect(metadata.globalFreezeSha256).toBe(await sha256Hex(globalFreeze));
    expect(masterBootstrap).toContain("-- MASTER GLOBAL FREEZE");
    const deterministicUpdate = readFileSync(
      "supabase/master/003_control_plane_deterministic_update.sql",
      "utf8",
    );
    expect(metadata.deterministicUpdateFile).toBe("003_control_plane_deterministic_update.sql");
    expect(metadata.deterministicUpdateSha256).toBe(await sha256Hex(deterministicUpdate));
    expect(masterBootstrap).toContain("-- MASTER DETERMINISTIC UPDATE");
    expect(delta).not.toContain("installation_operations_freeze");
    expect(promotion).toContain("UNITOS_MASTER_PROMOTION:-");
    expect(promotion).toContain("MASTER_DATABASE_URL:-");
    expect(promotion).toContain("--single-transaction");
    expect(promotion).toContain("verify-installation-master.sql");
    expect(promotion).toContain('build_master_bootstrap.py" --check');
    expect(packageJson).toContain("master:promote:convergence");
    expect(packageJson).toContain("master:promote:bootstrap");
    expect(packageJson).toContain("master:install:deterministic-update");
    expect(packageJson).not.toContain("master:diagnose:release");
  });
});
