import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  applyStatementByStatement,
  createManagementClient,
  type ManagementClient,
} from "@/lib/installation/automation.server";
import { versionForCompletedOperation } from "@/lib/installation/runner.server";

const TARGET_REF = "pzkcchtmcqkuhhlsbwxf";
const TARGET_NAME = "unitos-new-teste-02";
const FORBIDDEN_REFS = new Set(["tkjbhttylouamqxnbfgv"]);
const RUN_KEY = "stage10:p0-real:20260915";
const TEST_TABLE = "public._unitos_it_stage10_p0";
const TEST_FUNCTION = "public._unitos_it_stage10_missing(uuid, text, integer)";
const LEDGER_LABEL = "stage10:p0-real:release-1.3.96";

const cleanupSql = [
  `drop table if exists ${TEST_TABLE};`,
  "DO $cleanup$",
  "BEGIN",
  "  IF to_regclass('public._unitos_migration_checkpoints') IS NOT NULL THEN",
  `    delete from public._unitos_migration_checkpoints where run_key like '${RUN_KEY}%';`,
  "  END IF;",
  "  IF to_regclass('public._unitos_deferred_sql') IS NOT NULL THEN",
  `    delete from public._unitos_deferred_sql where run_key like '${RUN_KEY}%';`,
  "  END IF;",
  "END",
  "$cleanup$;",
  `delete from public._unitos_applied_deltas where label = '${LEDGER_LABEL}';`,
].join("\n");

const enabled =
  process.env["UNITOS_TEST_ENV"] === "INTEGRATION_TEST_SUITE" &&
  process.env["UNITOS_REAL_TEST_PROJECT_REF"] === TARGET_REF &&
  process.env["UNITOS_INTEGRATION_TEST_PROJECT_REF"] === TARGET_REF &&
  process.env["SUPABASE_PROJECT_ID"] === TARGET_REF &&
  process.env["SUPABASE_URL"] === `https://${TARGET_REF}.supabase.co`;
const suite = enabled ? describe.sequential : describe.skip;

function rowValue(rows: unknown[], key: string): unknown {
  const row = rows.find(
    (item): item is Record<string, unknown> => !!item && typeof item === "object",
  );
  return row?.[key];
}

