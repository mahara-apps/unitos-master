import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import {
  applyStatementByStatement,
  HELPER_TABLES,
  hardenHelperTables,
} from "@/lib/installation/automation.server";
import {
  isDuplicateObjectError,
  prepareVerificationSql,
  splitSqlStatements,
  stripPsqlMetaCommands,
  summarizeVerificationRows,
} from "@/lib/installation/baseline-sql";
import delta from "../supabase/baseline-snapshot/007_delta_migrations.sql?raw";
import manifestRaw from "../supabase/baseline-snapshot/tools/delta_manifest.txt?raw";

// Todas as migrations do repositório, para garantir que o delta não fique defasado.
const migrationFiles = import.meta.glob("../supabase/migrations/*.sql", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

import install010 from "../supabase/install/010_installation_identity.sql?raw";
import install011 from "../supabase/install/011_brain_stats_init.sql?raw";
import install020 from "../supabase/install/020_cron.sql?raw";
import verifySql from "../supabase/install/verify-installation.sql?raw";

describe("delta do baseline", () => {
  it("retomada não depende de fila órfã sem consumidor", () => {
    const recentMigrations = fs
      .readdirSync(path.join(process.cwd(), "supabase/migrations"))
      .filter((file) => file.endsWith(".sql"))
      .sort()
      .slice(-3)
      .map((file) => fs.readFileSync(path.join(process.cwd(), "supabase/migrations", file), "utf8"))
      .join("\n");
    expect(recentMigrations).not.toContain("INSERT INTO public.installation_operation_outbox");
  });
  const objetos = [
    "briefing_import_runs",
    "briefing_import_steps",
    "briefing_import_changes",
    "installation_meta_app",
    "installation_operations",
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
        .map((l) => l.trim())
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
    // Migrations exclusivas do MASTER (cron apontando para a URL do MASTER)
    // ficam de fora de propósito: a instalação recebe cron próprio em 020_cron.
    const masterOnly = posteriores.filter((n) =>
      (migrationFiles[
        Object.keys(migrationFiles).find((p) => p.endsWith(n))!
      ] as string).includes("project--3f33732a-cb8b-43ae-84fb-01d9e367fb0c"),
    );
    const faltando = posteriores.filter((n) => !manifest.has(n) && !masterOnly.includes(n));
    expect(faltando).toEqual([]);
  });

  it("não repete tabelas já incorporadas ao snapshot", () => {
    const snapshot = readFileSync("supabase/baseline-snapshot/001_initial_schema.sql", "utf8");
    const tables = (sql: string, onlyUnguarded = false) =>
      new Set(
        [...sql.matchAll(new RegExp(`CREATE\\s+TABLE\\s+${onlyUnguarded ? "" : "(?:IF\\s+NOT\\s+EXISTS\\s+)?"}public\\.([a-z0-9_]+)`, "gi"))]
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

describe("cron de retomada do gerenciador", () => {
  it("é coberto pela validação read-only", () => {
    expect(verifySql).toContain("cron: retomada do gerenciador usa a URL registrada");
    expect(verifySql).toContain("installation-provision-resume");
    expect(verifySql).toContain("/api/public/cron/installation-resume");
  });
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
    expect(isDuplicateObjectError("ERROR: 42P07: relation \"brands\" already exists")).toBe(true);
    expect(isDuplicateObjectError('ERROR: 42P16: multiple primary keys for table "activity_events" are not allowed')).toBe(true);
    expect(isDuplicateObjectError("ERROR: 42P16: cannot change name of input parameter")).toBe(false);
    expect(isDuplicateObjectError("ERROR: 42501: permission denied")).toBe(false);
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

  it("prepara as colunas de lease antes de aplicar migrations incrementais", async () => {
    const source = readFileSync("src/lib/installation/automation.server.ts", "utf8");
    const prerequisite = source.indexOf(
      "management.query(INSTALLATION_OPERATIONS_INCREMENTAL_PREREQUISITES_SQL)",
    );
    const ledger = source.indexOf("const ledger = await management.query(");

    expect(source).toContain(
      '"alter table public.installation_operations add column if not exists lease_expires_at timestamptz"',
    );
    expect(source).toContain(
      '"alter table public.installation_operations add column if not exists lease_owner text"',
    );
    expect(prerequisite).toBeGreaterThan(-1);
    expect(ledger).toBeGreaterThan(prerequisite);
  });

  it("não envia consulta vazia ao preparar o ledger sem seeds", () => {
    const source = readFileSync("src/lib/installation/automation.server.ts", "utf8");
    const emptyGuard = source.indexOf("if (migrations.length === 0) return { ok: true }");
    const ledgerInsert = source.indexOf("const written = await management.query(", emptyGuard);

    expect(emptyGuard).toBeGreaterThan(-1);
    expect(ledgerInsert).toBeGreaterThan(emptyGuard);
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
    const prep = batches.find((b) => b.includes("create table if not exists public._unitos_deferred_sql"));
    expect(prep).toBeTruthy();
    expect(prep).toContain("enable row level security");
    expect(prep).toContain("revoke all on public._unitos_deferred_sql from anon, authenticated");
    expect(prep).toContain("add column if not exists sqlstate text");
    expect(prep).toContain("add column if not exists error_message text");
  });

  it("hardenHelperTables é idempotente e cobre todas as tabelas auxiliares", async () => {
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
    for (const table of HELPER_TABLES) expect(seen[0]).toContain(table);
    expect(seen[0]).toContain("enable row level security");
    expect(seen[0]).toContain("DROP TABLE IF EXISTS public._unitos_deferred_sql");
  });

  it("reprova a verificação 15 mostrando os nomes das tabelas sem RLS", () => {
    const summary = summarizeVerificationRows([
      { status: "FAIL", check_name: "RLS habilitado em todas as tabelas de public", observed: "_unitos_applied_deltas" },
      { status: "PASS", check_name: "trigger on_auth_user_created em auth.users", observed: "1" },
    ]);
    expect(summary.ok).toBe(false);
    expect(summary.reason).toContain("RLS habilitado em todas as tabelas de public");
    expect(summary.reason).toContain("_unitos_applied_deltas");
  });
});
