import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import {
  applyStatementByStatement,
  HELPER_TABLES,
  hardenHelperTables,
  VECTOR_EXTENSION_POSTCONDITION,
  verifyVectorExtensionPostcondition,
} from "@/lib/installation/automation.server";
import {
  isDuplicateObjectError,
  prepareVerificationSql,
  sanitizeBaselineSqlForManagementApi,
  splitSqlStatements,
  stripPsqlMetaCommands,
  summarizeVerificationRows,
} from "@/lib/installation/baseline-sql";
import delta from "../supabase/baseline-snapshot/007_delta_migrations.sql?raw";
import manifestRaw from "../supabase/baseline-snapshot/tools/delta_manifest.txt?raw";
import destinationsRaw from "../supabase/baseline-snapshot/tools/migration-destinations.json?raw";

// Todas as migrations do repositório, para garantir que o delta não fique defasado.
const migrationFiles = import.meta.glob("../supabase/migrations/*.sql", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

import install010 from "../supabase/install/010_installation_identity.sql?raw";
import install011 from "../supabase/install/011_brain_stats_init.sql?raw";
import install020 from "../supabase/install/020_cron.sql?raw";
import verifySql from "../supabase/install/verify-installation-client.sql?raw";

describe("delta do baseline", () => {
  it("retomada não depende de fila órfã sem consumidor", () => {
    const recentMigrations = readdirSync(path.join(process.cwd(), "supabase/migrations"))
      .filter((file) => file.endsWith(".sql"))
      .sort()
      .slice(-3)
      .map((file) => readFileSync(path.join(process.cwd(), "supabase/migrations", file), "utf8"))
      .join("\n");
    expect(recentMigrations).not.toContain("INSERT INTO public.installation_operation_outbox");
  });
  const objetos = [
    "briefing_import_runs",
    "briefing_import_steps",
    "briefing_import_changes",
    "installation_meta_app",
    "briefing_import_claim_lease",
    "briefing_import_heartbeat",
    "briefing_import_reap",
    "installation_setup_state",
    "enforce_single_brand",
    "is_brand_integration_authority",
  ] as const;

  for (const nome of objetos) {
    it(`contém ${nome}`, () => {
      expect(delta.toLowerCase()).toContain(nome.toLowerCase());
    });
  }

  it("não contém meta-comandos psql", () => {
    expect(delta).not.toMatch(/^\\[a-z]/im);
  });

  /**
   * Regressão real: o delta ficou parado em 2026-09-03 enquanto o código já
   * usava `work_statuses`, `work_links`, `projects.status_id` e
   * `tasks.start_date`. A instalação nascia com schema antigo e as telas de
   * Projetos/Tarefas falhavam ao ler colunas inexistentes.
   */
  it("cobre TODAS as migrations posteriores ao corte do dump", () => {
    const manifest = new Set(
      manifestRaw
        .split("\n")
        .map((l) => l.trim().split(/\s+/)[0] ?? "")
        .filter(Boolean),
    );
    const all = Object.keys(migrationFiles)
      .map((p) => p.split("/").pop()!)
      .sort();
    // O dump 001 foi tirado DEPOIS do desparticionamento de brain_events
    // (20260829121019 e 20260829122439): o estado final das duas já está
    // congelado nele, e reaplicá-las derrubava a tabela com CASCADE.
    const start = "20260829192349_ff418028-7401-404c-92d9-be9b0e29e2bd.sql";
    const posteriores = all.filter((n) => n >= start);
    const destinations = JSON.parse(destinationsRaw) as {
      migrations: Array<{ file: string; destination: string }>;
    };
    const foraDoClient = new Set(
      destinations.migrations
        .filter(
          (entry) => entry.destination === "control-plane" || entry.destination === "excluded",
        )
        .map((entry) => entry.file),
    );
    const faltando = posteriores.filter((n) => !manifest.has(n) && !foraDoClient.has(n));
    expect(faltando).toEqual([]);
  });

  it("não repete tabelas já incorporadas ao snapshot", () => {
    const snapshot = readFileSync("supabase/baseline-snapshot/001_initial_schema.sql", "utf8");
    const tables = (sql: string, onlyUnguarded = false) =>
      new Set(
        [
          ...sql.matchAll(
            new RegExp(
              `CREATE\\s+TABLE\\s+${onlyUnguarded ? "" : "(?:IF\\s+NOT\\s+EXISTS\\s+)?"}public\\.([a-z0-9_]+)`,
              "gi",
            ),
          ),
        ]
          .map((match) => match[1]?.toLowerCase())
          .filter((name): name is string => Boolean(name)),
      );
    const initial = tables(snapshot);
    const overlap = [...tables(delta, true)].filter((table) => initial.has(table));
    expect(overlap).toEqual([]);
  });

  it("snapshot não concede privilégios diretos de tabela para anon", () => {
    const snapshot = readFileSync("supabase/baseline-snapshot/001_initial_schema.sql", "utf8");
    expect(snapshot).not.toMatch(/^\s*GRANT\s+.+\s+ON\s+TABLE\s+.+\s+TO\s+anon/im);
  });

  it("snapshot não concede privilégios futuros amplos para anon", () => {
    const snapshot = readFileSync("supabase/baseline-snapshot/001_initial_schema.sql", "utf8");
    expect(snapshot).not.toMatch(
      /^\s*ALTER\s+DEFAULT\s+PRIVILEGES\s+.+\s+GRANT\s+ALL\s+ON\s+(?:TABLES|SEQUENCES|FUNCTIONS)\s+TO\s+anon/im,
    );
  });

  it("validação bloqueia todas as capacidades administrativas de anon em tabelas", () => {
    expect(verifySql).toContain("segurança: anon sem privilégios perigosos em tabelas");
    for (const privilege of ["TRUNCATE", "TRIGGER", "REFERENCES", "MAINTAIN"] as const) {
      expect(verifySql).toContain(`'${privilege}'`);
    }
  });

  it("credencial de e-mail revoga acesso direto e endurece tabelas futuras", () => {
    const hardening =
      migrationFiles[
        "../supabase/migrations/20260923110105_11162a73-21e7-4751-aeff-cceae78fd5fa.sql"
      ];
    expect(hardening).toBeDefined();
    expect(hardening).toContain(
      "REVOKE ALL ON TABLE public.installation_email_credentials FROM PUBLIC, anon, authenticated",
    );
    expect(hardening).toContain("ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public");
    expect(verifySql).toContain("Resend: configuração protegida por instalação");
    for (const privilege of [
      "SELECT",
      "INSERT",
      "UPDATE",
      "DELETE",
      "TRUNCATE",
      "TRIGGER",
      "REFERENCES",
      "MAINTAIN",
    ] as const) {
      expect(verifySql).toContain(`'${privilege}'`);
    }
  });

  it("não envia estruturas ou RPCs Control-plane no pacote Client", () => {
    for (const marker of [
      "public.installations",
      "public.installation_operations",
      "public.installation_credentials",
      "public.installation_operation_steps",
      "public.installation_operation_outbox",
      "public.installation_operation_migrations",
      "start_durable_installation_operation",
      "claim_stale_installation_operations",
    ]) {
      expect(delta).not.toContain(marker);
    }
  });

  for (const objeto of [
    "work_statuses",
    "work_links",
    "work_comments",
    "project_participants",
  ] as const) {
    it(`delta cria ${objeto}`, () => {
      expect(delta).toContain(`public.${objeto}`);
    });
  }

  for (const coluna of ["projects.status_id", "tasks.start_date"] as const) {
    it(`delta adiciona ${coluna}`, () => {
      const [tabela, campo] = coluna.split(".");
      const bloco = delta.slice(delta.indexOf(`ALTER TABLE public.${tabela}\n`));
      expect(bloco).toContain(campo!);
    });
  }
});

describe("stripPsqlMetaCommands", () => {
  it("remove \\set, \\pset e \\timing mantendo o SQL", () => {
    const { sql, removed } = stripPsqlMetaCommands(
      ["\\pset pager off", "\\timing off", "SELECT 1;"].join("\n"),
    );
    expect(sql.trim()).toBe("SELECT 1;");
    expect(removed).toHaveLength(2);
  });

  for (const [nome, script] of [
    ["010_installation_identity", install010],
    ["011_brain_stats_init", install011],
    ["020_cron", install020],
  ] as const) {
    it(`${nome} fica sem meta-comando após saneamento`, () => {
      expect(stripPsqlMetaCommands(script).sql).not.toMatch(/^\\[a-z]/im);
    });
  }
});

describe("prepareVerificationSql", () => {
  it("remove o statement de RESUMO que contém a palavra FAIL", () => {
    const { sql } = prepareVerificationSql(verifySql);
    expect(sql).not.toMatch(/SELECT\s+'RESUMO'/i);
    expect(sql).not.toMatch(/^\\[a-z]/im);
    expect(sql.trimEnd().endsWith("ORDER BY ord;")).toBe(true);
  });
});

describe("summarizeVerificationRows", () => {
  it("PASS quando nenhuma linha tem status FAIL", () => {
    const s = summarizeVerificationRows([
      { status: "PASS", check_name: "extensões", observed: "6" },
      { status: "INFO", check_name: "sem dados de negócio (FAIL no texto)", observed: "0" },
    ]);
    expect(s.ok).toBe(true);
    expect(s.failed).toBe(0);
    expect(s.total).toBe(2);
  });

  it("FAIL somente pela coluna status", () => {
    const s = summarizeVerificationRows([
      { status: "PASS", check_name: "a", observed: "1" },
      { status: "FAIL", check_name: "cron: total de jobs", observed: "0" },
    ]);
    expect(s.ok).toBe(false);
    expect(s.failedChecks).toEqual(["cron: total de jobs (observado: 0)"]);
  });

  it("resultado sem linhas é inconclusivo, nunca PASS", () => {
    const s = summarizeVerificationRows([]);
    expect(s.ok).toBe(false);
    expect(s.reason).toMatch(/nenhuma verificação/);
  });
});

describe("reexecução idempotente do baseline", () => {
  const checkpointRows = (sql: string, total: number, index = 0) =>
    sql.includes("select statement_index")
      ? [{ statement_index: index, total_statements: total, status: "running" }]
      : [];

  it("divide statements preservando corpos dollar-quoted", () => {
    const stmts = splitSqlStatements(
      [
        "CREATE TYPE public.alert_severity AS ENUM ('low','high');",
        "CREATE FUNCTION f() RETURNS void AS $$ BEGIN PERFORM 1; END; $$ LANGUAGE plpgsql;",
        "SELECT 'a;b';",
      ].join("\n"),
    );
    expect(stmts).toHaveLength(3);
    expect(stmts[1]).toContain("PERFORM 1;");
    expect(stmts[2]).toBe("SELECT 'a;b';");
  });

  it("reconhece erros da classe 'já existe'", () => {
    expect(isDuplicateObjectError('ERROR: 42710: type "alert_severity" already exists')).toBe(true);
    expect(isDuplicateObjectError('ERROR: 42P07: relation "brands" already exists')).toBe(true);
    expect(
      isDuplicateObjectError(
        'ERROR: 42P16: multiple primary keys for table "activity_events" are not allowed',
      ),
    ).toBe(true);
    expect(isDuplicateObjectError("ERROR: 42P16: cannot change name of input parameter")).toBe(
      false,
    );
    expect(isDuplicateObjectError("ERROR: 42501: permission denied")).toBe(false);
    expect(
      isDuplicateObjectError("ERROR: 23505: duplicate key value violates unique constraint"),
    ).toBe(false);
    expect(isDuplicateObjectError(null)).toBe(false);
  });

  it("reaplica ignorando duplicados e aborta em erro real", async () => {
    const ok = await applyStatementByStatement(
      {
        query: async (statement) => ({ ok: true, rows: checkpointRows(statement, 2) }),
      },
      "CREATE TYPE t AS ENUM ('a');\nCREATE TABLE x (id int);",
    );
    expect(ok).toMatchObject({ ok: true, skipped: 0, complete: true });

    const bad = await applyStatementByStatement(
      { query: async () => ({ ok: false, rows: [], error: "42501: permission denied" }) },
      "CREATE TABLE x (id int);",
    );
    expect(bad.ok).toBe(false);
  });

  it("só conclui o checkpoint após a pós-condição do pgvector na mesma transação", async () => {
    const batches: string[] = [];
    const result = await applyStatementByStatement(
      {
        query: async (batch) => {
          batches.push(batch);
          return { ok: true, rows: checkpointRows(batch, 1) };
        },
      },
      "SELECT 1;",
      { completionPostcondition: VECTOR_EXTENSION_POSTCONDITION },
    );

    expect(result).toMatchObject({ ok: true, complete: true });
    const completion = batches.find((batch) => batch.includes("DO $unitos_drain$"));
    expect(completion).toContain("FROM pg_extension e");
    expect(completion).toContain("e.extname = 'vector'");
    expect(completion).toContain("to_regtype('public.vector') IS NOT NULL");
    expect(completion).toContain("oc.opcname = 'vector_cosine_ops'");
    expect(completion?.indexOf("IF NOT (")).toBeLessThan(completion?.indexOf("'completed'") ?? -1);
  });

  it("não conclui quando a pós-condição do pgvector falha", async () => {
    const result = await applyStatementByStatement(
      {
        query: async (batch) => {
          if (batch.includes("DO $unitos_drain$")) {
            return {
              ok: false,
              rows: [],
              error: VECTOR_EXTENSION_POSTCONDITION.errorMessage,
            };
          }
          return { ok: true, rows: checkpointRows(batch, 1) };
        },
      },
      "SELECT 1;",
      { completionPostcondition: VECTOR_EXTENSION_POSTCONDITION },
    );

    expect(result).toEqual({
      ok: false,
      error: VECTOR_EXTENSION_POSTCONDITION.errorMessage,
      processed: 1,
    });
  });

  it("propaga 42710 interno de bloco DO e não avança seu checkpoint", async () => {
    const batches: string[] = [];
    const result = await applyStatementByStatement(
      {
        query: async (batch) => {
          batches.push(batch);
          if (batch.includes("DO $unitos_vector_schema$")) {
            return {
              ok: false,
              rows: [],
              error: '42710: extension "vector" already exists',
            };
          }
          return { ok: true, rows: checkpointRows(batch, 1) };
        },
      },
      "DO $unitos_vector_schema$ BEGIN RAISE EXCEPTION USING ERRCODE = '42710'; END $unitos_vector_schema$;",
      { completionPostcondition: VECTOR_EXTENSION_POSTCONDITION },
    );

    expect(result).toEqual({
      ok: false,
      error: '42710: extension "vector" already exists',
      processed: 0,
    });
    const execution = batches.find((batch) => batch.includes("DO $unitos_vector_schema$"));
    expect(execution).not.toContain("DO $unitos_guard$");
    expect(execution).not.toContain("WHEN SQLSTATE '42710'");
    expect(batches.some((batch) => batch.includes("DO $unitos_drain$"))).toBe(false);
  });

  it("comprova public.vector e public.vector_cosine_ops sem aceitar resposta vazia", async () => {
    await expect(
      verifyVectorExtensionPostcondition({
        query: async () => ({ ok: true, rows: [{ vector_ready: true }] }),
      }),
    ).resolves.toEqual({ ok: true });
    await expect(
      verifyVectorExtensionPostcondition({ query: async () => ({ ok: true, rows: [] }) }),
    ).resolves.toEqual({ ok: false, error: VECTOR_EXTENSION_POSTCONDITION.errorMessage });
    await expect(
      verifyVectorExtensionPostcondition({
        query: async () => ({ ok: false, rows: [], error: "consulta indisponível" }),
      }),
    ).resolves.toEqual({ ok: false, error: "consulta indisponível" });
  });

  it("exige pg_extension.vector além do tipo e da operator class", () => {
    expect(VECTOR_EXTENSION_POSTCONDITION.predicateSql).toContain("FROM pg_extension e");
    expect(VECTOR_EXTENSION_POSTCONDITION.predicateSql).toContain("e.extname = 'vector'");
    expect(VECTOR_EXTENSION_POSTCONDITION.predicateSql).toContain("n.nspname = 'public'");
  });

  it.each([
    ["A: vector inexistente", false, false, false, false],
    ["B: vector ainda em extensions", true, false, false, false],
    ["C: vector canônico em public", true, true, true, true],
  ])(
    "%s só satisfaz a pós-condição quando extensão, tipo e operator class estão em public",
    (_state, extensionInPublic, publicType, publicOpclass, expected) => {
      const vectorReady = extensionInPublic && publicType && publicOpclass;
      expect(vectorReady).toBe(expected);
      if (!vectorReady) {
        expect(VECTOR_EXTENSION_POSTCONDITION.errorMessage).toContain("pg_extension.vector");
      }
    },
  );

  it("comprova a ausência da assinatura explícita antes de tolerar o DROP da migration 96", async () => {
    const batches: string[] = [];
    const result = await applyStatementByStatement(
      {
        query: async (batch) => {
          batches.push(batch);
          return { ok: true, rows: checkpointRows(batch, 1) };
        },
      },
      "DROP FUNCTION public.heartbeat_installation_operation(uuid, text, integer);",
    );

    expect(result).toMatchObject({ ok: true, processed: 1, total: 1, complete: true });
    const execution = batches.find((batch) => batch.includes("DO $unitos_guard$"));
    expect(execution).toContain(
      "IF to_regprocedure('public.heartbeat_installation_operation(uuid, text, integer)') IS NOT NULL THEN",
    );
    expect(execution).toContain(
      "DROP FUNCTION public.heartbeat_installation_operation(uuid, text, integer);",
    );
  });

  it("divide adaptativamente o lote em vez de enviar milhares de statements um a um", async () => {
    let calls = 0;
    const progress: number[] = [];
    const sql = Array.from({ length: 256 }, (_, index) => `SELECT ${index};`).join("\n");
    const result = await applyStatementByStatement(
      {
        query: async (batch) => {
          if (!batch.includes("DO $unitos_guard$")) {
            // chamadas auxiliares: preparação da tabela de adiados e drenagem final
            return { ok: true, rows: checkpointRows(batch, 256) };
          }
          calls += 1;
          expect(batch).toContain("WHEN SQLSTATE '42710'");
          expect(batch).toContain("WHEN SQLSTATE '42P16'");
          expect(batch).toContain("multiple primary key");
          return { ok: true, rows: checkpointRows(batch, 256) };
        },
      },
      sql,
      { onProgress: (processed) => void progress.push(processed), maxStatements: 256 },
    );
    expect(result).toEqual({
      ok: true,
      skipped: 0,
      processed: 256,
      total: 256,
      complete: true,
    });
    expect(calls).toBe(11);
    expect(progress.at(-1)).toBe(256);
  });

  it("interrompe a retomada quando a operação foi cancelada", async () => {
    const result = await applyStatementByStatement(
      { query: async (statement) => ({ ok: true, rows: checkpointRows(statement, 2) }) },
      "SELECT 1; SELECT 2;",
      { isCancelled: async () => true },
    );
    expect(result).toMatchObject({ ok: false, error: "Operação cancelada pelo Super Admin." });
  });

  it("adota o checkpoint legado sem reiniciar os comandos já processados", async () => {
    const batches: string[] = [];
    const result = await applyStatementByStatement(
      {
        query: async (batch) => {
          batches.push(batch);
          return {
            ok: true,
            rows: batch.includes("select statement_index")
              ? [{ statement_index: 3, total_statements: 3, status: "running" }]
              : [],
          };
        },
      },
      "SELECT 1; SELECT 2; SELECT 3;",
      { startIndex: 3 },
    );

    expect(result).toMatchObject({ ok: true, processed: 3, total: 3, complete: true });
    expect(batches.some((batch) => batch.includes("_unitos_migration_checkpoints"))).toBe(true);
    expect(batches.some((batch) => batch.includes("DO $unitos_guard$"))).toBe(false);
  });

  it("reavalia dependências após cada lote e preserva o diagnóstico SQL real", async () => {
    const batches: string[] = [];
    const result = await applyStatementByStatement(
      {
        query: async (batch) => {
          batches.push(batch);
          return {
            ok: true,
            rows: batch.includes("select statement_index")
              ? [{ statement_index: 0, total_statements: 3, status: "running" }]
              : [],
          };
        },
      },
      [
        "ALTER TABLE public.installation_operations ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;",
        "DROP INDEX IF EXISTS public.installation_operations_resume_idx;",
        "CREATE INDEX IF NOT EXISTS installation_operations_resume_idx ON public.installation_operations (next_attempt_at, lease_expires_at, created_at) WHERE status IN ('pending', 'running', 'retryable');",
      ].join("\n"),
    );

    expect(result).toMatchObject({ ok: true, processed: 3, total: 3, complete: true });
    expect(batches.some((batch) => batch.includes("DO $unitos_retry_deferred$"))).toBe(true);
    expect(batches.some((batch) => batch.includes("GET STACKED DIAGNOSTICS"))).toBe(true);
    expect(batches.some((batch) => batch.includes("coalesce(sqlstate, 'unknown')"))).toBe(true);
  });

  it("não prepara estruturas Control-plane antes de aplicar migrations Client", () => {
    const source = readFileSync("src/lib/installation/automation.server.ts", "utf8");
    const applyDelta = source.slice(source.indexOf("export async function applyDatabaseDelta"));
    expect(source).not.toContain("INSTALLATION_OPERATIONS_INCREMENTAL_PREREQUISITES_SQL");
    expect(applyDelta).not.toMatch(/alter table public\.installation_operations/i);
    expect(applyDelta).not.toMatch(/create table public\.installation_operation_/i);
  });

  it("prepara somente a estrutura do ledger sem inventar evidências", () => {
    const source = readFileSync("src/lib/installation/automation.server.ts", "utf8");
    expect(source).toContain("if (migrations.length > 0)");
    expect(source).toContain("backfill sem evidência verificável foi bloqueado");
    expect(source).not.toContain("const written = await management.query(");
  });
});

describe("tabelas auxiliares da automação e RLS", () => {
  it("cria a fila de statements adiados já com RLS e sem grants", async () => {
    const batches: string[] = [];
    await applyStatementByStatement(
      {
        query: async (batch) => {
          batches.push(batch);
          return {
            ok: true,
            rows: batch.includes("select statement_index")
              ? [{ statement_index: 0, total_statements: 1, status: "running" }]
              : [],
          };
        },
      },
      "SELECT 1;",
    );
    const prep = batches.find((b) =>
      b.includes("create table if not exists public._unitos_deferred_sql"),
    );
    expect(prep).toBeTruthy();
    expect(prep).toContain("enable row level security");
    expect(prep).toContain("revoke all on public._unitos_deferred_sql from anon, authenticated");
    expect(prep).toContain("add column if not exists sqlstate text");
    expect(prep).toContain("add column if not exists error_message text");
  });

  it("hardenHelperTables recria a fila ausente com o contrato canônico", async () => {
    const seen: string[] = [];
    const management = {
      query: async (sql: string) => {
        seen.push(sql);
        return { ok: true, rows: [] };
      },
    };
    expect(await hardenHelperTables(management)).toEqual({ ok: true });
    expect(seen[0]).toContain(
      "create table if not exists public._unitos_deferred_sql (id bigserial primary key, stmt text not null, run_key text not null default 'legacy')",
    );
  });

  it("separa cada DDL antes do ALTER para evitar SQLSTATE 42601", async () => {
    const management = {
      query: async (sql: string) => {
        const ddlWithoutTerminator = /\)\s*\nalter table/i.test(sql);
        return ddlWithoutTerminator
          ? { ok: false, rows: [], error: '42601: syntax error at or near "alter"' }
          : { ok: true, rows: [] };
      },
    };

    await expect(hardenHelperTables(management)).resolves.toEqual({ ok: true });
  });

  it("hardenHelperTables atualiza fila legada sem run_key", async () => {
    const seen: string[] = [];
    await hardenHelperTables({
      query: async (sql) => {
        seen.push(sql);
        return { ok: true, rows: [] };
      },
    });
    expect(seen[0]).toContain(
      "alter table public._unitos_deferred_sql add column if not exists run_key text not null default 'legacy'",
    );
    expect(seen[0]).toContain("add column if not exists sqlstate text");
    expect(seen[0]).toContain("add column if not exists error_message text");
    expect(seen[0]).toContain(
      "create index if not exists _unitos_deferred_sql_run_key_idx on public._unitos_deferred_sql (run_key, id)",
    );
  });

  it("hardenHelperTables preserva a fila vazia e aplica as proteções", async () => {
    const seen: string[] = [];
    await hardenHelperTables({
      query: async (sql) => {
        seen.push(sql);
        return { ok: true, rows: [] };
      },
    });
    expect(seen[0]).not.toMatch(/drop table/i);
    expect(seen[0]).toContain("enable row level security");
    expect(seen[0]).toContain("revoke all on %s from anon, authenticated");
    for (const table of HELPER_TABLES) expect(seen[0]).toContain(table);
  });

  it("hardenHelperTables é idempotente", async () => {
    const seen: string[] = [];
    const management = {
      query: async (sql: string) => {
        seen.push(sql);
        return { ok: true, rows: [] };
      },
    };
    expect(await hardenHelperTables(management)).toEqual({ ok: true });
    expect(await hardenHelperTables(management)).toEqual({ ok: true });
    expect(seen).toHaveLength(2);
    expect(seen[0]).toBe(seen[1]);
  });

  it("reprova a verificação 15 mostrando os nomes das tabelas sem RLS", () => {
    const summary = summarizeVerificationRows([
      {
        status: "FAIL",
        check_name: "RLS habilitado em todas as tabelas de public",
        observed: "_unitos_applied_deltas",
      },
      { status: "PASS", check_name: "trigger on_auth_user_created em auth.users", observed: "1" },
    ]);
    expect(summary.ok).toBe(false);
    expect(summary.reason).toContain("RLS habilitado em todas as tabelas de public");
    expect(summary.reason).toContain("_unitos_applied_deltas");
  });
});