suite("P0 real — executor canônico no Supabase testes", () => {
  let management: ManagementClient;

  const query = async (sql: string) => {
    const result = await management.query(sql);
    if (!result.ok) throw new Error(result.error ?? "consulta real falhou");
    return result.rows;
  };

  beforeAll(async () => {
    const token = process.env["UNITOS_SUPABASE_MANAGEMENT_TOKEN"]?.trim();
    const requestedRef = process.env["UNITOS_REAL_TEST_PROJECT_REF"]?.trim();
    const integrationRef = process.env["UNITOS_INTEGRATION_TEST_PROJECT_REF"]?.trim();
    const supabaseProjectRef = process.env["SUPABASE_PROJECT_ID"]?.trim();
    const supabaseUrl = process.env["SUPABASE_URL"]?.trim();
    if (!token) throw new Error("UNITOS_SUPABASE_MANAGEMENT_TOKEN ausente");
    if (requestedRef !== TARGET_REF || FORBIDDEN_REFS.has(requestedRef)) {
      throw new Error(`ref não autorizado para ensaio real: ${requestedRef || "ausente"}`);
    }
    if (
      integrationRef !== TARGET_REF ||
      supabaseProjectRef !== TARGET_REF ||
      supabaseUrl !== `https://${TARGET_REF}.supabase.co`
    ) {
      throw new Error("configuração divergente do projeto descartável P0 autorizado");
    }

    const metadata = await fetch(`https://api.supabase.com/v1/projects/${requestedRef}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!metadata.ok) throw new Error(`projeto de teste inacessível: HTTP ${metadata.status}`);
    const project = (await metadata.json()) as { ref?: string; name?: string; status?: string };
    if (project.ref !== TARGET_REF || project.name !== TARGET_NAME) {
      throw new Error(`identidade inesperada do projeto: ${project.ref ?? "sem ref"}`);
    }

    management = createManagementClient({ token, projectRef: TARGET_REF });
    const prerequisites = await query(
      "select to_regclass('public._unitos_applied_deltas') is not null as has_ledger",
    );
    if (rowValue(prerequisites, "has_ledger") !== true) {
      throw new Error(
        "ledger canônico ausente no projeto testes; ensaio interrompido sem criar estrutura paralela",
      );
    }

    await query(cleanupSql);
  }, 30_000);

  afterAll(async () => {
    if (!management) return;
    await query(cleanupSql);
    const rows = await query(
      [
        `select to_regclass('${TEST_TABLE}') is null as table_removed,`,
        `(select count(*) from public._unitos_migration_checkpoints where run_key like '${RUN_KEY}%') = 0 as checkpoints_removed,`,
        `(select count(*) from public._unitos_deferred_sql where run_key like '${RUN_KEY}%') = 0 as deferred_removed,`,
        `(select count(*) from public._unitos_applied_deltas where label = '${LEDGER_LABEL}') = 0 as ledger_removed`,
      ].join("\n"),
    );
    expect(rowValue(rows, "table_removed")).toBe(true);
    expect(rowValue(rows, "checkpoints_removed")).toBe(true);
    expect(rowValue(rows, "deferred_removed")).toBe(true);
    expect(rowValue(rows, "ledger_removed")).toBe(true);
  }, 30_000);

  it("clean install registra evidência somente depois da pós-condição", async () => {
    const sql = [
      `create table ${TEST_TABLE} (id integer primary key, value text not null)`,
      `insert into ${TEST_TABLE} (id, value) values (1, 'clean')`,
    ].join(";\n");
    const result = await applyStatementByStatement(management, sql, {
      runKey: `${RUN_KEY}:clean`,
      maxStatements: 25,
    });
    expect(result).toMatchObject({ ok: true, complete: true, processed: 2, total: 2 });

    const verified = await query(
      `select count(*)::int as count from ${TEST_TABLE} where id = 1 and value = 'clean'`,
    );
    expect(rowValue(verified, "count")).toBe(1);
    await query(
      `insert into public._unitos_applied_deltas (label, kind, file, fingerprint) values ('${LEDGER_LABEL}', 'migration', 'stage10-clean.sql', 'stage10-sha')`,
    );
    const evidence = await query(
      `select count(*)::int as count from public._unitos_applied_deltas where label = '${LEDGER_LABEL}' and kind = 'migration' and file = 'stage10-clean.sql' and fingerprint = 'stage10-sha'`,
    );
    expect(rowValue(evidence, "count")).toBe(1);
  }, 30_000);

  it("falha parcial retoma do checkpoint sem repetir statements concluídos", async () => {
    const sql = [
      `insert into ${TEST_TABLE} (id, value) values (2, 'partial-1')`,
      `insert into ${TEST_TABLE} (id, value) values (3, 'partial-2')`,
      `insert into ${TEST_TABLE} (id, value) values (4, 'partial-3')`,
    ].join(";\n");
    const partial = await applyStatementByStatement(management, sql, {
      runKey: `${RUN_KEY}:resume`,
      maxStatements: 1,
    });
    expect(partial).toMatchObject({ ok: true, complete: false, processed: 1, total: 3 });
    const resumed = await applyStatementByStatement(management, sql, {
      runKey: `${RUN_KEY}:resume`,
      startIndex: 0,
      maxStatements: 25,
    });
    expect(resumed).toMatchObject({ ok: true, complete: true, processed: 3, total: 3 });
    const rows = await query(
      `select count(*)::int as count from ${TEST_TABLE} where id between 2 and 4`,
    );
    expect(rowValue(rows, "count")).toBe(3);
  }, 30_000);

  it("replay da mesma release pula o pacote já concluído", async () => {
    const replay = await applyStatementByStatement(
      management,
      `insert into ${TEST_TABLE} (id, value) values (2, 'duplicado')`,
      { runKey: `${RUN_KEY}:resume`, startIndex: 0, maxStatements: 25 },
    );
    expect(replay).toMatchObject({ ok: false });

    const canonicalReplay = await applyStatementByStatement(
      management,
      [
        `insert into ${TEST_TABLE} (id, value) values (2, 'partial-1')`,
        `insert into ${TEST_TABLE} (id, value) values (3, 'partial-2')`,
        `insert into ${TEST_TABLE} (id, value) values (4, 'partial-3')`,
      ].join(";\n"),
      { runKey: `${RUN_KEY}:resume`, startIndex: 0, maxStatements: 25 },
    );
    expect(canonicalReplay).toMatchObject({ ok: true, complete: true, processed: 3, total: 3 });
    const rows = await query(
      `select count(*)::int as count from ${TEST_TABLE} where id between 2 and 4`,
    );
    expect(rowValue(rows, "count")).toBe(3);
  }, 30_000);

  it("DROP FUNCTION inexistente conclui e versão só promove após validação completa", async () => {
    const absent = await query(`select to_regprocedure('${TEST_FUNCTION}') is null as absent`);
    expect(rowValue(absent, "absent")).toBe(true);
    const result = await applyStatementByStatement(management, `drop function ${TEST_FUNCTION};`, {
      runKey: `${RUN_KEY}:drop-missing`,
      maxStatements: 25,
    });
    expect(result).toMatchObject({ ok: true, complete: true, processed: 1, total: 1 });
    expect(
      versionForCompletedOperation({ kind: "update", acceptedSuccess: false, version: "1.3.96" }),
    ).toBeNull();
    expect(
      versionForCompletedOperation({ kind: "update", acceptedSuccess: true, version: "1.3.96" }),
    ).toBe("1.3.96");
  }, 30_000);
});
