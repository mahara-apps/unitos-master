/**
 * Provisionamento AUTOMATIZADO — execução (server-only).
 *
 * O MASTER usa SOMENTE credenciais de gestão do próprio ambiente
 * (`UNITOS_SUPABASE_MANAGEMENT_TOKEN`, `UNITOS_VERCEL_TOKEN`) para:
 *   1. inspecionar o Supabase de destino e ler as chaves DELE;
 *   2. aplicar o MESMO baseline dos scripts de `supabase/install/`;
 *   3. gerar secrets exclusivos da instalação;
 *   4. gravar as variáveis no projeto de deploy;
 *   5. resolver a URL operacional (domínio definitivo ou URL temporária);
 *   6. agendar cron, inicializar Brain e rodar a verificação final.
 *
 * Regras duras:
 *   - o operador não precisa exportar nada nem rodar Git Bash;
 *   - nenhum secret do MASTER é reutilizado ou enviado ao destino;
 *   - nenhuma etapa pode apontar para o Supabase/domínio do MASTER;
 *   - dependência externa indisponível => BLOCKED com motivo explícito;
 *   - todo texto persistido passa por `sanitize()` (redaction de segredos).
 */

import baseline000 from "../../../supabase/baseline-snapshot/000_extensions.sql?raw";
import baseline001 from "../../../supabase/baseline-snapshot/001_initial_schema.sql?raw";
import baseline005 from "../../../supabase/baseline-snapshot/005_auth_trigger.sql?raw";
import baseline007 from "../../../supabase/baseline-snapshot/007_delta_migrations.sql?raw";
import deltaManifest from "../../../supabase/baseline-snapshot/tools/delta_manifest.txt?raw";
import deltaVersion from "../../../supabase/baseline-snapshot/tools/delta_version.txt?raw";
import baseline003 from "../../../supabase/baseline-snapshot/003_storage_buckets.sql?raw";
import baseline006 from "../../../supabase/baseline-snapshot/006_storage_policies.sql?raw";
import baseline004 from "../../../supabase/baseline-snapshot/004_seeds.sql?raw";
import install010 from "../../../supabase/install/010_installation_identity.sql?raw";
import install011 from "../../../supabase/install/011_brain_stats_init.sql?raw";
import install020 from "../../../supabase/install/020_cron.sql?raw";
import verifySql from "../../../supabase/install/verify-installation.sql?raw";

import { runtimeEnv } from "@/lib/runtime-env.server";
import { formatDateTimeBr } from "@/lib/timezone";

import {
  explicitDropFunctionSignature,
  prepareVerificationSql,
  sanitizeBaselineSqlForManagementApi,
  splitSqlStatements,
  stripPsqlMetaCommands,
  summarizeVerificationRows,
} from "./baseline-sql";
import { containsMasterReference } from "./bootstrap-contract";
import {
  GENERATED_SECRET_VARS,
  assertSecretsAreExclusive,
  automationOutcome,
  buildDeployEnvPlan,
  resolveAutomationCapability,
  resolveAutomationTarget,
  resolveInstallationRepo,
  resolveOperationalUrl,
  type AutomationOutcome,
  type GeneratedSecretVar,
} from "./automation-contract";
import {
  applyProgressReport,
  finalizeOperation,
  sanitize,
  type OperationRow,
} from "./runner.server";
import { InstallationReadError, readWithBackoff } from "./resilience.server";
import {
  MASTER_RELEASE_VERSION,
  VALIDATE_STEPS,
  type CheckState,
  type HealthCheckId,
} from "./manager-contract";

/* --------------------------------------------------------------- utilidades */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

type OperationControlState = {
  status?: string;
  fencing_token?: number | string | null;
};

type OperationControlClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
        maybeSingle: () => Promise<{ data?: OperationControlState | null; error?: unknown }>;
      };
    };
  };
};

/**
 * Lê o sinal de controle com retry. Ausência após leitura válida é tratada como
 * indisponibilidade do plano de controle, nunca como cancelamento implícito.
 */
export async function readOperationControlState(
  client: OperationControlClient,
  operationId: string,
  options?: Parameters<typeof readWithBackoff<OperationControlState>>[1],
): Promise<OperationControlState> {
  const state = await readWithBackoff(async () => {
    const result = await client
      .from("installation_operations")
      .select("status, fencing_token")
      .eq("id", operationId)
      .maybeSingle();
    return { data: result.data ?? null, error: result.error };
  }, options);
  if (!state) {
    throw new InstallationReadError(
      "connection",
      "Estado da operação temporariamente indisponível no MASTER (connection).",
    );
  }
  return state;
}

/** Só um estado terminal confiável ou fencing divergente confirmado interrompe. */
export async function shouldInterruptOperation(
  client: OperationControlClient,
  operation: Pick<OperationRow, "id" | "fencing_token">,
  options?: Parameters<typeof readWithBackoff<OperationControlState>>[1],
): Promise<boolean> {
  const current = await readOperationControlState(client, operation.id, options);
  if (current.status === "failed") return true;
  return operation.fencing_token != null && current.fencing_token !== operation.fencing_token;
}

/** Secret aleatório gerado NO provisionamento — nunca herdado do MASTER. */
export function generateInstallationSecret(length = 48): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Helpers do Vault usados pelos jobs de cron. Aplicado de forma idempotente no
 * destino antes de gravar o CRON_SECRET, porque instalações cujo baseline foi
 * aplicado parcialmente (ou repositório adotado manualmente) podem não ter
 * `public.set_cron_secret`, o que causava `42883: function does not exist`.
 */
const CRON_SECRET_VAULT_HELPERS_SQL = `
create extension if not exists supabase_vault with schema vault;

create or replace function public.set_cron_secret(_value text)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare v_id uuid;
begin
  if _value is null or length(_value) < 16 then
    raise exception 'cron secret inválido';
  end if;
  select id into v_id from vault.secrets where name = 'cron_secret';
  if v_id is null then
    perform vault.create_secret(_value, 'cron_secret', 'Segredo compartilhado dos endpoints /api/public de cron');
  else
    perform vault.update_secret(v_id, _value, 'cron_secret', 'Segredo compartilhado dos endpoints /api/public de cron');
  end if;
end;
$fn$;

revoke all on function public.set_cron_secret(text) from public;
revoke all on function public.set_cron_secret(text) from anon;
revoke all on function public.set_cron_secret(text) from authenticated;
grant execute on function public.set_cron_secret(text) to service_role;

create or replace function public.cron_secret()
returns text
language sql
security definer
set search_path = public
as $fn$
  select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1;
$fn$;

revoke all on function public.cron_secret() from public;
revoke all on function public.cron_secret() from anon;
revoke all on function public.cron_secret() from authenticated;
`;

/**
 * Mantém criação do helper e gravação na mesma chamada da Management API.
 * Isso torna a retomada atômica: não há janela em que a API confirme a criação
 * e uma chamada seguinte ainda resolva uma versão antiga do schema.
 */
function writeCronSecretToVaultSql(secret: string): string {
  return `${CRON_SECRET_VAULT_HELPERS_SQL}

select public.set_cron_secret(${sqlLiteral(secret)}::text);
`;
}

/** Substitui as variáveis psql (`:'app_url'`) usadas pelos scripts. */
function bindAppUrl(sql: string, appUrl: string): string {
  const pure = stripPsqlMetaCommands(sql).sql;
  return pure.replace(/:'app_url'/g, sqlLiteral(appUrl)).replace(/:app_url\b/g, sqlLiteral(appUrl));
}

type Fetcher = typeof fetch;

/** GET real na URL operacional: nunca marca frontend ok sem resposta HTTP. */
export async function probeOperationalUrl(
  origin: string,
  fetchImpl?: Fetcher,
): Promise<{ ok: boolean; status: number | null; detail: string }> {
  const doFetch = fetchImpl ?? fetch;
  try {
    const res = await doFetch(origin, { method: "GET", redirect: "follow" });
    if (res.status >= 200 && res.status < 400) {
      return { ok: true, status: res.status, detail: `HTTP ${res.status}` };
    }
    return { ok: false, status: res.status, detail: `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, status: null, detail: (e as Error).message };
  }
}

/* ------------------------------------------------ Supabase Management API */

/**
 * Tabelas auxiliares da automação (`_unitos_*`) vivem em `public` mas NÃO fazem
 * parte do produto: sem RLS elas reprovavam a verificação 15 do
 * `verify-installation.sql` ("RLS habilitado em todas as tabelas de public").
 * Sem policies e sem grants, ficam invisíveis pela Data API e acessíveis apenas
 * pela Management API / service role.
 */
export const HELPER_TABLE_HARDENING_SQL = (table: string): string =>
  [
    `alter table ${table} enable row level security`,
    `revoke all on ${table} from anon, authenticated`,
  ].join(";\n");

/** Nomes das tabelas auxiliares criadas pela automação no banco de destino. */
export const HELPER_TABLES = [
  "public._unitos_applied_deltas",
  "public._unitos_deferred_sql",
  "public._unitos_migration_checkpoints",
] as const;

/**
 * Auto-reparo idempotente antes da validação final: liga RLS e revoga grants em
 * qualquer tabela auxiliar remanescente de execuções anteriores e descarta a
 * fila de statements adiados quando ela já está vazia.
 */
export async function hardenHelperTables(management: {
  query: (sql: string) => Promise<{ ok: boolean; rows: unknown[]; error?: string }>;
}): Promise<{ ok: boolean; error?: string }> {
  const sql = [
    "DO $unitos_harden$",
    "DECLARE t text; leftover int;",
    "BEGIN",
    `  FOREACH t IN ARRAY ARRAY[${HELPER_TABLES.map((n) => `'${n}'`).join(", ")}] LOOP`,
    "    IF to_regclass(t) IS NOT NULL THEN",
    "      EXECUTE format('alter table %s enable row level security', t);",
    "      EXECUTE format('revoke all on %s from anon, authenticated', t);",
    "    END IF;",
    "  END LOOP;",
    "  IF to_regclass('public._unitos_deferred_sql') IS NOT NULL THEN",
    "    EXECUTE 'SELECT count(*) FROM public._unitos_deferred_sql WHERE stmt NOT LIKE ''-- __unitos%''' INTO leftover;",
    "    IF leftover = 0 THEN DROP TABLE IF EXISTS public._unitos_deferred_sql; END IF;",
    "  END IF;",
    "END",
    "$unitos_harden$;",
  ].join("\n");
  const res = await management.query(sql);
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}

/**
 * Reaplica um arquivo do baseline statement por statement, ignorando SOMENTE
 * erros de "objeto já existe". Qualquer outro erro aborta e é reportado.
 */
export async function applyStatementByStatement(
  management: { query: (sql: string) => Promise<{ ok: boolean; rows: unknown[]; error?: string }> },
  sql: string,
  options?: {
    onProgress?: (processed: number, total: number) => Promise<void> | void;
    isCancelled?: () => Promise<boolean>;
    /** Retomada: statements já aplicados numa execução anterior. */
    startIndex?: number;
    /** Limita o trabalho por invocação para caber na janela do Worker. */
    maxStatements?: number;
    /** Namespace estável: operação + arquivo + fingerprint. */
    runKey?: string;
    /** Predicado executado na mesma transação, antes do checkpoint completed. */
    completionPostcondition?: { predicateSql: string; errorMessage: string };
  },
): Promise<
  | { ok: true; skipped: number; processed: number; total: number; complete: boolean }
  | { ok: false; error?: string; processed?: number; total?: number }
> {
  const statements = splitSqlStatements(sql);
  // Lotes grandes (150 statements) chegaram a ultrapassar a janela real do
  // Worker/Management API: o request era encerrado antes do AbortController e
  // o checkpoint ficava parado exatamente no limite do lote (ex.: 150/264 =
  // 57% no delta). 25 mantém cada chamada curta e deixa um checkpoint fino.
  const batchSize = 25;
  let from = Math.min(Math.max(options?.startIndex ?? 0, 0), statements.length);
  const maxStatements = Math.max(options?.maxStatements ?? batchSize, 1);
  let stopAt = Math.min(statements.length, from + maxStatements);
  let processed = from;

  // Cada statement é protegido no próprio Postgres e os lotes são enviados em
  // poucas chamadas. Assim um objeto duplicado é ignorado isoladamente, mas
  // qualquer erro diferente continua abortando. Isso evita as ~1.800 chamadas
  // sequenciais que excediam a vida do Worker em retomadas parciais.
  // Tabela de statements adiados: o dump emite objetos em ordem alfabética, e
  // uma função/policy/view pode referenciar algo criado mais adiante
  // (ex.: app_access_role -> is_super_admin). Em vez de depender de
  // check_function_bodies (que não cobre views/policies), o statement que falha
  // por objeto inexistente é guardado e reexecutado no final, em rodadas, até
  // não haver mais progresso.
  const runKey = (options?.runKey ?? `legacy:${deltaFingerprint(sql)}`).slice(0, 500);
  const runKeySql = sqlLiteral(runKey);
  const prep = await management.query(
    [
      "create table if not exists public._unitos_deferred_sql (id bigserial primary key, stmt text not null, run_key text not null default 'legacy')",
      "alter table public._unitos_deferred_sql add column if not exists run_key text not null default 'legacy'",
      "alter table public._unitos_deferred_sql add column if not exists sqlstate text",
      "alter table public._unitos_deferred_sql add column if not exists error_message text",
      "create index if not exists _unitos_deferred_sql_run_key_idx on public._unitos_deferred_sql (run_key, id)",
      HELPER_TABLE_HARDENING_SQL("public._unitos_deferred_sql"),
      "create table if not exists public._unitos_migration_checkpoints (run_key text primary key, statement_index integer not null default 0, total_statements integer not null, status text not null default 'running', updated_at timestamptz not null default now())",
      HELPER_TABLE_HARDENING_SQL("public._unitos_migration_checkpoints"),
    ].join(";\n"),
  );

  if (!prep.ok) return { ok: false, error: prep.error, processed };
  const checkpoint = await management.query(
    [
      "insert into public._unitos_migration_checkpoints (run_key, statement_index, total_statements, status)",
      `values (${runKeySql}, ${from}, ${statements.length}, 'running')`,
      "on conflict (run_key) do nothing",
      `returning statement_index, total_statements, status; select statement_index, total_statements, status from public._unitos_migration_checkpoints where run_key = ${runKeySql}`,
    ].join("\n"),
  );
  if (!checkpoint.ok) return { ok: false, error: checkpoint.error, processed };
  const checkpointRow = checkpoint.rows.find(
    (row): row is Record<string, unknown> => !!row && typeof row === "object",
  );
  if (!checkpointRow || !("statement_index" in checkpointRow)) {
    return {
      ok: false,
      error: "Leitura do checkpoint canônico retornou uma resposta vazia.",
      processed,
    };
  }
  const canonicalTotal = Number(checkpointRow["total_statements"]);
  const canonicalIndex = Number(checkpointRow["statement_index"]);
  if (!Number.isInteger(canonicalTotal) || canonicalTotal !== statements.length) {
    return {
      ok: false,
      error: "Checkpoint canônico incompatível com o conteúdo da migration.",
      processed,
    };
  }
  if (
    !Number.isInteger(canonicalIndex) ||
    canonicalIndex < 0 ||
    canonicalIndex > statements.length
  ) {
    return { ok: false, error: "Checkpoint canônico contém um índice inválido.", processed };
  }
  from = canonicalIndex;
  processed = canonicalIndex;
  stopAt = Math.min(statements.length, from + maxStatements);

  const checkpointSql = (index: number, status = "running") =>
    `insert into public._unitos_migration_checkpoints (run_key, statement_index, total_statements, status, updated_at) values (${runKeySql}, ${index}, ${statements.length}, ${sqlLiteral(status)}, now()) on conflict (run_key) do update set statement_index = greatest(public._unitos_migration_checkpoints.statement_index, excluded.statement_index), total_statements = excluded.total_statements, status = excluded.status, updated_at = now()`;

  for (let start = from; start < stopAt; start += batchSize) {
    if (await options?.isCancelled?.()) {
      return { ok: false, error: "Operação cancelada pelo Super Admin.", processed };
    }
    const batch = statements.slice(start, Math.min(start + batchSize, stopAt));
    // `ALTER TYPE ... ADD VALUE` não pode rodar dentro de bloco/função: o
    // Postgres recusa com 25001/0A000. Esses statements saem do bloco protegido
    // e vão isolados, na mesma ordem, tolerando "já existe".
    const segments: Array<{ kind: "guarded" | "enum"; statements: string[] }> = [];
    for (const statement of batch) {
      const isEnumAdd = /^\s*alter\s+type\b[\s\S]*\badd\s+value\b/i.test(statement);
      const last = segments[segments.length - 1];
      if (last && (last.kind === "enum") === isEnumAdd) last.statements.push(statement);
      else segments.push({ kind: isEnumAdd ? "enum" : "guarded", statements: [statement] });
    }

    let segmentProcessed = start;
    for (const segment of segments) {
      const segmentEnd = segmentProcessed + segment.statements.length;
      if (segment.kind === "enum") {
        for (const statement of segment.statements) {
          const nextIndex = segmentProcessed + 1;
          const enumRes = await management.query(
            `BEGIN;\n${statement}\n${checkpointSql(nextIndex)};\nCOMMIT;`,
          );
          if (
            !enumRes.ok &&
            !/already exists|duplicate|does not exist/i.test(enumRes.error ?? "")
          ) {
            return { ok: false, error: enumRes.error, processed };
          }
          if (!enumRes.ok) {
            const duplicateCheckpoint = await management.query(checkpointSql(nextIndex));
            if (!duplicateCheckpoint.ok)
              return { ok: false, error: duplicateCheckpoint.error, processed };
          }
          segmentProcessed = nextIndex;
        }
        continue;
      }

      const guarded = segment.statements
        .map((statement, index) => {
          let suffix = index;
          let tag = `$unitos_stmt_${suffix}$`;
          while (statement.includes(tag)) {
            suffix += segment.statements.length;
            tag = `$unitos_stmt_${suffix}$`;
          }
          const droppedFunction = explicitDropFunctionSignature(statement);
          const execution = droppedFunction
            ? [
                `  IF to_regprocedure(${sqlLiteral(droppedFunction)}) IS NOT NULL THEN`,
                `    EXECUTE ${tag}${statement}${tag};`,
                "  END IF;",
              ]
            : [`  EXECUTE ${tag}${statement}${tag};`];
          return [
            "DO $unitos_guard$",
            "BEGIN",
            ...execution,
            "EXCEPTION",
            "  WHEN SQLSTATE '42710' OR SQLSTATE '42P07' OR SQLSTATE '42P06'",
            "    OR SQLSTATE '42701' OR SQLSTATE '42723' THEN NULL;",
            "  WHEN SQLSTATE '42883' OR SQLSTATE '42P01' OR SQLSTATE '42704'",
            "    OR SQLSTATE '42703' OR SQLSTATE '42P17' THEN",
            `    INSERT INTO public._unitos_deferred_sql (run_key, stmt, sqlstate, error_message) VALUES (${runKeySql}, ${tag}${statement}${tag}, SQLSTATE, SQLERRM);`,
            "  WHEN SQLSTATE '42P16' THEN",
            "    IF SQLERRM ILIKE '%multiple primary key%' THEN",
            "      NULL;",
            "    ELSE",
            "      RAISE;",
            "    END IF;",
            "END",
            "$unitos_guard$;",
          ].join("\n");
        })
        .join("\n");
      const result = await management.query(
        `BEGIN;\nSET LOCAL check_function_bodies = off;\n${guarded}\n${checkpointSql(segmentEnd)};\nCOMMIT;`,
      );
      if (!result.ok) return { ok: false, error: result.error, processed };
      segmentProcessed = segmentEnd;

      // Uma dependência pode ter sido criada no mesmo lote depois do statement
      // que a utiliza. Tenta resolver a fila imediatamente, mas mantém o item e
      // seu erro original quando a dependência ainda pertence a um lote futuro.
      const retryDeferred = await management.query(
        [
          "SET check_function_bodies = off;",
          "DO $unitos_retry_deferred$",
          "DECLARE r record; v_state text; v_message text;",
          "BEGIN",
          `  FOR r IN SELECT id, stmt FROM public._unitos_deferred_sql WHERE run_key = ${runKeySql} ORDER BY id LOOP`,
          "    BEGIN",
          "      EXECUTE r.stmt;",
          "      DELETE FROM public._unitos_deferred_sql WHERE id = r.id;",
          "    EXCEPTION",
          "      WHEN SQLSTATE '42710' OR SQLSTATE '42P07' OR SQLSTATE '42P06'",
          "        OR SQLSTATE '42701' OR SQLSTATE '42723' THEN",
          "        DELETE FROM public._unitos_deferred_sql WHERE id = r.id;",
          "      WHEN OTHERS THEN",
          "        GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_message = MESSAGE_TEXT;",
          "        UPDATE public._unitos_deferred_sql SET sqlstate = v_state, error_message = v_message WHERE id = r.id;",
          "    END;",
          "  END LOOP;",
          "END",
          "$unitos_retry_deferred$;",
        ].join("\n"),
      );
      if (!retryDeferred.ok) return { ok: false, error: retryDeferred.error, processed };
    }

    processed += batch.length;
    await options?.onProgress?.(processed, statements.length);
  }

  const complete = processed >= statements.length;
  if (complete) {
    // Rodadas de reexecução dos adiados: cada rodada resolve as dependências
    // criadas na rodada anterior. Para quando não houver mais progresso.
    const drain = await management.query(
      [
        "SET check_function_bodies = off;",
        "DO $unitos_drain$",
        "DECLARE r record; cur int; prev int := -1; pend text; v_state text; v_message text;",
        "BEGIN",
        "  LOOP",
        `    SELECT count(*) INTO cur FROM public._unitos_deferred_sql WHERE run_key = ${runKeySql};`,
        "    EXIT WHEN cur = 0 OR cur = prev;",
        "    prev := cur;",
        `    FOR r IN SELECT id, stmt FROM public._unitos_deferred_sql WHERE run_key = ${runKeySql} ORDER BY id LOOP`,
        "      BEGIN",
        "        EXECUTE r.stmt;",
        "        DELETE FROM public._unitos_deferred_sql WHERE id = r.id;",
        "      EXCEPTION",
        "        WHEN SQLSTATE '42710' OR SQLSTATE '42P07' OR SQLSTATE '42P06'",
        "          OR SQLSTATE '42701' OR SQLSTATE '42723' THEN",
        "          DELETE FROM public._unitos_deferred_sql WHERE id = r.id;",
        "        WHEN OTHERS THEN",
        "          GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_message = MESSAGE_TEXT;",
        "          UPDATE public._unitos_deferred_sql SET sqlstate = v_state, error_message = v_message WHERE id = r.id;",
        "      END;",
        "    END LOOP;",
        "  END LOOP;",
        `  SELECT string_agg(format('[%s] %s :: %s', coalesce(sqlstate, 'unknown'), coalesce(error_message, 'erro não capturado'), left(stmt, 240)), ' || ') INTO pend FROM public._unitos_deferred_sql WHERE run_key = ${runKeySql};`,
        "  IF pend IS NOT NULL THEN",
        "    RAISE EXCEPTION 'statements com dependência não resolvida: %', pend;",
        "  END IF;",
        `  DELETE FROM public._unitos_deferred_sql WHERE run_key = ${runKeySql};`,
        ...(options?.completionPostcondition
          ? [
              `  IF NOT (${options.completionPostcondition.predicateSql}) THEN`,
              `    RAISE EXCEPTION ${sqlLiteral(options.completionPostcondition.errorMessage)};`,
              "  END IF;",
            ]
          : []),
        `  ${checkpointSql(statements.length, "completed")};`,
        "END",
        "$unitos_drain$;",
      ].join("\n"),
    );
    if (!drain.ok) return { ok: false, error: drain.error, processed };
  }

  return {
    ok: true,
    skipped: 0,
    processed,
    total: statements.length,
    complete,
  };
}

export type ManagementClient = {
  query: (sql: string) => Promise<{ ok: boolean; rows: unknown[]; error?: string }>;
  keys: () => Promise<{
    ok: boolean;
    publishableKey?: string;
    serviceRoleKey?: string;
    error?: string;
  }>;
  /**
   * PATCH em `/config/auth`. Opcional no tipo porque testes usam dublês
   * simples — quem chama trata a ausência como "não aplicado".
   */
  configureAuth?: (patch: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>;
};

/**
 * Padrão de autenticação de toda instalação nova: confirmação de e-mail
 * DESLIGADA. O Supabase de cada instalação usa o remetente padrão dele, sem
 * DNS apontado, então o e-mail de confirmação nunca chega e o primeiro acesso
 * (/setup) ficaria preso. Convites e reset continuam disponíveis.
 */
export const INSTALLATION_AUTH_DEFAULTS = { mailer_autoconfirm: true } as const;

/** Aplica os padrões de auth no destino. Nunca bloqueia a operação. */
export async function applyInstallationAuthDefaults(
  management: ManagementClient,
): Promise<{ applied: boolean; detail: string }> {
  if (!management.configureAuth) {
    return { applied: false, detail: "cliente de gestão sem suporte a config/auth" };
  }
  const res = await management.configureAuth({ ...INSTALLATION_AUTH_DEFAULTS });
  return res.ok
    ? { applied: true, detail: "confirmação de e-mail desligada no destino" }
    : { applied: false, detail: res.error ?? "não foi possível ajustar a autenticação" };
}

function managementApiError(status: number, body: string, operation: "database" | "keys"): string {
  if (status === 401) {
    return "Supabase Access Token inválido ou revogado. Gere um novo token na conta correta do Supabase.";
  }
  if (status === 403) {
    const permission =
      operation === "keys"
        ? "executar consultas e visualizar as chaves de API"
        : "executar consultas no banco";
    return (
      `O token foi reconhecido, mas sua conta não tem permissão para ${permission} neste projeto. ` +
      "Confirme se o Project ref pertence à mesma organização da conta que gerou o token e se essa conta é Owner ou Administrator do projeto."
    );
  }
  if (status === 404) {
    return "Projeto Supabase não encontrado para este token. Confira a URL e o Project ref da instalação.";
  }
  if (status === 429) {
    return "A Management API do Supabase está limitando as chamadas (HTTP 429). Aguarde alguns minutos e tente novamente — a credencial está correta.";
  }
  if (status >= 500) {
    return (
      `Instabilidade temporária do Supabase (HTTP ${status}). ` +
      "Isso não é problema da credencial nem do token: tentamos novamente automaticamente e ainda assim não houve resposta. Repita a operação em alguns minutos."
    );
  }
  const detail = body.trim().slice(0, 300);
  return `HTTP ${status}${detail ? ` ${detail}` : ""}`;
}

/** Status que valem nova tentativa: instabilidade/limite do lado do Supabase. */
export function isRetryableManagementStatus(status: number): boolean {
  return status === 429 || status === 408 || status >= 500;
}

const RETRY_DELAYS_MS = [1_000, 3_000, 7_000];

/**
 * Normaliza as respostas de chaves da Management API. Há duas formas em uso:
 * lista (`[{ name|type, api_key }]`) e objeto legado
 * (`{ anon_key, service_role_key }`).
 */
export function extractSupabaseApiKeys(body: unknown): {
  publishableKey?: string;
  serviceRoleKey?: string;
} {
  const clean = (value: unknown) =>
    typeof value === "string" && value.trim() ? value.trim() : undefined;

  if (Array.isArray(body)) {
    const rows = body as Array<{ name?: string; type?: string; api_key?: string }>;
    const find = (name: string) =>
      clean(rows.find((k) => k?.name === name || k?.type === name)?.api_key);
    return {
      publishableKey: find("anon") ?? find("publishable"),
      serviceRoleKey: find("service_role") ?? find("secret"),
    };
  }

  if (body && typeof body === "object") {
    const row = body as Record<string, unknown>;
    return {
      publishableKey: clean(row["anon_key"]) ?? clean(row["publishable_key"]),
      serviceRoleKey: clean(row["service_role_key"]) ?? clean(row["secret_key"]),
    };
  }

  return {};
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export function createManagementClient(input: {
  token: string;
  projectRef: string;
  fetchImpl?: Fetcher;
}): ManagementClient {
  const doFetch = input.fetchImpl ?? fetch;
  const base = `https://api.supabase.com/v1/projects/${input.projectRef}`;
  const headers = {
    authorization: `Bearer ${input.token}`,
    "content-type": "application/json",
  };

  // Instabilidade do Supabase (502/503/504/429) não é falha de credencial:
  // repetimos algumas vezes antes de declarar o destino inacessível.
  const attempts = RETRY_DELAYS_MS.length;

  return {
    async query(sql) {
      let last = { ok: false, rows: [] as unknown[], error: "sem resposta da Management API" };
      for (let attempt = 0; attempt < attempts; attempt++) {
        const controller = new AbortController();
        // Precisa expirar ANTES do limite do runtime. Um timeout de 60s não
        // ajudava: o isolate podia morrer primeiro e a operação ficava running.
        const timer = setTimeout(() => controller.abort(), 12_000);
        try {
          const res = await doFetch(`${base}/database/query`, {
            method: "POST",
            headers,
            body: JSON.stringify({ query: sql }),
            signal: controller.signal,
          });
          if (!res.ok) {
            const text = await res.text().catch(() => "");
            last = { ok: false, rows: [], error: managementApiError(res.status, text, "database") };
            if (!isRetryableManagementStatus(res.status)) return last;
          } else {
            try {
              const body = (await res.json()) as unknown;
              if (!Array.isArray(body)) {
                last = {
                  ok: false,
                  rows: [],
                  error: "resposta inválida da Management API: esperado um array JSON",
                };
              } else {
                return { ok: true, rows: body };
              }
            } catch {
              last = {
                ok: false,
                rows: [],
                error: "resposta ilegível da Management API",
              };
            }
          }
        } catch (e) {
          const aborted = e instanceof Error && e.name === "AbortError";
          last = {
            ok: false,
            rows: [],
            error: aborted ? "timeout de 12s na Management API" : (e as Error).message,
          };
        } finally {
          clearTimeout(timer);
        }
        if (attempt < attempts - 1) await sleep(RETRY_DELAYS_MS[attempt]);
      }
      return last;
    },
    async keys() {
      let last: { ok: boolean; publishableKey?: string; serviceRoleKey?: string; error?: string } =
        {
          ok: false,
          error: "sem resposta da Management API",
        };
      // A revelação das chaves novas (`reveal=true`) exige privilégio maior do
      // que a simples leitura. Um token que só enxerga as chaves legadas
      // (anon/service_role) responde 403 ali e 200 nos outros caminhos — então
      // tentamos os três antes de declarar o destino inacessível.
      for (const path of ["/api-keys?reveal=true", "/api-keys/legacy", "/api-keys"]) {
        for (let attempt = 0; attempt < attempts; attempt++) {
          try {
            const res = await doFetch(`${base}${path}`, { headers });
            if (!res.ok) {
              const text = await res.text().catch(() => "");
              last = { ok: false, error: managementApiError(res.status, text, "keys") };
              if (!isRetryableManagementStatus(res.status)) break;
            } else {
              const body = (await res.json().catch(() => null)) as unknown;
              const found = extractSupabaseApiKeys(body);
              if (found.publishableKey && found.serviceRoleKey) {
                return { ok: true, ...found };
              }
              last = {
                ok: false,
                error: "o token leu o projeto, mas não retornou as chaves anon e service_role.",
              };
              break;
            }
          } catch (e) {
            last = { ok: false, error: (e as Error).message };
          }
          if (attempt < attempts - 1) await sleep(RETRY_DELAYS_MS[attempt]);
        }
      }
      return last;
    },
    async configureAuth(patch) {
      let last = { ok: false, error: "sem resposta da Management API" };
      for (let attempt = 0; attempt < attempts; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 12_000);
        try {
          const res = await doFetch(`${base}/config/auth`, {
            method: "PATCH",
            headers,
            body: JSON.stringify(patch),
            signal: controller.signal,
          });
          if (res.ok) return { ok: true };
          const text = await res.text().catch(() => "");
          last = { ok: false, error: managementApiError(res.status, text, "database") };
          if (!isRetryableManagementStatus(res.status)) return last;
        } catch (e) {
          const aborted = e instanceof Error && e.name === "AbortError";
          last = {
            ok: false,
            error: aborted ? "timeout de 12s na Management API" : (e as Error).message,
          };
        } finally {
          clearTimeout(timer);
        }
        if (attempt < attempts - 1) await sleep(RETRY_DELAYS_MS[attempt]);
      }
      return last;
    },
  };
}

export async function validateSupabaseProjectKeys(input: {
  supabaseUrl: string;
  publishableKey: string;
  serviceRoleKey: string;
  fetchImpl?: Fetcher;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const origin = input.supabaseUrl.trim().replace(/\/+$/, "");
  if (!/^https:\/\/[a-z0-9]{16,}\.supabase\.co$/i.test(origin)) {
    return { ok: false, error: "URL do Supabase inválida para validar as chaves." };
  }
  const doFetch = input.fetchImpl ?? fetch;
  const check = async (key: string, label: string) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    try {
      const res = await doFetch(`${origin}/rest/v1/installation?select=id&limit=1`, {
        headers: { apikey: key, authorization: `Bearer ${key}` },
        signal: controller.signal,
      });
      if (res.status === 401 || res.status === 403) {
        return `${label} recusada pelo projeto informado (HTTP ${res.status}).`;
      }
      if (res.status >= 500)
        return `${label}: Supabase temporariamente indisponível (HTTP ${res.status}).`;
      return null;
    } catch (cause) {
      return `${label}: ${cause instanceof Error && cause.name === "AbortError" ? "timeout" : "sem resposta"}.`;
    } finally {
      clearTimeout(timer);
    }
  };
  const publishableError = await check(input.publishableKey, "Chave publicável");
  if (publishableError) return { ok: false, error: publishableError };
  const serviceError = await check(input.serviceRoleKey, "Chave de serviço");
  if (serviceError) return { ok: false, error: serviceError };
  return { ok: true };
}

/* ------------------------------------------------------------- Vercel API */

export type DeployClient = {
  /** Localiza ou cria, no team autorizado, o projeto usado por uma NEW. */
  ensureProject: (
    repo: string,
    checkpoint?: { projectId?: string | null; teamId?: string | null },
  ) => Promise<{
    ok: boolean;
    projectId?: string;
    teamId?: string;
    projectName?: string;
    created?: boolean;
    repositoryLinked?: boolean;
    error?: string;
  }>;
  deploymentUrl: () => Promise<{
    ok: boolean;
    url?: string;
    error?: string;
    /** Nome canônico devolvido pela Vercel, útil para corrigir cadastros antigos. */
    projectName?: string;
  }>;
  /** Redeploy da producao — necessario para que as variaveis gravadas valham. */
  redeploy: () => Promise<{ ok: boolean; deploymentId?: string; error?: string }>;
  /**
   * Desliga (ou religa) o build automatico da branch de producao no projeto de
   * deploy. Instalacoes externas NAO podem publicar sozinhas a cada commit no
   * MASTER: elas so avancam quando o Super Admin autoriza uma atualizacao.
   */
  setAutoDeploy: (
    enabled: boolean,
  ) => Promise<{ ok: boolean; error?: string; unsupported?: boolean }>;
  /**
   * Liga o projeto de deploy ao repositório `owner/repo` DA INSTALAÇÃO,
   * substituindo qualquer vínculo anterior. Idempotente.
   */
  linkRepository: (
    repo: string,
    options?: { force?: boolean },
  ) => Promise<{ ok: boolean; error?: string }>;

  /** Commit atual da branch de producao do repositorio do MASTER. */
  latestCommit: () => Promise<{ ok: boolean; sha?: string; error?: string }>;

  /**
   * Novo build a partir do repositorio ligado ao projeto. Recebe o commit
   * autorizado (`sha`); sem ele usa o commit atual da branch. Sem repositorio
   * ligado, cai para `redeploy()` — que reaproveita o mesmo snapshot e portanto
   * NAO traz codigo novo (source: "rebuild").
   */
  deployLatestCode: (options?: { sha?: string | null }) => Promise<{
    ok: boolean;
    deploymentId?: string;
    source?: "git" | "rebuild";
    ref?: string;
    error?: string;
    /** Cota diária de deployments da API esgotada (402 / free-per-day). */
    quotaExceeded?: boolean;
    /**
     * A Vercel não consegue resolver o repositório informado
     * (`incorrect_git_source_info`): o vínculo existe, mas o app da Vercel no
     * GitHub não alcança o repositório. Nesse caso a publicação sai por push.
     */
    gitSourceUnavailable?: boolean;
    /** Epoch (s) em que a cota volta, quando a Vercel informa. */
    resetAt?: number;
  }>;
  deploymentState: (id: string) => Promise<{
    ok: boolean;
    state?: string;
    url?: string;
    commitSha?: string;
    error?: string;
    /**
     * Motivo textual quando a hospedagem RECUSA a publicação (ex.: política
     * "apenas deployments por Git em produção"). Estado terminal: esperar mais
     * nunca vira READY.
     */
    reason?: string;
    /** `true` quando o deployment foi recusado e não vai buildar nunca. */
    refused?: boolean;
  }>;

  /** Localiza o deployment de produção criado automaticamente por um push Git. */
  findProductionDeployment: (commitSha: string) => Promise<{
    ok: boolean;
    deploymentId?: string;
    state?: string;
    url?: string;
    error?: string;
  }>;

  /** Garante que o domínio definitivo esteja atribuído ao projeto de deploy. */
  ensureDomain: (
    domain: string,
  ) => Promise<{ ok: boolean; added?: boolean; verified?: boolean; error?: string }>;

  setEnv: (
    entries: readonly { key: string; value: string; sensitive: boolean }[],
  ) => Promise<{ ok: boolean; applied: number; error?: string }>;

  /**
   * Leitura SOMENTE dos nomes das variáveis do projeto de deploy, mais o valor
   * das variáveis explicitamente NÃO sensíveis pedidas em `plainKeys` (ex.:
   * `META_REDIRECT_URI`). Nenhum valor cifrado é lido ou devolvido.
   */
  listEnv: (plainKeys?: readonly string[]) => Promise<{
    ok: boolean;
    keys?: string[];
    plain?: Record<string, string>;
    error?: string;
  }>;
};

/**
 * Reconhece o limite de deployments por dia dos planos gratuitos da Vercel
 * (`api-deployments-free-per-day`, HTTP 402). Não é erro de configuração: o
 * provisionamento pode seguir e a publicação acontece pelo Git ou depois.
 */
export function parseDeployQuotaError(
  status: number,
  text: string,
): { quotaExceeded: boolean; resetAt?: number } {
  if (status !== 402 && !/api-deployments-free-per-day|payment_required/i.test(text)) {
    return { quotaExceeded: false };
  }
  const reset = /"reset"\s*:\s*(\d+)/.exec(text)?.[1];
  return { quotaExceeded: true, resetAt: reset ? Number(reset) : undefined };
}

/**
 * Repositório de código do MASTER. Toda instalação faz deploy DESTE repositório
 * (uma base de código, N projetos de deploy, cada um com seus próprios envs).
 * Sem isso, o projeto de deploy fica ligado a um repositório próprio parado no
 * commit inicial e "puxar atualização" nunca traz código novo.
 */
export const DEFAULT_MASTER_REPO = "mahara-apps/unitos-master";

/**
 * Teto absoluto para a publicação de uma atualização. Passado esse tempo a
 * operação encerra com motivo em vez de ser retomada para sempre pelo watchdog
 * (foi o que deixou uma instalação presa em "build em andamento" por ~1h).
 */
export const BUILD_MAX_MINUTES = 20;

const DEPLOYMENT_POLL_INTERVAL_MS = 3_000;
const PROVISION_DEPLOYMENT_WAIT_MS = 45_000;
const FAILED_DEPLOYMENT_STATES = new Set(["ERROR", "CANCELED", "BLOCKED", "FAILED"]);

export type DeploymentPollResult = {
  state: string;
  url: string | null;
  commitSha: string | null;
  reason: string | null;
  refused: boolean;
  timedOut: boolean;
};

export function validateReadyDeploymentCommit(
  deployment: Pick<DeploymentPollResult, "state" | "commitSha">,
  expectedCommit: string,
): { ok: true } | { ok: false; reason: string } {
  if (deployment.state !== "READY") {
    return { ok: false, reason: `deployment ainda não está READY (${deployment.state})` };
  }
  const expected = expectedCommit.trim().toLowerCase();
  const observed = deployment.commitSha?.trim().toLowerCase() ?? "";
  if (!observed || observed !== expected) {
    return {
      ok: false,
      reason: `deployment READY não corresponde ao commit autorizado (esperado ${expectedCommit.slice(0, 12)}, observado ${observed ? observed.slice(0, 12) : "ausente"})`,
    };
  }
  return { ok: true };
}

/**
 * Acompanha um deployment específico por uma janela curta e finita. O chamador
 * decide se um timeout volta ao executor durável ou encerra a operação.
 */
export async function pollDeploymentUntilTerminal(input: {
  deploy: Pick<DeployClient, "deploymentState">;
  deploymentId: string;
  waitMs?: number;
  sleep?: (ms: number) => Promise<void>;
  onObserved?: (observation: DeploymentPollResult) => Promise<void> | void;
}): Promise<DeploymentPollResult> {
  const waitMs = Math.max(0, input.waitMs ?? PROVISION_DEPLOYMENT_WAIT_MS);
  const sleep =
    input.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const attempts = Math.max(1, Math.ceil(waitMs / DEPLOYMENT_POLL_INTERVAL_MS));
  let observed: DeploymentPollResult = {
    state: "QUEUED",
    url: null,
    commitSha: null,
    reason: null,
    refused: false,
    timedOut: false,
  };

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const status = await input.deploy.deploymentState(input.deploymentId);
    if (status.ok) {
      observed = {
        state: (status.state ?? observed.state).toUpperCase(),
        url: status.url ?? observed.url,
        commitSha: status.commitSha ?? observed.commitSha,
        reason: status.reason ?? observed.reason,
        refused: status.refused === true,
        timedOut: false,
      };
      await input.onObserved?.(observed);
      if (
        observed.state === "READY" ||
        observed.refused ||
        FAILED_DEPLOYMENT_STATES.has(observed.state)
      ) {
        return observed;
      }
    }
    if (attempt < attempts - 1) await sleep(DEPLOYMENT_POLL_INTERVAL_MS);
  }

  return { ...observed, timedOut: true };
}

/**
 * Reconhece as duas recusas da hospedagem que NÃO se resolvem esperando nem
 * repetindo a chamada: repositório não resolvido pela API e política "somente
 * publicação disparada pelo Git em produção". Em ambos a saída é publicar pelo
 * push no repositório da instalação.
 */
export function isGitOnlyOrMissingRepo(text: string): boolean {
  return /incorrect_git_source_info|repository can't be found|not allowed in production|only git deployments/i.test(
    text ?? "",
  );
}

/* ------------------------------------------------------------- GitHub API */

export type PublishSnapshotOptions = {
  /** Blobs já copiados (sha do MASTER -> sha no destino), de retomadas. */
  blobMap?: Record<string, string>;
  /** Tempo máximo desta execução; ao esgotar, devolve `partial`. */
  timeBudgetMs?: number;
  onProgress?: (progress: { percent: number; detail: string }) => void | Promise<void>;
  /** Persiste o mapa de blobs a cada lote para permitir retomada. */
  onCheckpoint?: (blobMap: Record<string, string>) => void | Promise<void>;
  /** Só compara: não cria blob, árvore nem commit. Usado na adoção manual. */
  dryRun?: boolean;
};

export type PublishSnapshotResult = {
  ok: boolean;
  /** true quando o orçamento de tempo acabou: retomar continua de onde parou. */
  partial?: boolean;
  /** ISO: quando a cota do GitHub volta. Só em pausa por limite de uso. */
  waitUntil?: string | null;
  /** Motivo legível da pausa (limite de uso), quando houver. */
  note?: string;
  commitSha?: string;
  changed?: number;
  error?: string;
};

export type CodeClient = {
  /** Cria pelo template ou confirma o repositório da instalação. */
  ensureRepo: (options?: {
    /** Provisionamento inicial: exige template e pode recuperar o README técnico conhecido. */
    initialProvision?: boolean;
  }) => Promise<{
    ok: boolean;
    created?: boolean;
    /** "template" | "template_recovered" | "template_alternate" | "existing" */
    via?: string;
    /** Destino efetivo quando um repositório técnico antigo foi preservado intacto. */
    repoSlug?: string;
    /** Commit real da branch criada pelo GitHub a partir do template. */
    commitSha?: string;
    error?: string;
  }>;
  /** Commit atual da branch de produção do MASTER — versão a publicar. */
  masterHeadSha: () => Promise<{ ok: boolean; sha?: string; error?: string }>;
  /**
   * Versão do pacote MASTER *dentro* de um commit do repositório — lida de
   * `supabase/baseline-snapshot/tools/delta_version.txt`. É a única forma de
   * saber se o repositório já recebeu a publicação da versão atual do código:
   * `MASTER_RELEASE_VERSION` vive no processo, o repositório só avança quando o
   * MASTER é publicado.
   */
  releaseAtCommit: (sha: string) => Promise<{ ok: boolean; version?: string; error?: string }>;
  /** Lê e valida o pacote de banco exatamente no commit autorizado. */
  releaseSnapshotAtCommit: (sha: string) => Promise<{
    ok: boolean;
    version?: string;
    sha256?: string;
    total?: number;
    sql?: string;
    manifest?: string;
    error?: string;
  }>;
  /**
   * Versão que está de fato publicada no repositório DA INSTALAÇÃO (branch de
   * produção). É a verdade sobre o que está no ar: o painel usa isto para
   * reconciliar o registro quando uma operação terminou sem gravar a versão.
   */
  installedRelease: () => Promise<{
    ok: boolean;
    version?: string;
    sha?: string;
    error?: string;
  }>;

  /**
   * Commit vazio na branch de produção do repositório DA INSTALAÇÃO para que a
   * integração Git da Vercel publique — usado quando a cota de deployments por
   * API do plano gratuito está esgotada.
   */
  nudgeDeploy: (message?: string) => Promise<{ ok: boolean; commitSha?: string; error?: string }>;
  /** Diagnóstico do token: alcance da organização, criação e template. */
  diagnose: () => Promise<{
    ok: boolean;
    detail: string;
    masterIsTemplate?: boolean;
    canCreate?: boolean;
  }>;
  /**
   * Permissões efetivas do token da instalação: leitura/gravação no repositório
   * de destino, criação de repositório e quanto resta da cota de uso.
   */
  permissions: () => Promise<Array<{ label: string; ok: boolean; detail: string; area: "code" }>>;
  /**
   * Publica no repositório da instalação exatamente a árvore do MASTER no
   * commit informado. Quando os objetos são compartilhados, a
   * árvore é montada direto com os SHAs do MASTER — 3 chamadas. Caso contrário
   * copia só o que difere, em paralelo, com checkpoint e orçamento de tempo.
   */
  publishSnapshot: (
    sha: string,
    options?:
      | PublishSnapshotOptions
      | ((progress: { percent: number; detail: string }) => void | Promise<void>),
  ) => Promise<PublishSnapshotResult>;
};

type TreeEntry = { path?: string; mode?: string; type?: string; sha?: string };

const GITHUB_TRANSIENT_RETRY_MS = [1_000, 3_000] as const;

function isRetryableGithubStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

/**
 * Cliente GitHub do provisionamento. Publica o código do MASTER no repositório
 * DA INSTALAÇÃO — o MASTER é sempre a origem (template), nunca o destino.
 */
export function createCodeClient(input: {
  token: string;
  owner: string;
  repo: string;
  masterRepo?: string | null;
  branch?: string | null;
  /**
   * Token do MASTER. Toda LEITURA do repositório do MASTER usa esta credencial;
   * o token da instalação fica só para gravar no repositório de destino. Sem
   * essa separação, um único token acumula milhares de leituras por publicação
   * e estoura o limite de uso por conta do GitHub (HTTP 403 "API rate limit").
   */
  masterToken?: string | null;
  fetchImpl?: Fetcher;
  sleep?: (ms: number) => Promise<void>;
}): CodeClient {
  const doFetch = input.fetchImpl ?? fetch;
  const sleep =
    input.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const master = (input.masterRepo ?? "").trim() || DEFAULT_MASTER_REPO;
  const branch = (input.branch ?? "").trim() || "main";
  let target = `${input.owner}/${input.repo}`;
  const baseHeaders = {
    accept: "application/vnd.github+json",
    "content-type": "application/json",
    "user-agent": "unitos-installation-manager",
  };
  const headers = { ...baseHeaders, authorization: `Bearer ${input.token}` };
  const masterHeaders = {
    ...baseHeaders,
    authorization: `Bearer ${(input.masterToken ?? "").trim() || input.token}`,
  };
  /**
   * Só LEITURA (GET) do repositório do MASTER usa o token do MASTER. Escritas
   * em `/repos/{master}/generate` cria no destino e continua com o token da
   * instalação.
   */
  const readsMaster = (path: string, init?: RequestInit) =>
    (init?.method ?? "GET").toUpperCase() === "GET" && path.startsWith(`/repos/${master}`);
  const rawApi = (path: string, init?: RequestInit) =>
    doFetch(`https://api.github.com${path}`, {
      ...init,
      headers: readsMaster(path, init) ? masterHeaders : headers,
    });

  /**
   * Limite de uso do GitHub atingido. `resetAt` (epoch em segundos) diz quando
   * a cota volta — pode ser até uma hora, então esperar dentro da requisição é
   * inviável: a operação é devolvida como retomável.
   */
  let rateLimit: { resetAt: number | null } | null = null;

  const rateLimitedResponse = (res: Response) => {
    if (res.status !== 403 && res.status !== 429) return null;
    const remaining = res.headers.get("x-ratelimit-remaining");
    const retryAfter = Number(res.headers.get("retry-after") ?? "0");
    if (remaining !== "0" && !(retryAfter > 0)) return null;
    const reset = Number(res.headers.get("x-ratelimit-reset") ?? "0");
    const resetAt =
      reset > 0 ? reset : retryAfter > 0 ? Math.floor(Date.now() / 1000) + retryAfter : null;
    return { resetAt };
  };

  /**
   * Recuo automático em instabilidade e em limites curtos (Retry-After de
   * poucos segundos). Nunca espera mais que ~8s por tentativa.
   */
  const api = async (
    path: string,
    init?: RequestInit,
    retryTransient = false,
  ): Promise<Response> => {
    let attempt = 0;
    for (;;) {
      const res = await rawApi(path, init);
      const limited = rateLimitedResponse(res);
      if (limited) rateLimit = limited;
      const retryAfter = Number(res.headers.get("retry-after") ?? "0");
      // Cota principal esgotada (reset distante): não insiste — devolve para
      // que a operação seja retomada quando a cota voltar.
      const shortWait = retryAfter > 0 && retryAfter <= 8;
      const transient = retryTransient && isRetryableGithubStatus(res.status);
      const retryable = transient || (limited !== null && shortWait);
      if (!retryable || attempt >= GITHUB_TRANSIENT_RETRY_MS.length) return res;
      const waitMs = Math.min(
        8_000,
        Math.max(
          1_000,
          retryAfter > 0 ? retryAfter * 1_000 : (GITHUB_TRANSIENT_RETRY_MS[attempt] ?? 3_000),
        ),
      );
      attempt += 1;
      await sleep(waitMs);
    }
  };

  const fail = async (res: Response, what: string) => {
    const limited = rateLimitedResponse(res);
    const text = await res.text().catch(() => "");
    if (limited || /api rate limit exceeded|secondary rate limit/i.test(text)) {
      const resetAt = limited?.resetAt ?? null;
      const when = resetAt ? ` A cota volta em ${formatDateTimeBr(new Date(resetAt * 1000))}.` : "";
      return (
        `Limite de uso da API do GitHub atingido ao ${what}.${when} ` +
        `Não é problema de permissão: o progresso salvo é reaproveitado e a ` +
        `operação é retomada automaticamente. Use um token do GitHub exclusivo ` +
        `desta instalação para evitar disputa de cota.`
      );
    }
    if (isRetryableGithubStatus(res.status)) {
      return `Instabilidade temporária do GitHub (HTTP ${res.status}) ao ${what}. O progresso salvo será reaproveitado; tente novamente em alguns minutos.`;
    }
    return `HTTP ${res.status} ao ${what} (${text.slice(0, 200)})`;
  };

  const readMasterFileAtCommit = async (path: string, sha: string) => {
    const res = await api(`/repos/${master}/contents/${path}?ref=${encodeURIComponent(sha)}`);
    if (!res.ok) return { ok: false as const, error: await fail(res, `ler ${path} no MASTER`) };
    const body = (await res.json().catch(() => ({}))) as { content?: string; encoding?: string };
    const content =
      body.encoding === "base64" && body.content
        ? new TextDecoder().decode(
            Uint8Array.from(atob(body.content.replace(/\s+/g, "")), (c) => c.charCodeAt(0)),
          )
        : (body.content ?? "");
    if (!content) return { ok: false as const, error: `${path} retornou conteúdo vazio` };
    return { ok: true as const, content };
  };

  const viewerLogin = async () => {
    const viewer = await api(`/user`);
    if (!viewer.ok) return "";
    return ((await viewer.json().catch(() => ({}))) as { login?: string }).login ?? "";
  };

  return {
    async diagnose() {
      try {
        const masterRes = await api(`/repos/${master}`);
        if (!masterRes.ok) {
          return {
            ok: false,
            detail: await fail(masterRes, `ler o repositório do MASTER ${master}`),
          };
        }
        const masterJson = (await masterRes.json().catch(() => ({}))) as {
          is_template?: boolean;
        };
        const ownerRes = await api(`/orgs/${input.owner}`);
        const login = await viewerLogin();
        const isPersonal = login.toLowerCase() === input.owner.trim().toLowerCase();
        const reachesOwner = ownerRes.ok || isPersonal;
        const parts = [
          `MASTER ${master} acessível`,
          masterJson.is_template
            ? "marcado como template (criação rápida disponível)"
            : "NÃO está marcado como template (a criação rápida está bloqueada)",
          reachesOwner
            ? `destino ${input.owner} alcançado`
            : `destino ${input.owner} inacessível com este token`,
        ];
        return {
          ok: reachesOwner,
          detail: parts.join(" · "),
          masterIsTemplate: Boolean(masterJson.is_template),
          canCreate: reachesOwner,
        };
      } catch (e) {
        return { ok: false, detail: (e as Error).message };
      }
    },
    async permissions() {
      const checks: Array<{ label: string; ok: boolean; detail: string; area: "code" }> = [];
      const push = (label: string, ok: boolean, detail: string) =>
        checks.push({ label, ok, detail, area: "code" as const });
      try {
        const quota = await rawApi("/rate_limit");
        if (quota.ok) {
          const body = (await quota.json().catch(() => ({}))) as {
            resources?: { core?: { remaining?: number; limit?: number; reset?: number } };
          };
          const core = body.resources?.core ?? {};
          const remaining = core.remaining ?? 0;
          push(
            "Cota de uso do GitHub",
            remaining > 500,
            `${remaining}/${core.limit ?? "?"} chamadas restantes${
              core.reset ? ` — renova em ${formatDateTimeBr(new Date(core.reset * 1000))}` : ""
            }`,
          );
        } else {
          push("Cota de uso do GitHub", false, await fail(quota, "consultar a cota do token"));
        }

        const login = await viewerLogin();
        push(
          "Token válido (leitura de metadados)",
          Boolean(login),
          login ? `token da conta ${login}` : "o token não foi aceito pelo GitHub",
        );

        const repoRes = await api(`/repos/${target}`);
        if (repoRes.ok) {
          const body = (await repoRes.json().catch(() => ({}))) as {
            permissions?: { push?: boolean; admin?: boolean };
          };
          if (!body.permissions?.push) {
            push(
              "Gravação no repositório da instalação",
              false,
              `${target} acessível apenas para leitura — habilite Conteúdo: leitura e gravação`,
            );
          } else {
            /* `permissions.push` do metadado mente para tokens finos sem
             * "Contents: read and write". A única prova é escrever de fato:
             * criamos um blob solto (não referenciado por nenhum commit, o
             * GitHub o descarta sozinho) exatamente no endpoint que a
             * publicação usa. */
            const probe = await api(`/repos/${target}/git/blobs`, {
              method: "POST",
              body: JSON.stringify({ content: "unitos-preflight", encoding: "utf-8" }),
            });
            push(
              "Gravação no repositório da instalação",
              probe.ok,
              probe.ok
                ? `${target} com permissão de gravação confirmada`
                : `${target} não aceita gravação com este token — no GitHub, em Repository permissions, habilite "Contents: Read and write" e inclua ${target} entre os repositórios do token (${await fail(probe, `gravar em ${target}`)})`,
            );
          }
        } else if (repoRes.status === 404) {
          const isPersonal = login.toLowerCase() === input.owner.trim().toLowerCase();
          const ownerRes = isPersonal ? null : await api(`/orgs/${input.owner}`);
          const reaches = isPersonal || Boolean(ownerRes?.ok);
          push(
            "Criação do repositório da instalação",
            reaches,
            reaches
              ? `${target} ainda não existe e será criado em ${input.owner}`
              : `o token não alcança ${input.owner} — habilite Administração: leitura e gravação`,
          );
        } else {
          push(
            "Acesso ao repositório da instalação",
            false,
            await fail(repoRes, `consultar ${target}`),
          );
        }

        const masterRes = await api(`/repos/${master}`);
        let templateReady = false;
        if (masterRes.ok) {
          const masterBody = (await masterRes
            .clone()
            .json()
            .catch(() => ({}))) as {
            is_template?: boolean;
          };
          templateReady = masterBody.is_template === true;
        }
        push(
          "Leitura do código do MASTER",
          masterRes.ok,
          masterRes.ok
            ? `${master} acessível com a credencial do MASTER`
            : await fail(masterRes, `ler ${master}`),
        );
        push(
          "Criação rápida pelo template",
          templateReady,
          templateReady
            ? `${master} está pronto para gerar uma cópia completa`
            : `${master} precisa estar marcado como Template repository no GitHub`,
        );
        return checks;
      } catch (e) {
        push("Repositório", false, (e as Error).message);
        return checks;
      }
    },
    async ensureRepo(options) {
      try {
        const existing = await api(`/repos/${target}`);
        if (existing.ok) {
          if (!options?.initialProvision) return { ok: true, created: false, via: "existing" };

          // Recuperação estritamente limitada ao commit técnico criado pelo fluxo
          // legado. Qualquer outro conteúdo é preservado. O repositório técnico
          // nunca é excluído: ele é renomeado e arquivado como backup.
          const head = await api(`/repos/${target}/git/ref/heads/${branch}`);
          const headBody = (await head.json().catch(() => ({}))) as { object?: { sha?: string } };
          const headSha = headBody.object?.sha;
          const tree = headSha
            ? await api(`/repos/${target}/git/trees/${headSha}?recursive=1`)
            : new Response("branch ausente", { status: 404 });
          const treeBody = (await tree.json().catch(() => ({}))) as { tree?: TreeEntry[] };
          const files = (treeBody.tree ?? []).filter((entry) => entry.type === "blob");
          const onlyReadme = files.length === 1 && files[0]?.path === "README.md";
          let knownSeed = false;
          if (onlyReadme) {
            const content = await api(`/repos/${target}/contents/README.md?ref=${branch}`);
            const contentBody = (await content.json().catch(() => ({}))) as {
              content?: string;
              encoding?: string;
            };
            const decoded =
              contentBody.encoding === "base64" && contentBody.content
                ? new TextDecoder().decode(
                    Uint8Array.from(atob(contentBody.content.replace(/\s+/g, "")), (c) =>
                      c.charCodeAt(0),
                    ),
                  )
                : "";
            knownSeed =
              decoded ===
              `# ${input.repo}\n\nInstalação Unitos. Código publicado a partir do MASTER.\n`;
          }
          if (!knownSeed) return { ok: true, created: false, via: "existing", commitSha: headSha };

          const masterInfo = await api(`/repos/${master}`);
          if (!masterInfo.ok) {
            return { ok: false, error: await fail(masterInfo, `ler o template ${master}`) };
          }
          const masterBody = (await masterInfo.json().catch(() => ({}))) as {
            is_template?: boolean;
          };
          if (!masterBody.is_template) {
            return {
              ok: false,
              error: `${master} não está marcado como Template repository no GitHub. Ative essa opção no MASTER antes de provisionar. O repositório técnico foi preservado.`,
            };
          }

          const backupBase = `${input.repo}-legacy-readme`;
          let backupName = backupBase;
          for (let suffix = 1; suffix <= 20; suffix += 1) {
            const candidate = suffix === 1 ? backupBase : `${backupBase}-${suffix}`;
            const candidateRes = await api(`/repos/${input.owner}/${candidate}`);
            if (candidateRes.status === 404) {
              backupName = candidate;
              break;
            }
            if (!candidateRes.ok) {
              return {
                ok: false,
                error: await fail(candidateRes, `verificar o nome de backup ${candidate}`),
              };
            }
            if (suffix === 20) {
              return {
                ok: false,
                error: `Não foi encontrado um nome livre para preservar o repositório técnico ${target}.`,
              };
            }
          }

          const renamed = await api(`/repos/${target}`, {
            method: "PATCH",
            body: JSON.stringify({ name: backupName }),
          });
          if (!renamed.ok) {
            // Tokens fine-grained podem gerar repositórios pelo template, mas
            // não renomear um repositório existente. Nesse caso, o README
            // técnico fica intacto e a instalação passa a usar um novo slug.
            if (renamed.status !== 403) {
              return {
                ok: false,
                error: await fail(renamed, `preservar o repositório técnico ${target} como backup`),
              };
            }
            let alternateName: string | null = null;
            for (let suffix = 1; suffix <= 20; suffix += 1) {
              const candidate = suffix === 1 ? `${input.repo}-app` : `${input.repo}-app-${suffix}`;
              const candidateRes = await api(`/repos/${input.owner}/${candidate}`);
              if (candidateRes.status === 404) {
                alternateName = candidate;
                break;
              }
              if (!candidateRes.ok) {
                return {
                  ok: false,
                  error: await fail(candidateRes, `verificar o novo repositório ${candidate}`),
                };
              }
            }
            if (!alternateName) {
              return {
                ok: false,
                error: `Não foi encontrado um nome livre para criar a cópia operacional de ${target}.`,
              };
            }
            const alternateTarget = `${input.owner}/${alternateName}`;
            const alternate = await api(`/repos/${master}/generate`, {
              method: "POST",
              body: JSON.stringify({
                owner: input.owner,
                name: alternateName,
                private: true,
                include_all_branches: false,
                description: "Instalação Unitos gerada a partir do MASTER",
              }),
            });
            if (!alternate.ok) {
              return {
                ok: false,
                error:
                  `${await fail(alternate, `gerar a cópia completa ${alternateTarget} a partir de ${master}`)}. ` +
                  `O repositório técnico ${target} permaneceu intacto.`,
              };
            }
            target = alternateTarget;
            for (let attempt = 0; attempt < 12; attempt += 1) {
              const generatedHead = await api(
                `/repos/${target}/commits/${branch}`,
                undefined,
                true,
              );
              if (generatedHead.ok) {
                const body = (await generatedHead.json().catch(() => ({}))) as { sha?: string };
                if (body.sha) {
                  return {
                    ok: true,
                    created: true,
                    via: "template_alternate",
                    repoSlug: target,
                    commitSha: body.sha,
                  };
                }
              }
              await sleep(1_000);
            }
            return {
              ok: false,
              error: `A cópia completa foi criada em ${target}, mas a branch ${branch} ainda não ficou disponível. Tente novamente em alguns instantes.`,
            };
          }

          const backupTarget = `${input.owner}/${backupName}`;
          const archived = await api(`/repos/${backupTarget}`, {
            method: "PATCH",
            body: JSON.stringify({ archived: true }),
          });
          if (!archived.ok) {
            const restored = await api(`/repos/${backupTarget}`, {
              method: "PATCH",
              body: JSON.stringify({ name: input.repo }),
            });
            return {
              ok: false,
              error:
                `${await fail(archived, `arquivar o backup técnico ${backupTarget}`)}. ` +
                (restored.ok
                  ? "O nome original foi restaurado com segurança."
                  : `A restauração também falhou: ${await fail(restored, `restaurar ${target}`)}`),
            };
          }

          const created = await api(`/repos/${master}/generate`, {
            method: "POST",
            body: JSON.stringify({
              owner: input.owner,
              name: input.repo,
              private: true,
              include_all_branches: false,
              description: "Instalação Unitos gerada a partir do MASTER",
            }),
          });
          if (!created.ok) {
            // Não consulta o slug antigo antes do rollback: o GitHub redireciona
            // nomes renomeados e poderia produzir um falso positivo. Tenta a
            // restauração diretamente; conflito significa que a geração criou o
            // destino apesar da resposta de erro, então o backup fica preservado.
            const unarchived = await api(`/repos/${backupTarget}`, {
              method: "PATCH",
              body: JSON.stringify({ archived: false }),
            });
            const restored = unarchived.ok
              ? await api(`/repos/${backupTarget}`, {
                  method: "PATCH",
                  body: JSON.stringify({ name: input.repo }),
                })
              : unarchived;
            const rollback = restored.ok
              ? "O nome original foi restaurado com segurança."
              : `O backup foi preservado, mas a restauração automática falhou: ${await fail(restored, `restaurar ${target}`)}`;
            return {
              ok: false,
              error:
                `${await fail(created, `gerar a cópia completa ${target} a partir de ${master}`)}. ` +
                `${rollback} Nenhum repositório foi excluído.`,
            };
          }

          for (let attempt = 0; attempt < 12; attempt += 1) {
            const generatedHead = await api(`/repos/${target}/commits/${branch}`, undefined, true);
            if (generatedHead.ok) {
              const body = (await generatedHead.json().catch(() => ({}))) as { sha?: string };
              if (body.sha) {
                return {
                  ok: true,
                  created: true,
                  via: "template_recovered",
                  repoSlug: target,
                  commitSha: body.sha,
                };
              }
            }
            await sleep(1_000);
          }
          return {
            ok: false,
            error: `A cópia completa de ${master} foi solicitada, mas a branch ${branch} de ${target} ainda não ficou disponível. O backup técnico ${backupTarget} permanece arquivado. Tente retomar em alguns instantes.`,
          };
        } else if (existing.status !== 404) {
          return { ok: false, error: await fail(existing, `consultar o repositório ${target}`) };
        }

        const masterInfo = await api(`/repos/${master}`);
        if (!masterInfo.ok) {
          return { ok: false, error: await fail(masterInfo, `ler o template ${master}`) };
        }
        const masterBody = (await masterInfo.json().catch(() => ({}))) as {
          is_template?: boolean;
        };
        if (!masterBody.is_template) {
          return {
            ok: false,
            error: `${master} não está marcado como Template repository no GitHub. Ative essa opção no MASTER antes de provisionar. Nenhum repositório vazio foi criado.`,
          };
        }

        // Único caminho para instalação nova: o GitHub gera uma cópia integral.
        const created = await api(`/repos/${master}/generate`, {
          method: "POST",
          body: JSON.stringify({
            owner: input.owner,
            name: input.repo,
            private: true,
            include_all_branches: false,
            description: "Instalação Unitos gerada a partir do MASTER",
          }),
        });
        if (!created.ok) {
          return {
            ok: false,
            error:
              `${await fail(created, `gerar a cópia completa ${target} a partir de ${master}`)}. ` +
              `O token precisa de Administração: leitura e gravação na organização ${input.owner}. ` +
              `Nenhum repositório vazio foi criado.`,
          };
        }

        // A geração pode responder antes da branch existir. Só libera a próxima
        // etapa quando o código completo e a versão estiverem legíveis.
        for (let attempt = 0; attempt < 12; attempt += 1) {
          const head = await api(`/repos/${target}/commits/${branch}`, undefined, true);
          if (head.ok) {
            const body = (await head.json().catch(() => ({}))) as { sha?: string };
            if (body.sha) {
              return {
                ok: true,
                created: true,
                via: "template",
                commitSha: body.sha,
              };
            }
          }
          await sleep(1_000);
        }
        return {
          ok: false,
          error: `A cópia completa de ${master} foi solicitada, mas a branch ${branch} de ${target} ainda não ficou disponível. Tente retomar em alguns instantes.`,
        };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    },

    async masterHeadSha() {
      try {
        const res = await api(`/repos/${master}/commits/${branch}`);
        if (!res.ok) return { ok: false, error: await fail(res, "ler o commit do MASTER") };
        const body = (await res.json().catch(() => ({}))) as { sha?: string };
        if (!body.sha) return { ok: false, error: "commit do MASTER não retornado" };
        return { ok: true, sha: body.sha };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    },

    async releaseAtCommit(sha) {
      try {
        const path = "supabase/baseline-snapshot/tools/delta_version.txt";
        const file = await readMasterFileAtCommit(path, sha);
        if (!file.ok) return file;
        const raw = file.content;
        const match = /^\s*version\s*=\s*(\S+)\s*$/m.exec(raw);
        if (!match?.[1]) return { ok: false, error: "versão do pacote não encontrada no commit" };
        return { ok: true, version: match[1] };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    },

    async releaseSnapshotAtCommit(sha) {
      try {
        const [versionFile, deltaFile, manifestFile] = await Promise.all([
          readMasterFileAtCommit("supabase/baseline-snapshot/tools/delta_version.txt", sha),
          readMasterFileAtCommit("supabase/baseline-snapshot/007_delta_migrations.sql", sha),
          readMasterFileAtCommit("supabase/baseline-snapshot/tools/delta_manifest.txt", sha),
        ]);
        if (!versionFile.ok) return versionFile;
        if (!deltaFile.ok) return deltaFile;
        if (!manifestFile.ok) return manifestFile;
        const version = /^\s*version\s*=\s*(\S+)\s*$/m.exec(versionFile.content)?.[1];
        const declaredSha = /^\s*sha256\s*=\s*([0-9a-f]{64})\s*$/im
          .exec(versionFile.content)?.[1]
          ?.toLowerCase();
        if (!version || !declaredSha)
          return { ok: false, error: "metadados do pacote autorizado estão incompletos" };
        const digest = await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(deltaFile.content),
        );
        const actualSha = Array.from(new Uint8Array(digest))
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join("");
        if (actualSha !== declaredSha)
          return { ok: false, error: "assinatura do pacote autorizado não confere" };
        const total = splitDeltaMigrations(deltaFile.content).length;
        if (total === 0)
          return { ok: false, error: "pacote autorizado não contém migrations válidas" };
        const manifestCheck = await validateDeltaManifest(manifestFile.content, deltaFile.content);
        if (!manifestCheck.ok) return { ok: false, error: manifestCheck.error };
        return {
          ok: true,
          version,
          sha256: actualSha,
          total,
          sql: deltaFile.content,
          manifest: manifestFile.content,
        };
      } catch (error) {
        return { ok: false, error: (error as Error).message };
      }
    },

    async installedRelease() {
      try {
        const headRes = await api(`/repos/${target}/commits/${branch}`);
        if (!headRes.ok) {
          return { ok: false, error: await fail(headRes, "ler o commit da instalação") };
        }
        const headBody = (await headRes.json().catch(() => ({}))) as { sha?: string };
        if (!headBody.sha) return { ok: false, error: "commit da instalação não retornado" };
        const path = "supabase/baseline-snapshot/tools/delta_version.txt";
        const res = await api(
          `/repos/${target}/contents/${path}?ref=${encodeURIComponent(headBody.sha)}`,
        );
        if (!res.ok) {
          return { ok: false, error: await fail(res, "ler a versão publicada na instalação") };
        }
        const body = (await res.json().catch(() => ({}))) as {
          content?: string;
          encoding?: string;
        };
        const raw =
          body.encoding === "base64" && body.content
            ? new TextDecoder().decode(
                Uint8Array.from(atob(body.content.replace(/\s+/g, "")), (c) => c.charCodeAt(0)),
              )
            : (body.content ?? "");
        const match = /^\s*version\s*=\s*(\S+)\s*$/m.exec(raw);
        if (!match?.[1]) {
          return {
            ok: false,
            error: "versão do pacote não encontrada no repositório da instalação",
          };
        }
        return { ok: true, version: match[1], sha: headBody.sha };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    },

    async nudgeDeploy(message) {
      // Commit vazio na branch de produção do repositório DA INSTALAÇÃO: a
      // integração Git da Vercel publica sem consumir a cota de deployments
      // por API do plano gratuito.
      try {
        const refRes = await api(`/repos/${target}/git/ref/heads/${branch}`);
        if (!refRes.ok) return { ok: false, error: await fail(refRes, "ler a branch do destino") };
        const refBody = (await refRes.json().catch(() => ({}))) as { object?: { sha?: string } };
        const headSha = refBody.object?.sha;
        if (!headSha) return { ok: false, error: "HEAD do destino não retornado" };

        const commitRes = await api(`/repos/${target}/git/commits/${headSha}`);
        if (!commitRes.ok) {
          return { ok: false, error: await fail(commitRes, "ler o commit do destino") };
        }
        const commitBody = (await commitRes.json().catch(() => ({}))) as {
          tree?: { sha?: string };
        };
        const treeSha = commitBody.tree?.sha;
        if (!treeSha) return { ok: false, error: "árvore do commit do destino não retornada" };

        const created = await api(`/repos/${target}/git/commits`, {
          method: "POST",
          body: JSON.stringify({
            message:
              (message ?? "").trim() || "chore(unitos): republicar com variáveis atualizadas",
            tree: treeSha,
            parents: [headSha],
          }),
        });
        if (!created.ok)
          return { ok: false, error: await fail(created, "criar o commit de publicação") };
        const newSha = ((await created.json().catch(() => ({}))) as { sha?: string }).sha;
        if (!newSha) return { ok: false, error: "commit de publicação não retornado" };

        const updated = await api(`/repos/${target}/git/refs/heads/${branch}`, {
          method: "PATCH",
          body: JSON.stringify({ sha: newSha, force: false }),
        });
        if (!updated.ok)
          return { ok: false, error: await fail(updated, "atualizar a branch do destino") };
        return { ok: true, commitSha: newSha };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    },
    async publishSnapshot(sha, options) {
      const opts: PublishSnapshotOptions =
        typeof options === "function" ? { onProgress: options } : (options ?? {});
      const onProgress = opts.onProgress;
      const startedAt = Date.now();
      const budgetMs = opts.timeBudgetMs ?? 0;
      const outOfTime = () => budgetMs > 0 && Date.now() - startedAt > budgetMs;
      const blobMap: Record<string, string> = { ...(opts.blobMap ?? {}) };

      // Throttle: um report por ~2% evita centenas de escritas em repositórios
      // grandes sem perder a sensação de tempo real.
      let lastNotified = -5;
      const notify = async (percent: number, detail: string) => {
        const rounded = Math.max(0, Math.min(99, Math.round(percent)));
        if (rounded < 99 && rounded - lastNotified < 2) return;
        lastNotified = rounded;
        try {
          await onProgress?.({ percent: rounded, detail });
        } catch {
          // progresso é informativo: nunca interrompe a publicação.
        }
      };
      const checkpoint = async () => {
        try {
          await opts.onCheckpoint?.({ ...blobMap });
        } catch {
          // checkpoint é otimização: perder não invalida a publicação.
        }
      };
      try {
        await notify(2, "lendo a árvore do MASTER");
        const tree = async (repo: string, ref: string) => {
          const res = await api(`/repos/${repo}/git/trees/${ref}?recursive=1`, undefined, true);
          if (!res.ok)
            return { ok: false as const, error: await fail(res, `ler a árvore de ${repo}`) };
          const body = (await res.json().catch(() => ({}))) as {
            sha?: string;
            tree?: TreeEntry[];
          };
          return {
            ok: true as const,
            rootSha: body.sha ?? null,
            entries: (body.tree ?? []).filter((e) => e.type === "blob"),
          };
        };

        const source = await tree(master, sha);
        if (!source.ok) return { ok: false, error: source.error };

        const readHead = async () => {
          const res = await api(`/repos/${target}/git/ref/heads/${branch}`);
          if (res.ok) {
            const body = (await res.json().catch(() => ({}))) as { object?: { sha?: string } };
            return { ok: true as const, sha: body.object?.sha ?? null };
          }
          if (res.status === 404 || res.status === 409) return { ok: true as const, sha: null };
          return {
            ok: false as const,
            error: await fail(res, `ler a branch ${branch} de ${target}`),
          };
        };

        const first = await readHead();
        if (!first.ok) return { ok: false, error: first.error };
        let parent: string | null = first.sha;

        // Repositório recém-criado sem commits: a API de blobs recusa (409
        // "Git Repository is empty"). Criamos o commit inicial pela API de
        // conteúdo, que é a única que funciona em repositório vazio.
        if (!parent) {
          const seed = await api(`/repos/${target}/contents/README.md`, {
            method: "PUT",
            body: JSON.stringify({
              message: "Unitos: inicializar repositório da instalação",
              content: Buffer.from(
                `# ${input.repo}\n\nInstalação Unitos. Código publicado a partir do MASTER.\n`,
                "utf8",
              ).toString("base64"),
              branch,
            }),
          });
          if (!seed.ok && seed.status !== 422) {
            return { ok: false, error: await fail(seed, `inicializar ${target}`) };
          }
          const again = await readHead();
          if (!again.ok) return { ok: false, error: again.error };
          parent = again.sha;
        }

        const destination = parent
          ? await tree(target, parent)
          : { ok: true as const, entries: [] };
        if (!destination.ok) return { ok: false, error: destination.error };

        const current = new Map(destination.entries.map((e) => [e.path ?? "", e.sha ?? ""]));

        const changed = source.entries.filter((e) => current.get(e.path ?? "") !== e.sha);
        const removed = destination.entries
          .filter((e) => !source.entries.some((s) => s.path === e.path))
          .map((e) => e.path ?? "");
        if (!changed.length && !removed.length && parent) {
          return { ok: true, commitSha: parent, changed: 0 };
        }
        if (opts.dryRun) {
          return {
            ok: true,
            commitSha: parent ?? undefined,
            changed: changed.length + removed.length,
          };
        }

        const removalEntries = removed.map((path) => ({
          path,
          mode: "100644",
          type: "blob",
          sha: null,
        }));

        /**
         * Cópia dos blobs para o destino, em paralelo controlado, com
         * checkpoint por lote e orçamento de tempo.
         */
        const copiedEntries = async (): Promise<
          | {
              ok: true;
              partial: true;
              changed: number;
              waitUntil?: string | null;
              note?: string;
            }
          | { ok: true; entries: Array<Record<string, unknown>> }
          | { ok: false; error: string }
        > => {
          const entries: Array<Record<string, unknown>> = [];
          const pending = changed.filter((f) => !blobMap[f.sha ?? ""]);
          const BATCH = 100;
          const CONCURRENCY = 8;
          let copied = 0;
          for (let i = 0; i < pending.length; i += BATCH) {
            const batch = pending.slice(i, i + BATCH);
            let cursor = 0;
            let batchError: string | null = null;
            const worker = async () => {
              for (;;) {
                const index = cursor;
                cursor += 1;
                const file = batch[index];
                if (!file || batchError) return;
                const blob = await api(`/repos/${master}/git/blobs/${file.sha}`, undefined, true);
                if (!blob.ok) {
                  batchError = await fail(blob, `ler ${file.path} do MASTER`);
                  return;
                }
                const body = (await blob.json().catch(() => ({}))) as {
                  content?: string;
                  encoding?: string;
                };
                const created = await api(
                  `/repos/${target}/git/blobs`,
                  {
                    method: "POST",
                    body: JSON.stringify({
                      content: body.content ?? "",
                      encoding: body.encoding ?? "base64",
                    }),
                  },
                  true,
                );
                if (!created.ok) {
                  batchError = await fail(created, `publicar ${file.path} em ${target}`);
                  return;
                }
                const json = (await created.json().catch(() => ({}))) as { sha?: string };
                if (json.sha) blobMap[file.sha ?? ""] = json.sha;
                copied += 1;
                // 5%–90% da etapa: cópia dos arquivos que diferem.
                await notify(
                  5 + (copied / Math.max(pending.length, 1)) * 85,
                  `${copied}/${pending.length} arquivos publicados`,
                );
              }
            };
            await Promise.all(
              Array.from({ length: Math.min(CONCURRENCY, batch.length) }, () => worker()),
            );
            if (batchError) {
              await checkpoint();
              // Limite de uso do GitHub não é falha: devolve retomável com o
              // horário de liberação; o progresso já copiado é preservado.
              if (rateLimit) {
                return {
                  ok: true,
                  partial: true,
                  changed: copied,
                  waitUntil: rateLimit.resetAt
                    ? new Date(rateLimit.resetAt * 1000).toISOString()
                    : null,
                  note: batchError,
                };
              }
              return { ok: false, error: batchError };
            }
            await checkpoint();
            if (outOfTime() && i + BATCH < pending.length) {
              // Devolve o controle: o watchdog retoma exatamente daqui.
              return { ok: true, partial: true, changed: copied };
            }
          }
          for (const file of changed) {
            const mapped = blobMap[file.sha ?? ""];
            if (!mapped) {
              return { ok: false, error: `blob de ${file.path} não publicado em ${target}` };
            }
            entries.push({
              path: file.path,
              mode: file.mode ?? "100644",
              type: "blob",
              sha: mapped,
            });
          }
          return { ok: true, entries };
        };

        // Caminho rápido: repositórios relacionados compartilham a árvore raiz do
        // MASTER. Reutilizá-la elimina o POST gigante de milhares de entradas e
        // preserva o snapshot exato, inclusive remoções.
        let sharedObjects = Boolean(source.rootSha);
        if (source.rootSha) {
          const check = await api(`/repos/${target}/git/trees/${source.rootSha}`, undefined, true);
          sharedObjects = check.ok;
        }

        let entries: Array<Record<string, unknown>>;
        let treeSha: string | null = sharedObjects ? source.rootSha : null;
        if (sharedObjects) {
          await notify(80, `${changed.length} arquivos reaproveitados do MASTER`);
          entries = [];
        } else {
          const copied = await copiedEntries();
          if (!copied.ok) return { ok: false, error: copied.error };
          if ("partial" in copied) return copied;
          entries = copied.entries;
        }

        await notify(92, "montando a árvore do repositório");
        const buildTree = async (list: Array<Record<string, unknown>>) =>
          api(
            `/repos/${target}/git/trees`,
            {
              method: "POST",
              body: JSON.stringify(
                parent
                  ? { base_tree: parent, tree: [...list, ...removalEntries] }
                  : { tree: [...list, ...removalEntries] },
              ),
            },
            true,
          );

        if (!treeSha) {
          const newTree = await buildTree(entries);
          if (!newTree.ok)
            return { ok: false, error: await fail(newTree, `montar a árvore de ${target}`) };
          const treeJson = (await newTree.json().catch(() => ({}))) as { sha?: string };
          treeSha = treeJson.sha ?? null;
        }
        if (!treeSha) return { ok: false, error: `árvore de ${target} não retornada` };

        await notify(96, "criando o commit da versão");
        const commit = await api(`/repos/${target}/git/commits`, {
          method: "POST",
          body: JSON.stringify({
            message: `Unitos: publicar versão do MASTER (${sha.slice(0, 7)})`,
            tree: treeSha,
            parents: parent ? [parent] : [],
          }),
        });
        if (!commit.ok)
          return { ok: false, error: await fail(commit, `criar o commit em ${target}`) };
        const commitJson = (await commit.json().catch(() => ({}))) as { sha?: string };

        const refPath = `/repos/${target}/git/refs`;
        const update = parent
          ? await api(`${refPath}/heads/${branch}`, {
              method: "PATCH",
              body: JSON.stringify({ sha: commitJson.sha, force: true }),
            })
          : await api(refPath, {
              method: "POST",
              body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: commitJson.sha }),
            });
        if (!update.ok) {
          return {
            ok: false,
            error: await fail(update, `atualizar a branch ${branch} de ${target}`),
          };
        }
        return { ok: true, commitSha: commitJson.sha, changed: changed.length + removed.length };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    },
  };
}

export function createDeployClient(input: {
  token: string;
  project: string;
  teamId?: string | null;
  /** `org/repo` do código do MASTER; default `DEFAULT_MASTER_REPO`. */
  masterRepo?: string | null;
  /** `owner/repo` DA INSTALAÇÃO — repositório que o deploy realmente constrói. */
  repo?: string | null;
  /** Token do GitHub — necessário para ler o commit do MASTER (repo privado). */
  githubToken?: string | null;
  fetchImpl?: Fetcher;
}): DeployClient {
  const doFetch = input.fetchImpl ?? fetch;
  let resolvedTeamId = (input.teamId ?? "").trim() || null;
  let resolvedProjectId: string | null = null;
  const qs = (extra?: string) =>
    [resolvedTeamId ? `teamId=${encodeURIComponent(resolvedTeamId)}` : "", extra]
      .filter(Boolean)
      .join("&");
  const headers = {
    authorization: `Bearer ${input.token}`,
    "content-type": "application/json",
  };
  let resolvedProjectName = input.project;
  const projectPath = () => encodeURIComponent(resolvedProjectId ?? resolvedProjectName);
  const masterRepo = (input.masterRepo ?? "").trim() || DEFAULT_MASTER_REPO;
  const targetRepo = (input.repo ?? "").trim() || masterRepo;

  /**
   * Tokens da Vercel podem enxergar projetos pessoais e de várias equipes. A
   * API responde 403/404 quando o projeto pertence a uma equipe e a consulta
   * omite (ou traz um Team ID antigo). Descobrimos esse escopo uma vez e o
   * reutilizamos em vínculo, variáveis e deployment.
   */
  const fetchProject = async (): Promise<Response> => {
    const request = (teamId: string | null) => {
      const suffix = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
      return doFetch(`https://api.vercel.com/v9/projects/${projectPath()}${suffix}`, { headers });
    };
    const initial = await request(resolvedTeamId);
    if (initial.ok || (initial.status !== 403 && initial.status !== 404)) return initial;

    // Cadastros antigos podem ter sido salvos sem um separador do slug
    // (ex.: unitos-casa8), enquanto o projeto real é unitos-casa-8. Procuramos
    // apenas uma equivalência canônica única entre os projetos visíveis; nunca
    // escolhemos por similaridade aproximada.
    const canonical = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
    const requestedCanonical = canonical(input.project);
    const discoverEquivalent = async (teamId: string | null): Promise<Response | null> => {
      const suffix = teamId ? `&teamId=${encodeURIComponent(teamId)}` : "";
      const list = await doFetch(`https://api.vercel.com/v9/projects?limit=100${suffix}`, {
        headers,
      }).catch(() => null);
      if (!list?.ok) return null;
      const body = (await list.json().catch(() => ({}))) as {
        projects?: Array<{ name?: string }>;
      };
      const matches = (body.projects ?? [])
        .map((candidate) => (candidate.name ?? "").trim())
        .filter((name) => name && canonical(name) === requestedCanonical);
      if (matches.length !== 1 || matches[0] === input.project) return null;
      resolvedProjectName = matches[0];
      const matched = await request(teamId);
      if (matched.ok) {
        resolvedTeamId = teamId;
        return matched;
      }
      resolvedProjectName = input.project;
      return null;
    };

    const personalMatch = await discoverEquivalent(resolvedTeamId);
    if (personalMatch) return personalMatch;

    const teams = await doFetch("https://api.vercel.com/v2/teams?limit=100", { headers }).catch(
      () => null,
    );
    if (!teams?.ok) return initial;
    const payload = (await teams.json().catch(() => ({}))) as {
      teams?: Array<{ id?: string }>;
    };
    for (const candidate of payload.teams ?? []) {
      const teamId = (candidate.id ?? "").trim();
      if (!teamId || teamId === resolvedTeamId) continue;
      const scoped = await request(teamId);
      if (scoped.ok) {
        resolvedTeamId = teamId;
        return scoped;
      }
      const equivalent = await discoverEquivalent(teamId);
      if (equivalent) return equivalent;
    }
    return initial;
  };

  const projectAccessError = async (res: Response) => {
    const detail = (await res.text().catch(() => "")).slice(0, 200);
    // A Vercel devolve `invalidToken: true` quando o próprio token não vale
    // mais (revogado/expirado/copiado incompleto) — mesmo com status 403. Nesse
    // caso não é questão de equipe nem de permissão no projeto.
    const invalidToken = /"invalidToken"\s*:\s*true/.test(detail);
    const hint =
      res.status === 401 || invalidToken
        ? "o token de publicação é inválido, expirado ou foi revogado — gere um novo token na Vercel (Account Settings → Tokens, com escopo da equipe dona do projeto) e salve-o novamente em Acessos"
        : res.status === 403 || res.status === 404
          ? "o token não acessa o projeto em nenhuma equipe visível; confirme a conta dona do projeto e a permissão do token"
          : "consulta recusada pela Vercel";
    return `HTTP ${res.status} ao consultar o projeto de deploy — ${hint}${detail ? ` (${detail})` : ""}`;
  };

  const readProjectBody = async (res: Response) =>
    (await res.json().catch(() => ({}))) as {
      id?: string;
      name?: string;
      accountId?: string;
      link?: {
        type?: string;
        repo?: string;
        org?: string;
        productionBranch?: string;
        sourceless?: boolean;
      };
      gitRepository?: { type?: string; repo?: string; productionBranch?: string };
    };

  const linkedRepo = (body: Awaited<ReturnType<typeof readProjectBody>>) =>
    (
      body.gitRepository?.repo ??
      `${body.link?.org ?? ""}/${body.link?.repo ?? ""}`.replace(/^\//, "")
    )
      .trim()
      .toLowerCase();

  const resolveCreationTeam = async (checkpointTeam?: string | null) => {
    const expected = (checkpointTeam ?? resolvedTeamId ?? "").trim();
    if (expected) return { ok: true as const, teamId: expected };
    const user = await doFetch("https://api.vercel.com/v2/user", { headers }).catch(() => null);
    if (!user?.ok) {
      return {
        ok: false as const,
        error:
          "não foi possível determinar o team da Vercel; configure UNITOS_VERCEL_TEAM_ID com o Team ID autorizado",
      };
    }
    const payload = (await user.json().catch(() => ({}))) as {
      user?: { defaultTeamId?: string };
    };
    const teamId = (payload.user?.defaultTeamId ?? "").trim();
    if (!teamId) {
      return {
        ok: false as const,
        error:
          "o token não possui team padrão; configure UNITOS_VERCEL_TEAM_ID com o Team ID autorizado",
      };
    }
    return { ok: true as const, teamId };
  };

  const client: DeployClient = {
    async ensureProject(repo, checkpoint) {
      const expectedRepo = repo.trim().toLowerCase();
      if (!expectedRepo || !expectedRepo.includes("/")) {
        return { ok: false, error: "repositório GitHub inválido para criar o projeto Vercel" };
      }
      try {
        const team = await resolveCreationTeam(checkpoint?.teamId);
        if (!team.ok) return team;
        const expectedTeamId = team.teamId;
        resolvedTeamId = expectedTeamId;
        const requestedProject = (checkpoint?.projectId ?? input.project).trim();
        const scopedPath = encodeURIComponent(requestedProject);
        const scoped = await doFetch(
          `https://api.vercel.com/v9/projects/${scopedPath}?teamId=${encodeURIComponent(expectedTeamId)}`,
          { headers },
        );

        let created = false;
        let response = scoped;
        if (!scoped.ok && scoped.status !== 404) {
          return { ok: false, error: await projectAccessError(scoped) };
        }

        if (scoped.status === 404) {
          // Um nome igual em outro team não pode ser adotado nem recriado às
          // cegas. Verificamos somente escopos visíveis e bloqueamos o conflito.
          const teams = await doFetch("https://api.vercel.com/v2/teams?limit=100", { headers });
          if (!teams.ok) {
            return {
              ok: false,
              error: `HTTP ${teams.status} ao confirmar o team autorizado para criar o projeto`,
            };
          }
          const teamsBody = (await teams.json().catch(() => ({}))) as {
            teams?: Array<{ id?: string }>;
          };
          const visibleTeamIds = (teamsBody.teams ?? [])
            .map((candidate) => (candidate.id ?? "").trim())
            .filter(Boolean);
          if (!visibleTeamIds.includes(expectedTeamId)) {
            return {
              ok: false,
              error: `o token Vercel não acessa o team configurado ${expectedTeamId}; use um token com escopo desse team e permissão Create Project`,
            };
          }
          for (const otherTeamId of visibleTeamIds) {
            if (otherTeamId === expectedTeamId) continue;
            const conflict = await doFetch(
              `https://api.vercel.com/v9/projects/${encodeURIComponent(input.project)}?teamId=${encodeURIComponent(otherTeamId)}`,
              { headers },
            );
            if (conflict.ok) {
              return {
                ok: false,
                error: `o projeto ${input.project} já existe em outro team Vercel; a NEW não pode adotá-lo nem criar duplicado`,
              };
            }
          }

          response = await doFetch(
            `https://api.vercel.com/v11/projects?teamId=${encodeURIComponent(expectedTeamId)}`,
            {
              method: "POST",
              headers,
              body: JSON.stringify({
                name: input.project,
                gitRepository: { type: "github", repo },
              }),
            },
          );
          if (!response.ok) {
            const detail = (await response.text().catch(() => "")).slice(0, 300);
            const permission = response.status === 401 || response.status === 403;
            return {
              ok: false,
              error: permission
                ? `HTTP ${response.status} ao criar o projeto Vercel — o token precisa ter escopo do team ${expectedTeamId} e permissão Create Project (${detail})`
                : `HTTP ${response.status} ao criar o projeto Vercel (${detail})`,
            };
          }
          created = true;
        }

        const body = await readProjectBody(response);
        const projectId = (body.id ?? "").trim();
        const accountId = (body.accountId ?? "").trim();
        if (!projectId) return { ok: false, error: "a Vercel não retornou o ID do projeto" };
        if (!accountId || accountId !== expectedTeamId) {
          return {
            ok: false,
            error: `ownership do projeto Vercel não confere com o team autorizado ${expectedTeamId}`,
          };
        }
        const currentRepo = linkedRepo(body);
        if (currentRepo && currentRepo !== expectedRepo) {
          return {
            ok: false,
            error: `o projeto Vercel ${body.name ?? input.project} está ligado a ${currentRepo}, não ao repositório esperado ${repo}`,
          };
        }
        resolvedProjectId = projectId;
        resolvedProjectName = (body.name ?? input.project).trim();
        return {
          ok: true,
          projectId,
          teamId: expectedTeamId,
          projectName: resolvedProjectName,
          created,
          repositoryLinked:
            currentRepo === expectedRepo &&
            (body.gitRepository?.productionBranch ?? body.link?.productionBranch ?? "main") ===
              "main" &&
            body.link?.sourceless !== true,
        };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : "falha na Vercel" };
      }
    },
    async deploymentUrl() {
      try {
        const res = await fetchProject();
        if (!res.ok) {
          return { ok: false, error: await projectAccessError(res) };
        }
        const body = (await res.json().catch(() => ({}))) as {
          name?: string;
          alias?: Array<{ domain?: string }>;
          targets?: { production?: { url?: string; alias?: string[] } };
        };
        const production = body.targets?.production;
        const candidate =
          production?.alias?.[0] ??
          production?.url ??
          body.alias?.[0]?.domain ??
          (body.name ? `${body.name}.vercel.app` : undefined);
        if (!candidate) {
          return { ok: false, error: "o deploy ainda não expôs uma URL pública" };
        }
        return {
          ok: true,
          url: candidate.startsWith("http") ? candidate : `https://${candidate}`,
          projectName: (body.name ?? resolvedProjectName).trim(),
        };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    },
    async redeploy() {
      try {
        const list = await doFetch(
          `https://api.vercel.com/v6/deployments?${qs(`app=${projectPath()}&target=production&limit=1`)}`,
          { headers },
        );
        if (!list.ok) {
          return { ok: false, error: `HTTP ${list.status} ao listar deployments` };
        }
        const body = (await list.json().catch(() => ({}))) as {
          deployments?: Array<{ uid?: string; name?: string }>;
        };
        const latest = body.deployments?.[0];
        if (!latest?.uid) {
          return { ok: false, error: "nenhum deployment de producao encontrado para redeploy" };
        }
        const res = await doFetch(`https://api.vercel.com/v13/deployments?${qs("forceNew=1")}`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            name: latest.name ?? input.project,
            deploymentId: latest.uid,
            target: "production",
          }),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          return {
            ok: false,
            error: `HTTP ${res.status} ao disparar redeploy (${text.slice(0, 200)})`,
          };
        }
        const created = (await res.json().catch(() => ({}))) as { id?: string; uid?: string };
        return { ok: true, deploymentId: created.id ?? created.uid };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    },
    async setAutoDeploy(enabled) {
      // Contrato atual da Vercel: deploymentPolicy controla quais origens podem
      // iniciar deployments. Bloqueamos apenas pushes Git; deployments explícitos
      // pela REST API continuam permitidos para atualizações autorizadas no MASTER.
      const body = {
        deploymentPolicy: {
          deploymentSources: [
            {
              enabled,
              environments: [
                { type: "system", target: "production" },
                { type: "system", target: "preview" },
              ],
              sources: ["git"],
            },
          ],
        },
      };
      try {
        const res = await doFetch(
          `https://api.vercel.com/v9/projects/${projectPath()}?${qs()}`.replace(/\?$/, ""),
          { method: "PATCH", headers, body: JSON.stringify(body) },
        );
        if (res.ok) return { ok: true };
        const text = await res.text().catch(() => "");
        // Planos Hobby não têm política de deployment: seguimos com o build
        // automático ligado em vez de bloquear o provisionamento.
        if (res.status === 403 && /pro_plan_required|not available for Hobby/i.test(text)) {
          return {
            ok: true,
            unsupported: true,
            error: "plano da Vercel não permite política de deployment (auto-deploy segue ligado)",
          };
        }
        return {
          ok: false,
          error: `HTTP ${res.status} ao ajustar o build automático (${text.slice(0, 200)})`,
        };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    },

    async linkRepository(repo, options) {
      const slug = (repo ?? "").trim() || targetRepo;
      try {
        const res = await fetchProject();
        if (!res.ok) {
          return { ok: false, error: await projectAccessError(res) };
        }
        const body = (await res.json().catch(() => ({}))) as {
          id?: string;
          link?: { repo?: string; org?: string; sourceless?: boolean };
        };
        const id = encodeURIComponent(body.id ?? input.project);
        const current = `${body.link?.org ?? ""}/${body.link?.repo ?? ""}`.toLowerCase();
        // `force` religa mesmo quando o slug já é o correto: é o caso do vínculo
        // "sourceless", em que o repositório aparece ligado sem disparar builds.
        const branch = body.link?.productionBranch ?? "main";
        if (current === slug.toLowerCase() && branch === "main" && !options?.force) {
          return { ok: true };
        }

        if (body.link?.repo) {
          await doFetch(
            `https://api.vercel.com/v9/projects/${id}/link?${qs()}`.replace(/\?$/, ""),
            {
              method: "DELETE",
              headers,
            },
          );
        }
        const linked = await doFetch(
          `https://api.vercel.com/v10/projects/${id}/link?${qs()}`.replace(/\?$/, ""),
          {
            method: "POST",
            headers,
            body: JSON.stringify({ type: "github", repo: slug, gitBranch: "main" }),
          },
        );
        if (!linked.ok) {
          const text = await linked.text().catch(() => "");
          return {
            ok: false,
            error: `HTTP ${linked.status} ao ligar o projeto ao repositório ${slug} (${text.slice(0, 200)})`,
          };
        }
        const branchUpdate = await doFetch(
          `https://api.vercel.com/v9/projects/${id}?${qs()}`.replace(/\?$/, ""),
          {
            method: "PATCH",
            headers,
            body: JSON.stringify({ gitRepository: { productionBranch: "main" } }),
          },
        );
        if (!branchUpdate.ok) {
          const text = await branchUpdate.text().catch(() => "");
          return {
            ok: false,
            error: `HTTP ${branchUpdate.status} ao configurar a branch main (${text.slice(0, 200)})`,
          };
        }
        return { ok: true };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    },
    async latestCommit() {
      // O repositório do MASTER é privado: sem o token do GitHub a API responde
      // 403. Melhor dizer o que falta do que devolver um HTTP cru.
      const gh = (input.githubToken ?? "").trim();
      if (!gh) {
        return {
          ok: false,
          error:
            "Token do GitHub não configurado (UNITOS_GITHUB_TOKEN) — não é possível ler o commit do MASTER.",
        };
      }
      try {
        const res = await doFetch(`https://api.github.com/repos/${masterRepo}/commits/main`, {
          headers: {
            accept: "application/vnd.github+json",
            authorization: `Bearer ${gh}`,
            "x-github-api-version": "2022-11-28",
          },
        });
        if (!res.ok) {
          const hint =
            res.status === 403 || res.status === 404
              ? " — verifique se o token tem acesso de leitura ao repositório do MASTER"
              : "";
          return {
            ok: false,
            error: `HTTP ${res.status} ao consultar o commit do MASTER${hint}`,
          };
        }
        const body = (await res.json().catch(() => ({}))) as { sha?: string };
        if (!body.sha) return { ok: false, error: "commit do MASTER não retornado" };
        return { ok: true, sha: body.sha };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    },

    async deployLatestCode(options) {
      try {
        const readProject = async () => {
          const res = await fetchProject();
          if (!res.ok) return null;
          return (await res.json().catch(() => ({}))) as {
            id?: string;
            name?: string;
            link?: {
              type?: string;
              repoId?: number | string;
              repo?: string;
              org?: string;
              productionBranch?: string;
              /**
               * `true` = vínculo "sem fonte": o repositório aparece ligado, mas
               * os pushes NÃO disparam publicação. Precisa religar.
               */
              sourceless?: boolean;
            };
          };
        };

        let body = await readProject();
        if (!body) {
          return { ok: false, error: "não foi possível consultar o projeto de deploy" };
        }

        // O projeto precisa apontar para o repositório DA INSTALAÇÃO (o código
        // do MASTER é publicado nele). Se estiver ligado a outro repositório,
        // religa — é o que faz a atualização realmente trazer código novo.
        // Vínculo "sourceless" também é religado: sem fonte, nenhum push publica
        // e a política "apenas Git em produção" tranca a atualização.
        const current = `${body.link?.org ?? ""}/${body.link?.repo ?? ""}`.toLowerCase();
        if (current !== targetRepo.toLowerCase() || body.link?.sourceless === true) {
          // Religar pode falhar sem culpa da atualização (integração do GitHub
          // não instalada na conta). Não abortamos: a publicação ainda funciona
          // apontando a origem Git direto na chamada.
          await client.linkRepository(targetRepo, { force: true });
          body = (await readProject()) ?? body;
        }

        // O build automático da branch fica LIGADO: é a rede de segurança quando
        // a API da Vercel não consegue resolver o repositório (um push publica).
        await client.setAutoDeploy(true);

        const link = body.link;
        const [targetOrg = "", targetName = ""] = targetRepo.split("/");
        const org = (link?.org ?? "").trim() || targetOrg.trim();
        const repoName = (link?.repo ?? "").trim() || targetName.trim();
        const type = link?.type || "github";
        let repoId = link?.repoId;

        // Sem vínculo utilizável, buscamos o id do repositório no GitHub. Isso
        // mantém a atualização funcionando mesmo quando a hospedagem perdeu o
        // vínculo (antes caía em "rebuild", que republica código ANTIGO).
        if (!repoId && org && repoName && (input.githubToken ?? "").trim()) {
          const gh = await doFetch(`https://api.github.com/repos/${org}/${repoName}`, {
            headers: {
              Authorization: `Bearer ${(input.githubToken ?? "").trim()}`,
              Accept: "application/vnd.github+json",
              "User-Agent": "unitos-installer",
            },
          }).catch(() => null);
          if (gh?.ok) {
            const ghBody = (await gh.json().catch(() => ({}))) as { id?: number };
            if (ghBody.id) repoId = ghBody.id;
          }
        }

        if (!org || !repoName) {
          const fallback = await client.redeploy();
          return { ...fallback, source: "rebuild" as const };
        }
        const branch = (link?.productionBranch ?? "main").trim() || "main";
        const ref = (options?.sha ?? "").trim() || branch;

        // A Vercel aceita mais de uma forma de identificar a origem Git e nem
        // todas funcionam em todo projeto (repositório recriado, id antigo em
        // cache, app do GitHub reinstalado). Tentamos todas antes de desistir.
        const variants: Array<Record<string, unknown>> = [];
        if (repoId !== undefined && repoId !== null && String(repoId).trim()) {
          variants.push({ type, repoId: String(repoId), ref });
        }
        if (org && repoName) {
          variants.push({ type, org, repo: repoName, ref });
          variants.push({ type, repo: `${org}/${repoName}`, ref });
        }

        const attempts: string[] = [];
        let gitSourceUnavailable = false;
        for (const gitSource of variants) {
          const created = await doFetch(
            `https://api.vercel.com/v13/deployments?${qs("forceNew=1")}`,
            {
              method: "POST",
              headers,
              body: JSON.stringify({
                name: body.name ?? input.project,
                // Amarrar ao projeto por id evita publicar em um projeto novo
                // quando o vínculo do repositório está ausente.
                ...(body.id ? { project: body.id } : {}),
                target: "production",
                gitSource,
              }),
            },
          );
          if (created.ok) {
            const json = (await created.json().catch(() => ({}))) as { id?: string; uid?: string };
            return { ok: true, deploymentId: json.id ?? json.uid, source: "git" as const, ref };
          }
          const text = await created.text().catch(() => "");
          const quota = parseDeployQuotaError(created.status, text);
          if (quota.quotaExceeded) {
            return {
              ok: false,
              quotaExceeded: true,
              resetAt: quota.resetAt,
              error: "cota diária de deployments da Vercel esgotada (plano gratuito: 100/dia)",
            };
          }
          // Repositório não resolvido OU política da conta que só aceita
          // publicação disparada pelo Git: nos dois casos a saída é a mesma —
          // publicar pelo push no repositório da instalação.
          if (isGitOnlyOrMissingRepo(text)) {
            gitSourceUnavailable = true;
          }

          attempts.push(`HTTP ${created.status} (${text.slice(0, 160)})`);
        }

        return {
          ok: false,
          gitSourceUnavailable: gitSourceUnavailable || undefined,
          error: gitSourceUnavailable
            ? `a Vercel não encontrou o repositório ${org}/${repoName} ao disparar o deployment — confira se o app da Vercel no GitHub tem acesso a esse repositório (${attempts.join(" · ")})`
            : `não foi possível disparar o deployment do código (${attempts.join(" · ")})`,
        };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    },

    async ensureDomain(domain) {
      const host = (domain ?? "")
        .trim()
        .replace(/^https?:\/\//i, "")
        .replace(/\/.*$/, "");
      if (!host) return { ok: false, error: "domínio vazio" };
      try {
        const read = await doFetch(
          `https://api.vercel.com/v9/projects/${projectPath()}/domains/${encodeURIComponent(host)}?${qs()}`.replace(
            /\?$/,
            "",
          ),
          { headers },
        );
        if (read.ok) {
          const body = (await read.json().catch(() => ({}))) as { verified?: boolean };
          return { ok: true, added: false, verified: body.verified === true };
        }
        const created = await doFetch(
          `https://api.vercel.com/v10/projects/${projectPath()}/domains?${qs()}`.replace(/\?$/, ""),
          { method: "POST", headers, body: JSON.stringify({ name: host }) },
        );
        if (!created.ok) {
          const text = await created.text().catch(() => "");
          return {
            ok: false,
            error: `HTTP ${created.status} ao atribuir o domínio ${host} (${text.slice(0, 200)})`,
          };
        }
        const body = (await created.json().catch(() => ({}))) as { verified?: boolean };
        return { ok: true, added: true, verified: body.verified === true };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    },
    async deploymentState(id) {
      try {
        const res = await doFetch(
          `https://api.vercel.com/v13/deployments/${encodeURIComponent(id)}?${qs()}`.replace(
            /\?$/,
            "",
          ),
          { headers },
        );
        if (!res.ok) {
          return { ok: false, error: `HTTP ${res.status} ao consultar o deployment` };
        }
        const body = (await res.json().catch(() => ({}))) as {
          readyState?: string;
          url?: string;
          readyStateReason?: string;
          alwaysRefuseToBuild?: boolean;
          meta?: { githubCommitSha?: string };
          gitSource?: { sha?: string };
        };
        const state = body.readyState ?? undefined;
        const commitSha = body.meta?.githubCommitSha ?? body.gitSource?.sha;
        const refused = state === "BLOCKED" || body.alwaysRefuseToBuild === true;
        return {
          ok: true,
          ...(state ? { state } : {}),
          ...(body.url ? { url: `https://${body.url}` } : {}),
          ...(commitSha ? { commitSha } : {}),
          ...(body.readyStateReason ? { reason: body.readyStateReason } : {}),
          ...(refused ? { refused: true } : {}),
        };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    },

    async findProductionDeployment(commitSha) {
      try {
        const res = await doFetch(
          `https://api.vercel.com/v6/deployments?${qs(`app=${projectPath()}&target=production&limit=20`)}`,
          { headers },
        );
        if (!res.ok) {
          return { ok: false, error: `HTTP ${res.status} ao localizar o build disparado pelo Git` };
        }
        const body = (await res.json().catch(() => ({}))) as {
          deployments?: Array<{
            uid?: string;
            id?: string;
            readyState?: string;
            state?: string;
            createdAt?: number;
            url?: string;
            source?: string;
            meta?: { githubCommitSha?: string };
            gitSource?: { sha?: string };
          }>;
        };
        const expected = commitSha.trim().toLowerCase();
        const statePriority = (candidate: { readyState?: string; state?: string }) => {
          const state = candidate.readyState ?? candidate.state ?? "";
          if (state === "READY") return 0;
          if (state === "BUILDING" || state === "QUEUED" || state === "INITIALIZING") return 1;
          return 2;
        };
        const deployment = (body.deployments ?? [])
          .filter((candidate) => {
            const actual = (candidate.meta?.githubCommitSha ?? candidate.gitSource?.sha ?? "")
              .trim()
              .toLowerCase();
            // Um deployment criado pela REST API também pode carregar o SHA
            // do Git. A atualização deve acompanhar somente o deployment que
            // a integração Git criou a partir do push; caso contrário uma
            // tentativa REST bloqueada pode ser confundida com o build real.
            return actual === expected && candidate.source?.toLowerCase() === "git";
          })
          .sort((left, right) => {
            const byState = statePriority(left) - statePriority(right);
            if (byState !== 0) return byState;
            return (right.createdAt ?? 0) - (left.createdAt ?? 0);
          })[0];
        if (!deployment) return { ok: true };
        const deploymentId = deployment.uid ?? deployment.id;
        return {
          ok: true,
          ...(deploymentId ? { deploymentId } : {}),
          ...((deployment.readyState ?? deployment.state)
            ? { state: deployment.readyState ?? deployment.state }
            : {}),
          ...(deployment.url
            ? {
                url: deployment.url.startsWith("http")
                  ? deployment.url
                  : `https://${deployment.url}`,
              }
            : {}),
        };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    },

    async setEnv(entries) {
      try {
        const res = await doFetch(
          `https://api.vercel.com/v10/projects/${projectPath()}/env?${qs("upsert=true")}`,
          {
            method: "POST",
            headers,
            body: JSON.stringify(
              entries.map((e) => ({
                key: e.key,
                value: e.value,
                type: e.sensitive ? "encrypted" : "plain",
                target: ["production", "preview", "development"],
              })),
            ),
          },
        );
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          return {
            ok: false,
            applied: 0,
            error: `HTTP ${res.status} ao gravar variáveis (${text.slice(0, 200)})`,
          };
        }
        return { ok: true, applied: entries.length };
      } catch (e) {
        return { ok: false, applied: 0, error: (e as Error).message };
      }
    },
    async listEnv(plainKeys = []) {
      try {
        const res = await doFetch(
          `https://api.vercel.com/v9/projects/${projectPath()}/env?${qs("decrypt=false")}`,
          { headers },
        );
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          return {
            ok: false,
            error: `HTTP ${res.status} ao listar variáveis (${text.slice(0, 200)})`,
          };
        }
        const body = (await res.json().catch(() => ({}))) as {
          envs?: { key?: string; type?: string; value?: string }[];
        };
        const envs = body.envs ?? [];
        const keys = Array.from(new Set(envs.map((e) => e.key ?? "").filter(Boolean)));
        const wanted = new Set(plainKeys);
        const plain: Record<string, string> = {};
        for (const e of envs) {
          // Só valores plain e só das chaves pedidas: nada cifrado é exposto.
          if (e.key && wanted.has(e.key) && e.type === "plain" && typeof e.value === "string") {
            plain[e.key] = e.value;
          }
        }
        return { ok: true, keys, plain };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    },
  };

  return client;
}

/* --------------------------------------------------------------- execução */

export type AutomationInstallation = {
  id: string;
  domain: string | null;
  supabaseUrl: string | null;
  supabaseProjectRef: string | null;
  deployProject: string | null;
  /** Repositório Git DA INSTALAÇÃO (`https://github.com/owner/repo`). */
  gitRepoUrl?: string | null;
};

type Client = { from: (table: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

export type AutomationRunResult = Omit<AutomationOutcome, "result"> & {
  result: AutomationOutcome["result"] | "RUNNING";
  appUrl: string | null;
  urlSource: "custom_domain" | "deploy" | null;
  steps: { id: string; state: CheckState | "done" | "error"; detail: string | null }[];
};

/* ------------------------------------------------- checkpoint do baseline */

/** Marcador de arquivo integralmente aplicado. */
export const DONE = -1;

export const VECTOR_EXTENSION_POSTCONDITION = {
  predicateSql:
    "to_regtype('public.vector') IS NOT NULL AND EXISTS (SELECT 1 FROM pg_opclass oc JOIN pg_namespace n ON n.oid = oc.opcnamespace WHERE n.nspname = 'public' AND oc.opcname = 'vector_cosine_ops')",
  errorMessage:
    "000_extensions incompleto: public.vector ou public.vector_cosine_ops não foi confirmado",
} as const;

export async function verifyVectorExtensionPostcondition(management: {
  query: (sql: string) => Promise<{ ok: boolean; rows: unknown[]; error?: string }>;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await management.query(
    `SELECT (${VECTOR_EXTENSION_POSTCONDITION.predicateSql}) AS vector_ready`,
  );
  if (!result.ok) {
    return { ok: false, error: result.error ?? VECTOR_EXTENSION_POSTCONDITION.errorMessage };
  }
  const row = result.rows.find(
    (value): value is Record<string, unknown> => !!value && typeof value === "object",
  );
  if (row?.["vector_ready"] !== true) {
    return { ok: false, error: VECTOR_EXTENSION_POSTCONDITION.errorMessage };
  }
  return { ok: true };
}

export type BaselineProgress = Record<string, number>;

export function mergeBaselineProgress(
  existing: BaselineProgress,
  incoming: BaselineProgress,
): BaselineProgress {
  const merged = { ...existing };
  for (const [key, value] of Object.entries(incoming)) {
    const previous = merged[key];
    merged[key] = value === DONE || previous === DONE ? DONE : Math.max(previous ?? 0, value);
  }
  return merged;
}

/** Janela pequena: cada invocação faz um lote e devolve o controle ao runtime. */
export const BASELINE_STATEMENTS_PER_INVOCATION = 25;
/** Evita ultrapassar a janela segura do Worker, mas aproveita a mesma chamada. */
export const UPDATE_DATABASE_TIME_BUDGET_MS = 20_000;
export const UPDATE_DATABASE_MIGRATIONS_PER_INVOCATION = 8;

function operationUsesFencing(operation: OperationRow): boolean {
  return (
    !!operation.lease_owner &&
    typeof operation.fencing_token === "number" &&
    operation.fencing_token >= 0
  );
}

/**
 * Lê o checkpoint da instalação: a última operação (inclusive a atual) que
 * registrou progresso de baseline. Permite retomar sem reaplicar tudo.
 */
export async function readBaselineProgress(
  client: Client,
  installationId: string,
  operation: OperationRow,
): Promise<BaselineProgress> {
  const db = client as never as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (
          c: string,
          v: string,
        ) => {
          maybeSingle: () => Promise<{ data?: { detail?: unknown } | null; error?: unknown }>;
        };
      };
    };
  };
  const { data, error } = await db
    .from("installation_operations")
    .select("detail")
    .eq("id", operation.id)
    .maybeSingle();
  if (error) throw error;
  if (!data)
    throw new Error(
      `Operação da instalação ${installationId} não encontrada durante a leitura do baseline.`,
    );
  const rows = [data];
  let merged: BaselineProgress = {};
  for (const row of rows) {
    const raw = (row?.detail as { baselineProgress?: unknown } | null)?.baselineProgress;
    if (raw && typeof raw === "object") {
      const out: BaselineProgress = {};
      for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
        if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
      }
      merged = mergeBaselineProgress(merged, out);
    }
  }
  return merged;
}

/** Persiste o checkpoint no detalhe da operação (nunca contém secrets). */
export async function saveBaselineProgress(
  client: Client,
  operation: OperationRow,
  progress: BaselineProgress,
): Promise<void> {
  const { data: fresh, error: readError } = await (
    client as never as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (
            c: string,
            v: string,
          ) => {
            maybeSingle: () => Promise<{
              data?: { detail?: unknown; steps?: unknown } | null;
              error?: unknown;
            }>;
          };
        };
      };
    }
  )
    .from("installation_operations")
    .select("detail, steps")
    .eq("id", operation.id)
    .maybeSingle();
  if (readError) throw readError;
  if (!fresh) throw new Error("Operação não encontrada durante o checkpoint do baseline.");
  const existing =
    (fresh.detail as { baselineProgress?: BaselineProgress } | null)?.baselineProgress ?? {};
  const monotonic = mergeBaselineProgress(existing, progress);
  const rpc = client as never as {
    rpc: (
      name: string,
      args: Record<string, unknown>,
    ) => Promise<{ data?: unknown; error?: { message?: string } | null }>;
  };
  const { data: saved, error } = await rpc.rpc("checkpoint_installation_operation", {
    _operation_id: operation.id,
    _owner: operation.lease_owner ?? "",
    _fencing_token: operation.fencing_token ?? -1,
    // Nunca reenviar `operation.steps`: essa linha foi capturada no início da
    // execução e já causou a regressão 88→86 ao sobrescrever progresso novo.
    _steps: fresh.steps ?? [],
    _detail: {
      ...((fresh.detail ?? {}) as Record<string, unknown>),
      baselineProgress: monotonic,
    },
    _current_step: null,
    _summary: null,
    _metrics: { lastCheckpointAt: new Date().toISOString() },
  });
  if (error || saved !== true) throw new Error(error?.message ?? "lease da operação perdida");
}

/** Checkpoint das fases pós-baseline (nunca contém secrets). */
export type StageProgress = {
  deployDone?: boolean;
  appUrl?: string;
  urlSource?: string;
  frontendOk?: boolean;
  /** Código do MASTER já publicado no repositório da instalação. */
  codeDone?: boolean;
  codeSha?: string;
  codeRepo?: string;
  /** Blobs já copiados na publicação (sha do MASTER -> sha no destino). */
  codeBlobs?: Record<string, string>;
  /** Commit do MASTER que a publicação em andamento está copiando. */
  codeSourceSha?: string;

  /**
   * Deployment de atualização já criado; retomadas apenas consultam este ID.
   * `null` limpa o checkpoint (deployment recusado/abandonado).
   */
  updateDeploymentId?: string | null;

  updateDeploymentSource?: "git" | "rebuild";
  updateDeploymentRef?: string;
  /** Commit vazio criado para acionar e identificar o fallback por push Git. */
  updateGitPushCommit?: string;
  /** Versão do pacote do MASTER já publicada nesta operação (registro da versão). */
  updateRelease?: string;
  /** Release e commit imutáveis fixados para uma instalação nova. */
  provisionRelease?: string;
  /** Efeitos externos do NEW persistidos para consulta, nunca repetidos às cegas. */
  provisionVercelProjectReady?: boolean;
  provisionVercelProjectId?: string;
  provisionVercelTeamId?: string;
  provisionRepositoryLinked?: boolean;
  provisionEnvApplied?: boolean;
  provisionDeploymentId?: string;
  provisionDeploymentCommit?: string;
  provisionDeploymentState?: string;
  provisionDeploymentReadyAt?: string;
  /** Commit vazio criado para acionar e identificar o fallback Git do NEW. */
  provisionGitPushCommit?: string;
  /** Maior quantidade de migrations confirmada para o snapshot desta operação. */
  updateCompletedMigrations?: number;
};

export async function readStageProgress(
  client: Client,
  operation: OperationRow,
): Promise<StageProgress> {
  const { data, error } = await (
    client as never as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (
            c: string,
            v: string,
          ) => {
            maybeSingle: () => Promise<{ data?: { detail?: unknown } | null; error?: unknown }>;
          };
        };
      };
    }
  )
    .from("installation_operations")
    .select("detail")
    .eq("id", operation.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Operação não encontrada durante a leitura de etapa.");
  const raw = (data.detail as { stageProgress?: unknown } | null | undefined)?.stageProgress;
  if (raw && typeof raw === "object") return raw as StageProgress;
  return {};
}

export async function saveStageProgress(
  client: Client,
  operation: OperationRow,
  patch: StageProgress,
): Promise<void> {
  const { data: fresh, error: readError } = await (
    client as never as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (
            c: string,
            v: string,
          ) => {
            maybeSingle: () => Promise<{
              data?: { detail?: unknown; steps?: unknown } | null;
              error?: unknown;
            }>;
          };
        };
      };
    }
  )
    .from("installation_operations")
    .select("detail, steps")
    .eq("id", operation.id)
    .maybeSingle();
  if (readError) throw readError;
  if (!fresh) throw new Error("Operação não encontrada durante o checkpoint de etapa.");
  const detail = (fresh.detail ?? {}) as Record<string, unknown>;
  const rpc = client as never as {
    rpc: (
      name: string,
      args: Record<string, unknown>,
    ) => Promise<{ data?: unknown; error?: { message?: string } | null }>;
  };
  const { data: saved, error } = await rpc.rpc("checkpoint_installation_operation", {
    _operation_id: operation.id,
    _owner: operation.lease_owner ?? "",
    _fencing_token: operation.fencing_token ?? -1,
    _steps: fresh.steps ?? [],
    _detail: {
      ...detail,
      stageProgress: { ...((detail.stageProgress ?? {}) as StageProgress), ...patch },
    },
    _current_step: null,
    _summary: null,
    _metrics: { lastCheckpointAt: new Date().toISOString() },
  });
  if (error || saved !== true) throw new Error(error?.message ?? "lease da operação perdida");
}

async function report(
  client: Client,
  op: OperationRow,
  step: string,
  state: "running" | "done" | "error",
  detail?: string | null,
  percent?: number | null,
) {
  try {
    await applyProgressReport(client as never, op as never, {
      step,
      state,
      detail: detail ?? null,
      percent: percent ?? null,
    });
  } catch (error) {
    if (operationUsesFencing(op)) throw error;
  }
}

/* ------------------------------------------------- preflight de credenciais */

export type AccessCheck = {
  area: "database" | "deploy" | "code";
  label: string;
  ok: boolean;
  detail: string;
};

export type AccessPreflight = {
  checks: AccessCheck[];
  /** Permissão faltante: interrompe imediatamente, sem tentar publicar. */
  terminal: string | null;
  /** Instabilidade momentânea do provedor: vale tentar de novo em minutos. */
  transient: string | null;
};

/** 401/403 = permissão; 502/503/504/429 = instabilidade momentânea. */
export function classifyAccessFailure(detail: string): "permission" | "transient" | "other" {
  const text = (detail ?? "").trim();
  if (/HTTP 401|HTTP 403|rate limit|não acessa o projeto|privileges/i.test(text))
    return "permission";
  if (/HTTP 429|HTTP 50[234]|Instabilidade tempor|limitando as chamadas|timeout/i.test(text))
    return "transient";
  return "other";
}

/**
 * O GitHub responde "Resource not accessible by personal access token" sem
 * dizer qual permissão falta. Traduzimos para a ação concreta no token.
 */
export function withRepoWriteHint(detail: string, repoSlug: string): string {
  const text = (detail ?? "").trim();
  if (!/HTTP 403|not accessible by personal access token|Resource not accessible/i.test(text)) {
    return text;
  }
  if (/Contents: Read and write/i.test(text)) return text;
  return `${text} — o token do GitHub precisa de "Contents: Read and write" (e "Metadata: Read-only") com ${repoSlug} entre os repositórios autorizados. Gere/edite o token em github.com/settings/tokens e salve-o novamente nos acessos da instalação.`;
}

/**
 * Confere, na ordem em que serão usadas, se as três credenciais têm de fato as
 * permissões da operação. Falta de permissão devolve `terminal` (a operação é
 * recusada antes de começar); instabilidade devolve `transient`.
 *
 * O projeto de deploy ainda não existir NÃO é bloqueio: em instalação nova ele
 * pode ser criado depois.
 */
export async function preflightAccess(input: {
  management?: ManagementClient | null;
  suppliedKeys?: { publishableKey?: string | null; serviceRoleKey?: string | null } | null;
  deploy?: DeployClient | null;
  code?: CodeClient | null;
  projectRef?: string | null;
  deployProject?: string | null;
}): Promise<AccessPreflight> {
  const checks: AccessCheck[] = [];
  let terminal: string | null = null;
  let transient: string | null = null;

  const note = (area: AccessCheck["area"], label: string, ok: boolean, detail: string) => {
    checks.push({ area, label, ok, detail });
    if (ok) return;
    // Só bloqueia diante de negativa clara de permissão ou instabilidade do
    // provedor; qualquer outro detalhe é reportado e resolvido na própria etapa.
    const kind = classifyAccessFailure(detail);
    if (kind === "transient") transient ??= `${label}: ${detail}`;
    else if (kind === "permission") terminal ??= `${label}: ${detail}`;
  };

  if (input.management) {
    const ping = await input.management.query("select 1 as ok");
    note(
      "database",
      "Acesso ao banco da instalação",
      ping.ok,
      ping.ok
        ? `projeto ${input.projectRef ?? "destino"} acessível`
        : (ping.error ?? "acesso recusado"),
    );
    if (ping.ok) {
      const supplied = input.suppliedKeys;
      const keys =
        supplied?.publishableKey && supplied.serviceRoleKey
          ? {
              ok: true,
              publishableKey: supplied.publishableKey,
              serviceRoleKey: supplied.serviceRoleKey,
            }
          : await input.management.keys();
      const ok = keys.ok && Boolean(keys.publishableKey) && Boolean(keys.serviceRoleKey);
      note(
        "database",
        "Leitura das chaves do projeto",
        ok,
        ok
          ? "chaves publicável e de serviço legíveis"
          : (keys.error ?? "o token não permite ler todas as chaves de API do projeto"),
      );
    }
  }

  if (input.deploy) {
    const project = await input.deploy.deploymentUrl();
    const detail = project.ok
      ? `projeto ${input.deployProject ?? ""} acessível`.trim()
      : (project.error ?? "acesso negado");
    // 404 = projeto ainda não criado; não é falta de permissão.
    const pending = !project.ok && /HTTP 404|não encontrado/i.test(detail);
    if (pending) {
      checks.push({
        area: "deploy",
        label: "Acesso ao projeto de publicação",
        ok: false,
        detail: `${detail} — será criado/ligado durante a operação`,
      });
    } else {
      note("deploy", "Acesso ao projeto de publicação", project.ok, detail);
    }
  }

  if (input.code) {
    const permissions = await input.code.permissions();
    for (const item of permissions) {
      // "Criação rápida pelo template" é conveniência: não bloqueia a operação.
      if (/template/i.test(item.label)) {
        checks.push({ area: "code", label: item.label, ok: item.ok, detail: item.detail });
        continue;
      }
      note("code", item.label, item.ok, item.detail);
    }
  }

  return { checks, terminal, transient };
}

/**
 * Executa o provisionamento automático completo. Nunca simula sucesso:
 * qualquer dependência ausente encerra a operação como BLOCKED.
 */
export async function runAutomatedProvision(input: {
  client: Client;
  operation: OperationRow;
  installation: AutomationInstallation;
  env?: Record<string, string | undefined>;
  fetchImpl?: Fetcher;
  /** Sobrescrita exclusiva para testes determinísticos ponta a ponta. */
  maxStatementsPerInvocation?: number;
  /** Sobrescrita exclusiva para testes determinísticos ponta a ponta. */
  maxMigrationsPerInvocation?: number;
  /** Sobrescrita exclusiva para testes: preserva retries, sem espera de relógio. */
  sleep?: (ms: number) => Promise<void>;
  /** Janela curta de polling do deployment por invocação. */
  waitMs?: number;
}): Promise<AutomationRunResult> {
  const env = input.env ?? runtimeEnv();
  const { client, operation, installation } = input;
  const failures: string[] = [];
  const blocked: string[] = [];
  // Pendências externas ao provisionamento (ex.: DNS do domínio definitivo
  // ainda não publicado pelo dono do domínio). O ambiente está aplicado e
  // utilizável: registrar como aviso, nunca como bloqueio da instalação.
  const pendingNotes: string[] = [];
  const checks: Partial<Record<HealthCheckId, CheckState>> = {};
  const steps: AutomationRunResult["steps"] = [];

  let provisionRelease: string | null = null;
  const finish = async (appUrl: string | null, source: "custom_domain" | "deploy" | null) => {
    const outcome = automationOutcome({ blocked, failures });
    const notes = pendingNotes.length ? ` Pendências: ${pendingNotes.join(" | ")}` : "";
    await finalizeOperation(client as never, operation as never, {
      ok: outcome.result === "PASS",
      warnings: outcome.result === "PASS" && (blocked.length > 0 || pendingNotes.length > 0),
      // A versão promovida é a que foi lida do commit efetivamente publicado,
      // nunca a constante do processo por suposição.
      version: outcome.result === "PASS" ? provisionRelease : null,
      summary:
        outcome.result === "PASS"
          ? `Provisionamento automático concluído${appUrl ? ` em ${appUrl}` : ""}.${notes}`
          : `${outcome.result}: ${outcome.reasons.join(" | ")}${notes}`,
      errorKind: outcome.result === "PASS" ? null : outcome.result.toLowerCase(),
      checks: checks as never,
    });
    return { ...outcome, appUrl, urlSource: source, steps };
  };

  const mark = async (
    id: string,
    state: "running" | "done" | "error",
    detail?: string | null,
    percent?: number | null,
  ) => {
    if (state !== "running") steps.push({ id, state, detail: sanitize(detail ?? null) });
    await report(client, operation, id, state, detail, percent);
  };

  const isCancelled = async () => {
    const current = await readOperationControlState(client as never, operation.id);
    return !["running", "pending", "retryable"].includes(current.status ?? "");
  };

  /* 1. credenciais próprias do MASTER */
  const capability = resolveAutomationCapability(env);
  if (!capability.available) {
    blocked.push(...capability.blockedReasons);
    await mark("supabase", "error", capability.blockedReasons.join(" | "));
    checks.configuration = "attention";
    return finish(null, null);
  }

  const target = resolveAutomationTarget(installation);
  if (!target.ok) {
    blocked.push(target.reason);
    await mark("supabase", "error", target.reason);
    return finish(null, null);
  }

  const masterRepo = (env["UNITOS_MASTER_REPO"] ?? "").trim() || null;
  const repo = resolveInstallationRepo({
    gitRepoUrl: installation.gitRepoUrl ?? null,
    masterRepo: masterRepo ?? DEFAULT_MASTER_REPO,
  });
  if (!repo.ok) {
    blocked.push(repo.reason);
    await mark("code", "error", repo.reason);
    checks.configuration = "attention";
    return finish(null, null);
  }

  const managementToken = (env["UNITOS_SUPABASE_MANAGEMENT_TOKEN"] ?? "").trim();
  const deployToken = (env["UNITOS_VERCEL_TOKEN"] ?? "").trim();
  const githubToken = (env["UNITOS_GITHUB_TOKEN"] ?? "").trim();
  // Leitura do MASTER usa sempre a credencial do MASTER: divide a cota de uso
  // do GitHub e evita o 403 "API rate limit" no token da instalação.
  const masterGithubToken = (process.env["UNITOS_GITHUB_TOKEN"] ?? "").trim() || githubToken;
  const teamId = (env["UNITOS_VERCEL_TEAM_ID"] ?? "").trim() || null;

  const management = createManagementClient({
    token: managementToken,
    projectRef: target.projectRef,
    fetchImpl: input.fetchImpl,
  });
  const code = createCodeClient({
    token: githubToken,
    masterToken: masterGithubToken,
    owner: repo.owner,
    repo: repo.repo,
    masterRepo,
    fetchImpl: input.fetchImpl,
    sleep: input.sleep,
  });

  const deploy = createDeployClient({
    token: deployToken,
    project: target.deployProject,
    teamId,
    masterRepo,
    repo: repo.slug,
    githubToken,
    fetchImpl: input.fetchImpl,
  });

  /* 3. Supabase destino: conectividade, plataforma e chaves */
  await mark("supabase", "running");
  const ping = await management.query(
    "select count(*)::int as schemas from information_schema.schemata where schema_name in ('auth','storage','vault')",
  );
  if (!ping.ok) {
    const detail = (ping.error ?? "").trim();
    // Instabilidade do Supabase não deve ser reportada como falha de credencial.
    const transient = /Instabilidade tempor|limitando as chamadas|timeout/i.test(detail);
    blocked.push(
      transient
        ? detail
        : `Supabase destino inacessível com a credencial de gestão: ${detail}`.trim(),
    );
    await mark("supabase", "error", ping.error);
    checks.supabase = transient ? "attention" : "error";
    return finish(null, null);
  }

  const pingRow = ping.rows[0] as { schemas?: number } | undefined;
  if (!pingRow || pingRow.schemas === undefined) {
    blocked.push("Supabase respondeu sem o resultado esperado da verificação de schemas.");
    await mark("supabase", "error", "resposta vazia na verificação de schemas");
    checks.supabase = "attention";
    return finish(null, null);
  }
  const schemas = Number(pingRow.schemas);
  if (schemas < 3) {
    blocked.push("O alvo não é um projeto Supabase completo (auth/storage/vault ausentes).");
    await mark("supabase", "error", "schemas de plataforma ausentes");
    checks.supabase = "error";
    return finish(null, null);
  }

  const keys = await management.keys();
  const suppliedPublishable = (env["UNITOS_SUPABASE_PUBLISHABLE_KEY"] ?? "").trim();
  const suppliedServiceRole = (env["UNITOS_SUPABASE_SERVICE_ROLE_KEY"] ?? "").trim();
  const resolvedKeys =
    keys.ok && keys.publishableKey && keys.serviceRoleKey
      ? keys
      : suppliedPublishable && suppliedServiceRole
        ? { ok: true, publishableKey: suppliedPublishable, serviceRoleKey: suppliedServiceRole }
        : keys;
  if (!resolvedKeys.ok || !resolvedKeys.publishableKey || !resolvedKeys.serviceRoleKey) {
    blocked.push(
      `Não foi possível ler as chaves do Supabase destino: ${keys.error ?? "chaves não retornadas"}`,
    );
    await mark("supabase", "error", "chaves do destino indisponíveis");
    checks.supabase = "attention";
    return finish(null, null);
  }
  checks.supabase = "ok";
  // Confirmação de e-mail desligada por padrão: o remetente padrão do Supabase
  // não tem DNS apontado, então o link de confirmação do /setup não chegaria.
  const authDefaults = await applyInstallationAuthDefaults(management);
  if (!authDefaults.applied) {
    pendingNotes.push(`Confirmação de e-mail não pôde ser desligada: ${authDefaults.detail}`);
  }
  await mark(
    "supabase",
    "done",
    `projeto ${target.projectRef} acessível${authDefaults.applied ? " · confirmação de e-mail desligada" : ""}`,
  );

  /* 3. preflight dos acessos de publicação e repositório, antes de qualquer
   * escrita: negativa de permissão encerra aqui, dizendo o acesso exato que
   * falta; instabilidade do provedor pede nova tentativa em minutos. */
  const preflight = await preflightAccess({
    management,
    suppliedKeys: resolvedKeys,
    deploy,
    code,
    deployProject: target.deployProject,
  });
  if (preflight.terminal || preflight.transient) {
    const failing = preflight.checks.find((c) => !c.ok && c.area === "deploy");
    const stepId = failing ? "deploy_link" : "code";
    const reason = preflight.terminal
      ? `Acesso insuficiente antes de publicar — ${preflight.terminal}`
      : `Instabilidade momentânea ao conferir os acessos — ${preflight.transient}. Tente novamente em alguns minutos.`;
    blocked.push(reason);
    await mark(stepId, "error", reason);
    checks.configuration = "attention";
    return finish(null, null);
  }

  /* 3. código no repositório DA INSTALAÇÃO (gerado do template do MASTER).
   * Sem código publicado o deploy não tem o que construir — por isso esta etapa
   * vem antes de conectar a Vercel, gravar variáveis e preparar o banco. */
  const codeStage = await readStageProgress(client, operation);
  let provisionCommitSha = codeStage.codeSourceSha ?? codeStage.codeSha ?? null;
  provisionRelease = codeStage.provisionRelease ?? null;
  let provisionRepoSlug = codeStage.codeRepo ?? repo.slug;
  await mark("code", "running");
  if (codeStage.codeDone && codeStage.codeSha) {
    await mark(
      "code",
      "done",
      `código já publicado em ${repo.slug} (${codeStage.codeSha.slice(0, 7)}) — checkpoint`,
    );
  } else {
    const ensured = await code.ensureRepo({ initialProvision: true });
    if (!ensured.ok) {
      blocked.push(`Repositório da instalação indisponível: ${ensured.error ?? ""}`.trim());
      await mark("code", "error", ensured.error ?? "repositório indisponível");
      checks.code = "error";
      return finish(null, null);
    }
    const effectiveRepoSlug = ensured.repoSlug ?? repo.slug;
    provisionRepoSlug = effectiveRepoSlug;
    if (effectiveRepoSlug !== repo.slug) {
      const updated = await (
        client as never as {
          from: (table: string) => {
            update: (values: Record<string, unknown>) => {
              eq: (
                column: string,
                value: string,
              ) => Promise<{ error?: { message?: string } | null }>;
            };
          };
        }
      )
        .from("installations")
        .update({ git_repo_url: `https://github.com/${effectiveRepoSlug}` })
        .eq("id", installation.id);
      if (updated.error) {
        blocked.push(
          `A cópia foi criada em ${effectiveRepoSlug}, mas o cadastro não pôde ser atualizado.`,
        );
        await mark("code", "error", updated.error.message ?? "falha ao atualizar repositório");
        checks.code = "error";
        return finish(null, null);
      }
    }
    const masterHead = provisionCommitSha
      ? { ok: true as const, sha: provisionCommitSha }
      : await code.masterHeadSha();
    if (!masterHead.ok || !masterHead.sha) {
      blocked.push(
        `Commit do MASTER não lido para publicar no repositório da instalação: ${
          masterHead.error ?? ""
        }`.trim(),
      );
      await mark("code", "error", "commit do MASTER indisponível");
      checks.code = "error";
      return finish(null, null);
    }
    provisionCommitSha = masterHead.sha;
    if (!codeStage.codeSourceSha) {
      await saveStageProgress(client, operation, { codeSourceSha: masterHead.sha });
    }
    const [sourceRelease, installedRelease] = await Promise.all([
      provisionRelease
        ? Promise.resolve({ ok: true as const, version: provisionRelease })
        : code.releaseAtCommit(masterHead.sha),
      code.installedRelease(),
    ]);
    if (!sourceRelease.ok || !sourceRelease.version || !installedRelease.ok) {
      const reason =
        installedRelease.error ??
        ("error" in sourceRelease ? sourceRelease.error : undefined) ??
        "não foi possível ler a versão do código no repositório da instalação";
      blocked.push(
        ensured.created
          ? `Cópia do template não validada: ${reason}`
          : `O repositório ${effectiveRepoSlug} não parece ser uma cópia do template do MASTER: ${reason}. Gere-o novamente a partir do template.`,
      );
      await mark("code", "error", reason);
      checks.code = "error";
      return finish(null, null);
    }
    const { compareReleaseVersions, masterNotPublishedMessage } =
      await import("./manager-contract");
    if (compareReleaseVersions(sourceRelease.version, MASTER_RELEASE_VERSION) < 0) {
      const reason = masterNotPublishedMessage(sourceRelease.version, MASTER_RELEASE_VERSION);
      blocked.push(reason);
      await mark("code", "error", reason);
      checks.code = "error";
      return finish(null, null);
    }
    provisionRelease = sourceRelease.version;
    await saveStageProgress(client, operation, { provisionRelease });

    // Cópia do template apenas DESATUALIZADA não é bloqueio: sincronizamos a
    // versão do MASTER no repositório da instalação, como na atualização.
    let publishedSha = installedRelease.sha ?? masterHead.sha;
    if (sourceRelease.version !== installedRelease.version) {
      await mark(
        "code",
        "running",
        `cópia em ${installedRelease.version ?? "versão desconhecida"}; sincronizando para ${sourceRelease.version}`,
      );
      const stage = await readStageProgress(client, operation);
      const reusable = stage.codeSourceSha === masterHead.sha ? (stage.codeBlobs ?? {}) : {};
      const published = await code.publishSnapshot(masterHead.sha, {
        blobMap: reusable,
        timeBudgetMs: 20_000,
        onProgress: async (progress) => {
          await report(client, operation, "code", "running", progress.detail, progress.percent);
        },
        onCheckpoint: async (blobMap) => {
          await saveStageProgress(client, operation, {
            codeSourceSha: masterHead.sha,
            codeBlobs: blobMap,
          });
        },
      });
      if (!published.ok) {
        const detail = withRepoWriteHint(
          published.error ?? `não foi possível sincronizar ${effectiveRepoSlug}`,
          effectiveRepoSlug,
        );
        const kind = classifyAccessFailure(detail);
        if (kind === "permission") blocked.push(`Código não sincronizado: ${detail}`);
        else failures.push(`Código não sincronizado: ${detail}`);

        await mark("code", "error", detail);
        checks.code = "error";
        return finish(null, null);
      }
      if (published.partial) {
        const detail =
          published.note ??
          `sincronizando ${effectiveRepoSlug} — ${published.changed ?? 0} arquivos nesta rodada (continua)`;
        failures.push(`${detail} Tente novamente para retomar de onde parou.`);
        await mark("code", "error", detail);
        checks.code = "attention";
        return finish(null, null);
      }
      publishedSha = published.commitSha ?? masterHead.sha;
    }

    await saveStageProgress(client, operation, {
      codeDone: true,
      codeSourceSha: masterHead.sha,
      codeSha: masterHead.sha,
      codeRepo: effectiveRepoSlug,
      codeBlobs: {},
    });
    checks.code = "ok";
    await mark(
      "code",
      "done",
      ensured.created
        ? `cópia completa do template criada em ${effectiveRepoSlug} (${(ensured.commitSha ?? masterHead.sha).slice(0, 7)})`
        : `código do template em ${effectiveRepoSlug} na versão ${sourceRelease.version} (${publishedSha.slice(0, 7)})`,
      100,
    );
  }
  checks.code = checks.code ?? "ok";

  /* 4. deploy conectado ao repositório da instalação, sem auto-deploy por Git */
  await mark("deploy_link", "running");
  const ensuredProject = await deploy.ensureProject(provisionRepoSlug, {
    projectId: codeStage.provisionVercelProjectId,
    teamId: codeStage.provisionVercelTeamId,
  });
  if (
    !ensuredProject.ok ||
    !ensuredProject.projectId ||
    !ensuredProject.teamId ||
    !ensuredProject.projectName
  ) {
    const reason = ensuredProject.error ?? "projeto Vercel não pôde ser criado ou localizado";
    blocked.push(`Projeto Vercel indisponível: ${reason}`);
    await mark("deploy_link", "error", reason);
    checks.configuration = "error";
    return finish(null, null);
  }
  await saveStageProgress(client, operation, {
    provisionVercelProjectReady: true,
    provisionVercelProjectId: ensuredProject.projectId,
    provisionVercelTeamId: ensuredProject.teamId,
  });
  let repositoryLinked = ensuredProject.repositoryLinked === true;
  if (!repositoryLinked) {
    const linked = await deploy.linkRepository(provisionRepoSlug);
    if (!linked.ok) {
      blocked.push(
        `Projeto de deploy não ligado a ${provisionRepoSlug}: ${linked.error ?? ""}`.trim(),
      );
      await mark("deploy_link", "error", linked.error ?? "vínculo do repositório falhou");
      checks.configuration = "attention";
      return finish(null, null);
    }
    const confirmed = await deploy.ensureProject(provisionRepoSlug, {
      projectId: ensuredProject.projectId,
      teamId: ensuredProject.teamId,
    });
    if (!confirmed.ok || confirmed.repositoryLinked !== true) {
      const reason = confirmed.error ?? "vínculo GitHub/branch main não foi confirmado pela Vercel";
      blocked.push(`Projeto de deploy não confirmado: ${reason}`);
      await mark("deploy_link", "error", reason);
      checks.configuration = "error";
      return finish(null, null);
    }
    await saveStageProgress(client, operation, { provisionRepositoryLinked: true });
    repositoryLinked = true;
  }
  const autoDeployOn = await deploy.setAutoDeploy(true);
  if (!autoDeployOn.ok) {
    blocked.push(`Auto-deploy por Git não confirmado: ${autoDeployOn.error ?? "falha"}`);
    await mark("deploy_link", "error", "auto-deploy por Git não confirmado");
    checks.configuration = "error";
    return finish(null, null);
  }
  await mark(
    "deploy_link",
    "done",
    `${repositoryLinked ? "projeto ligado" : "vínculo confirmado"} a ${provisionRepoSlug} · auto-deploy por Git ligado`,
  );

  /* 5. baseline do banco — roda DEPOIS de código, deploy conectado e variáveis:
   * sem código publicado e sem URL própria não faz sentido preparar o banco. */
  const runBaselinePhase = async (
    appUrl: string | null,
    urlSource: "custom_domain" | "deploy" | null,
  ): Promise<AutomationRunResult | null> => {
    // `key` é o identificador do checkpoint. O delta MUDA a cada release do
    // MASTER, então seu checkpoint carrega a impressão digital do conteúdo:
    // sem isso, um provisionamento antigo que marcou "007_delta_migrations:
    // aplicado" fazia a versão nova ser PULADA e a validação final acusava
    // colunas/tabelas ausentes. Os arquivos de baseline fixo seguem por label.
    const baseline: { id: string; label: string; key: string; sql: string }[] = [
      {
        id: "database",
        label: "000_extensions",
        // O conteúdo do 000 também evolui. Um checkpoint legado não pode pular
        // a convergência/pós-condição nova apenas porque usava a label estática.
        key: `000_extensions:${deltaFingerprint(baseline000)}`,
        sql: baseline000,
      },
      { id: "database", label: "001_initial_schema", key: "001_initial_schema", sql: baseline001 },
      { id: "database", label: "005_auth_trigger", key: "005_auth_trigger", sql: baseline005 },
      {
        id: "database",
        label: UPDATE_DELTA_LABEL,
        key: deltaProgressKey(baseline007),
        sql: baseline007,
      },
      { id: "storage", label: "003_storage_buckets", key: "003_storage_buckets", sql: baseline003 },
      {
        id: "storage",
        label: "006_storage_policies",
        key: "006_storage_policies",
        sql: baseline006,
      },
      { id: "seeds", label: "004_seeds", key: "004_seeds", sql: baseline004 },
    ];

    // Checkpoint: o Worker tem vida limitada. Cada arquivo (e cada lote dentro
    // do arquivo) é registrado, então uma retomada continua de onde parou em vez
    // de reaplicar o baseline inteiro — a causa do travamento em 99%.
    const progress = await readBaselineProgress(client, installation.id, operation);

    // Percentual da ETAPA considera todos os arquivos do grupo (ex.: "database"
    // tem 4 arquivos), então a barra da etapa reflete o avanço real.
    const groupTotals = baseline.reduce<Record<string, number>>((acc, f) => {
      acc[f.id] = (acc[f.id] ?? 0) + 1;
      return acc;
    }, {});
    const groupDone: Record<string, number> = {};
    const groupPercent = (id: string, fileFraction: number) =>
      Math.min(
        99,
        Math.round(
          (((groupDone[id] ?? 0) + fileFraction) / Math.max(groupTotals[id] ?? 1, 1)) * 100,
        ),
      );

    let currentGroup = "";
    for (const file of baseline) {
      if (file.id !== currentGroup) {
        currentGroup = file.id;
        await mark(file.id, "running", null, groupPercent(file.id, 0));
      }
      if (progress[file.key] === DONE) {
        if (file.key === "000_extensions") {
          const vectorReady = await verifyVectorExtensionPostcondition(management);
          if (!vectorReady.ok) {
            failures.push(vectorReady.error);
            await mark(file.id, "error", vectorReady.error);
            checks.database = "error";
            return finish(appUrl, urlSource);
          }
        }
        groupDone[file.id] = (groupDone[file.id] ?? 0) + 1;
        await mark(
          file.id,
          "running",
          `${file.label}: já aplicado (checkpoint)`,
          groupPercent(file.id, 0),
        );
        continue;
      }
      await mark(file.id, "running", `${file.label}: aplicando`, groupPercent(file.id, 0));
      if (file.label === UPDATE_DELTA_LABEL) {
        const legacyDeltaProgress = progress[file.key];
        if (typeof legacyDeltaProgress === "number" && legacyDeltaProgress > 0) {
          failures.push(
            "delta legado parcial sem evidência por migration; reconciliação é obrigatória",
          );
          await mark("database", "error", "delta legado parcial sem evidência por migration");
          checks.database = "error";
          return finish(appUrl, urlSource);
        }
        if (!provisionCommitSha) {
          blocked.push("commit fixado do MASTER ausente para executar migrations");
          await mark("database", "error", "pacote do MASTER não foi fixado");
          checks.database = "error";
          return finish(appUrl, urlSource);
        }
        const snapshot = localDeltaPackage(provisionCommitSha);
        if (
          !snapshot.version ||
          snapshot.version !== MASTER_RELEASE_VERSION ||
          !snapshot.sha256 ||
          snapshot.total === 0
        ) {
          blocked.push("metadados locais do pacote de migrations estão incompletos ou divergentes");
          await mark("database", "error", "manifesto do pacote inválido");
          checks.database = "error";
          return finish(appUrl, urlSource);
        }
        if (!operation.baseline_id && !operation.baseline_hash) {
          const rpc = client as never as {
            rpc: (
              name: string,
              args: Record<string, unknown>,
            ) => Promise<{ data?: unknown; error?: { message?: string } | null }>;
          };
          const { data: sealed, error: sealError } = await rpc.rpc(
            "seal_installation_operation_baseline",
            {
              _operation_id: operation.id,
              _owner: operation.lease_owner ?? "",
              _fencing_token: operation.fencing_token ?? -1,
              _baseline_id: operationPackageIdentity(snapshot),
              _baseline_hash: snapshot.sha256,
            },
          );
          if (sealError || sealed !== true) {
            failures.push(
              sealError?.message ?? "não foi possível fixar o pacote da instalação nova",
            );
            await mark("database", "error", "selagem do pacote falhou");
            checks.database = "error";
            return finish(appUrl, urlSource);
          }
          operation.baseline_id = operationPackageIdentity(snapshot);
          operation.baseline_hash = snapshot.sha256;
        }
        const delta = await applyDatabaseDelta({
          client,
          operation,
          installation,
          env,
          snapshot,
          ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
          ...(input.maxStatementsPerInvocation !== undefined
            ? { maxStatementsPerInvocation: input.maxStatementsPerInvocation }
            : {}),
          ...(input.maxMigrationsPerInvocation !== undefined
            ? { maxMigrationsPerInvocation: input.maxMigrationsPerInvocation }
            : {}),
        });
        if (delta.state === "pending") {
          await mark("database", "running", delta.detail, delta.percent);
          return { result: "RUNNING", reasons: [], appUrl, urlSource, steps };
        }
        if (delta.state === "blocked" || delta.state === "error") {
          failures.push(delta.detail);
          await mark("database", "error", delta.detail);
          checks.database = "error";
          return finish(appUrl, urlSource);
        }
        progress[file.key] = DONE;
        groupDone[file.id] = (groupDone[file.id] ?? 0) + 1;
        await saveBaselineProgress(client, operation, progress);
        continue;
      }
      // A Management API executa como `postgres` (não superusuário): comandos
      // exclusivos de superusuário do dump são removidos antes de enviar.
      const prepared = sanitizeBaselineSqlForManagementApi(file.sql);
      const alreadyApplied = progress[file.key] ?? 0;
      // Nunca envie o arquivo inteiro em uma única chamada. Além de não gerar
      // heartbeat durante sua execução, 001 (530 KB) e 007 podiam exceder a vida
      // do runtime. O mesmo caminho curto/idempotente vale para primeira execução
      // e retomada, portanto todos os arquivos do instalador ficam protegidos.
      const perStatement = await applyStatementByStatement(management, prepared.sql, {
        isCancelled,
        runKey: `${operation.id}:${file.key}`,
        startIndex: alreadyApplied,
        maxStatements: BASELINE_STATEMENTS_PER_INVOCATION,
        ...(input.maxStatementsPerInvocation !== undefined
          ? { maxStatements: input.maxStatementsPerInvocation }
          : {}),
        ...(file.key === "000_extensions"
          ? { completionPostcondition: VECTOR_EXTENSION_POSTCONDITION }
          : {}),
        onProgress: async (processed, total) => {
          progress[file.key] = processed;
          await saveBaselineProgress(client, operation, progress);
          const percent = Math.min(99, Math.round((processed / Math.max(total, 1)) * 100));
          const action = alreadyApplied > 0 ? "retomando aplicação" : "aplicando";
          await mark(
            file.id,
            "running",
            `${file.label}: ${action} (${percent}%)`,
            groupPercent(file.id, percent / 100),
          );
        },
      });
      if (!perStatement.ok) {
        if (typeof perStatement.processed === "number" && perStatement.processed > 0) {
          progress[file.key] = perStatement.processed;
          await saveBaselineProgress(client, operation, progress);
        }
        failures.push(`${file.label}: ${perStatement.error ?? "falha ao aplicar"}`);
        await mark(file.id, "error", `${file.label} falhou`);
        checks[file.id === "seeds" ? "database" : (file.id as HealthCheckId)] = "error";
        return finish(appUrl, urlSource);
      }
      if (!perStatement.complete) {
        // Não mantenha uma única Promise viva por centenas de requests: o
        // waitUntil do Worker tem uma janela curta e cancela a tarefa. O
        // checkpoint/heartbeat já foi persistido; o watchdog inicia a próxima
        // invocação, exatamente no statement seguinte, sem concorrência.
        return {
          result: "RUNNING",
          reasons: [],
          appUrl,
          urlSource,
          steps,
        };
      }
      progress[file.key] = DONE;
      groupDone[file.id] = (groupDone[file.id] ?? 0) + 1;
      await saveBaselineProgress(client, operation, progress);
    }

    // O PostgREST mantém um cache do schema. Sem recarregar, todas as tabelas e
    // funções recém-criadas respondem PGRST205/PGRST202 ("Could not find the
    // table ... in the schema cache") e a instalação sobe aparentemente vazia.
    await management.query("NOTIFY pgrst, 'reload schema';");

    checks.database = "ok";

    checks.storage = "ok";
    await mark("database", "done", "baseline aplicado no destino");
    await mark("storage", "done", "buckets e policies aplicados");
    await mark("seeds", "done", "seeds de catálogo aplicados");
    return null;
  };

  /* 4. banco, storage e seeds — ANTES dos secrets: o segredo do cron é gravado
   * por uma função criada pelo baseline (public.set_cron_secret). Com a ordem
   * invertida o provisionamento falhava em banco novo e as variáveis do deploy
   * nunca eram gravadas. */
  const baselineEarly = await runBaselinePhase(null, null);
  if (baselineEarly) return baselineEarly;

  /* 5 + 6. secrets exclusivos, URL operacional e variáveis do deploy.
   * Fase atômica com checkpoint: uma retomada NÃO regera secrets nem
   * reconfigura/republica o deploy quando a fase já foi concluída. */
  const stage = await readStageProgress(client, operation);
  let url: { origin: string; source: "custom_domain" | "deploy" };

  if (
    stage.deployDone &&
    stage.provisionDeploymentState === "READY" &&
    typeof stage.provisionDeploymentReadyAt === "string" &&
    typeof stage.appUrl === "string" &&
    stage.appUrl.length > 0
  ) {
    url = {
      origin: stage.appUrl,
      source: stage.urlSource === "custom_domain" ? "custom_domain" : "deploy",
    };
    checks.secrets = "ok";
    checks.configuration = "ok";
    checks.frontend = stage.frontendOk ? "ok" : "attention";
    await mark("secrets", "done", "secrets próprios já gerados nesta operação (checkpoint)");
    await mark(
      "deploy",
      "done",
      `URL operacional ${url.origin} — variáveis e deployment já aplicados (checkpoint)`,
    );
  } else {
    await mark("secrets", "running");
    // Secrets são gerados UMA ÚNICA VEZ por instalação e reutilizados depois.
    // Regerar `BRAND_CREDENTIALS_SECRET` a cada execução tornava ilegíveis os
    // tokens das contas sociais já cifrados no banco do destino (o erro
    // "Falha ao decriptar token da conexão"), além de invalidar o segredo do
    // cron e os segredos do Meta.
    const { ensureInstallationSecrets } = await import("./credentials.server");
    const secrets = {} as Record<GeneratedSecretVar, string>;
    let secretsDetail: string;
    try {
      const ensured = await ensureInstallationSecrets({
        client: client as never,
        installationId: installation.id,
        names: GENERATED_SECRET_VARS,
        generate: () => generateInstallationSecret(),
      });
      for (const name of GENERATED_SECRET_VARS) {
        const value = (ensured.secrets[name] ?? "").trim();
        if (!value) throw new Error(`Secret ${name} não pôde ser preparado.`);
        secrets[name] = value;
      }
      secretsDetail =
        ensured.created.length === 0
          ? "chaves próprias reutilizadas (nenhum acesso salvo é invalidado)"
          : `chaves próprias: ${ensured.created.length} criada(s), ${ensured.reused.length} reutilizada(s)`;
    } catch (error) {
      // Falha fechada de propósito: gerar novas chaves aqui invalidaria em
      // silêncio os acessos das redes sociais já cifrados no destino.
      const reason = error instanceof Error ? error.message : "falha ao preparar as chaves";
      failures.push(reason);
      await mark("secrets", "error", reason);
      checks.secrets = "error";
      return finish(null, null);
    }
    const isolation = assertSecretsAreExclusive({ generated: secrets, masterEnv: env });
    if (!isolation.ok) {
      failures.push(isolation.reason);
      await mark("secrets", "error", isolation.reason);
      checks.secrets = "error";
      return finish(null, null);
    }
    // O destino pode ter recebido o baseline sem os helpers do Vault (ou com
    // versão antiga). Criação e gravação acontecem atomicamente na mesma query,
    // inclusive ao retomar uma operação iniciada por uma versão anterior.
    const vault = await management.query(writeCronSecretToVaultSql(secrets.CRON_SECRET));
    if (!vault.ok) {
      failures.push(`CRON_SECRET não gravado no Vault do destino: ${vault.error ?? ""}`.trim());
      await mark("secrets", "error", "set_cron_secret falhou");
      checks.secrets = "error";
      return finish(null, null);
    }
    checks.secrets = "ok";
    await mark("secrets", "done", secretsDetail);

    await mark("deploy", "running");
    const deployment = await deploy.deploymentUrl();
    const resolved = resolveOperationalUrl({
      customDomain: installation.domain,
      deploymentUrl: deployment.url ?? null,
    });
    if (!resolved.ok) {
      blocked.push(
        `URL operacional indisponível: ${resolved.reason}${
          deployment.error ? ` (${deployment.error})` : ""
        }`,
      );
      await mark("deploy", "error", resolved.reason);
      checks.frontend = "error";
      return finish(null, null);
    }
    if (containsMasterReference(resolved.origin)) {
      failures.push("A URL resolvida aponta para o MASTER — operação recusada.");
      await mark("deploy", "error", "URL do MASTER recusada");
      return finish(null, null);
    }
    url = { origin: resolved.origin, source: resolved.source };

    // App Meta oficial do Unitos: propagado do MASTER para a instalação nova,
    // de modo que o modo padrão “Unitos — App Meta oficial” já venha resolvido.
    // Falha aqui NÃO bloqueia: a instalação segue operacional e o Super Admin
    // resolve o Meta depois.
    let officialMetaApp: {
      appId?: string | null;
      appSecret?: string | null;
      businessConfigId?: string | null;
    } | null = null;
    try {
      const { resolveMetaAppCredentials, resolveMetaBusinessConfigId } =
        await import("@/lib/meta/app-config.server");
      const creds = await resolveMetaAppCredentials();
      if (creds.appType === "unitos" && creds.appId && creds.appSecret) {
        officialMetaApp = {
          appId: creds.appId,
          appSecret: creds.appSecret,
          businessConfigId: creds.businessConfigId ?? (await resolveMetaBusinessConfigId()),
        };
      }
    } catch {
      officialMetaApp = null;
    }

    const plan = buildDeployEnvPlan({
      appUrl: url.origin,
      supabaseUrl: installation.supabaseUrl ?? `https://${target.projectRef}.supabase.co`,
      publishableKey: resolvedKeys.publishableKey,
      serviceRoleKey: resolvedKeys.serviceRoleKey,
      projectRef: target.projectRef,
      secrets,
      officialMetaApp,
    });
    if (!plan.ok) {
      failures.push(plan.reason);
      await mark("deploy", "error", plan.reason);
      return finish(url.origin, url.source);
    }
    // O build automático por Git fica ligado: garante publicação mesmo quando a
    // API da Vercel não consegue disparar o deployment.
    const autoDeploy = await deploy.setAutoDeploy(true);
    if (!autoDeploy.ok) {
      blocked.push(`Auto-deploy por Git não confirmado: ${autoDeploy.error ?? "falha"}`);
      await mark("deploy", "error", "auto-deploy por Git não confirmado");
      checks.configuration = "error";
      return finish(url.origin, url.source);
    }
    const envResult = stage.provisionEnvApplied
      ? { ok: true, applied: plan.entries.length }
      : await deploy.setEnv(plan.entries);

    if (!envResult.ok) {
      blocked.push(`Variáveis do deploy não configuradas: ${envResult.error ?? ""}`.trim());
      await mark("deploy", "error", "falha ao gravar variáveis do deploy");
      checks.configuration = "attention";
      return finish(url.origin, url.source);
    }
    if (!stage.provisionEnvApplied) {
      await saveStageProgress(client, operation, { provisionEnvApplied: true });
    }

    const identity = await management.query(bindAppUrl(install010, url.origin));
    if (!identity.ok) {
      failures.push(`installation.app_url não registrada: ${identity.error ?? ""}`.trim());
      await mark("deploy", "error", "identidade da instalação inválida");
      return finish(url.origin, url.source);
    }
    checks.configuration = "ok";

    // Gravar variaveis NAO republica o app: sem um novo deployment o frontend
    // continua rodando com o env antigo. Aqui usamos build a partir do Git do
    // repositório DA INSTALAÇÃO — assim funciona também quando o projeto Vercel
    // ainda não tem NENHUM deployment (repositório publicado à mão, primeiro
    // build). Sem repositório ligado, cai para rebuild do último snapshot.
    let deploymentId = stage.provisionDeploymentId ?? null;
    let expectedDeploymentCommit = stage.provisionDeploymentCommit ?? provisionCommitSha;
    let deploymentSource: "api" | "git" = stage.provisionGitPushCommit ? "git" : "api";
    let redeployed = deploymentId
      ? { ok: true, deploymentId, source: "git" as const }
      : await deploy.deployLatestCode({ sha: provisionCommitSha });
    if (redeployed.ok && redeployed.deploymentId && !deploymentId) {
      deploymentId = redeployed.deploymentId;
      expectedDeploymentCommit = redeployed.ref ?? provisionCommitSha;
      await saveStageProgress(client, operation, {
        provisionDeploymentId: deploymentId,
        provisionDeploymentCommit: expectedDeploymentCommit ?? undefined,
        provisionDeploymentState: "QUEUED",
      });
    }
    let publishNote = redeployed.ok
      ? stage.provisionDeploymentId
        ? "deployment retomado por checkpoint"
        : "novo deployment disparado"
      : "";
    if (!redeployed.ok) {
      if (redeployed.quotaExceeded || redeployed.gitSourceUnavailable) {
        // Duas situações têm a MESMA saída: cota diária da API esgotada ou a
        // Vercel não resolvendo o repositório. Em ambas a publicação sai por
        // push no Git (auto-deploy ligado), sem invalidar o provisionamento.
        let fallbackCommit = stage.provisionGitPushCommit ?? null;
        if (!fallbackCommit && provisionCommitSha) {
          const existingByCommit = await deploy.findProductionDeployment(provisionCommitSha);
          if (!existingByCommit.ok) {
            await saveStageProgress(client, operation, { provisionDeploymentState: "QUEUED" });
            await mark("deploy", "running", existingByCommit.error ?? "aguardando a hospedagem");
            return {
              result: "RUNNING",
              reasons: [],
              appUrl: url.origin,
              urlSource: url.source,
              steps,
            };
          }
          if (existingByCommit.deploymentId) {
            deploymentId = existingByCommit.deploymentId;
            expectedDeploymentCommit = provisionCommitSha;
            deploymentSource = "git";
            await saveStageProgress(client, operation, {
              provisionDeploymentId: deploymentId,
              provisionDeploymentCommit: provisionCommitSha,
              provisionDeploymentState: existingByCommit.state ?? "QUEUED",
            });
          }
        }
        if (!deploymentId && !fallbackCommit) {
          const nudge = await code.nudgeDeploy(
            "chore(unitos): republicar com as variaveis da instalacao",
          );
          if (nudge.ok && nudge.commitSha) {
            fallbackCommit = nudge.commitSha;
            expectedDeploymentCommit = fallbackCommit;
            deploymentSource = "git";
            await saveStageProgress(client, operation, {
              provisionGitPushCommit: fallbackCommit,
              provisionDeploymentCommit: fallbackCommit,
              provisionDeploymentState: "QUEUED",
            });
          } else {
            failures.push(
              `Publicação pendente: tentativa pelo Git não funcionou: ${nudge.error ?? "commit de publicação não retornado"}`,
            );
          }
        }
        const cause = redeployed.quotaExceeded
          ? `cota de deployments por API esgotada${
              redeployed.resetAt
                ? ` — cota volta em ${formatDateTimeBr(new Date(redeployed.resetAt * 1000))}`
                : ""
            }`
          : "a Vercel não resolveu o repositório pela API";
        if (deploymentId) {
          redeployed = {
            ok: true,
            deploymentId,
            source: "git",
            ref: expectedDeploymentCommit ?? undefined,
          };
          publishNote = `deployment Git existente reutilizado (${cause})`;
        } else if (fallbackCommit) {
          const located = await deploy.findProductionDeployment(fallbackCommit);
          if (!located.ok) {
            await saveStageProgress(client, operation, { provisionDeploymentState: "QUEUED" });
            await mark("deploy", "running", located.error ?? "aguardando a hospedagem");
            return {
              result: "RUNNING",
              reasons: [],
              appUrl: url.origin,
              urlSource: url.source,
              steps,
            };
          }
          deploymentId = located.deploymentId ?? null;
          if (!deploymentId) {
            await saveStageProgress(client, operation, {
              provisionDeploymentState: located.state ?? "QUEUED",
            });
            await mark(
              "deploy",
              "running",
              "aguardando a hospedagem detectar o commit de publicação",
            );
            return {
              result: "RUNNING",
              reasons: [],
              appUrl: url.origin,
              urlSource: url.source,
              steps,
            };
          }
          await saveStageProgress(client, operation, {
            provisionDeploymentId: deploymentId,
            provisionDeploymentCommit: fallbackCommit,
            provisionDeploymentState: located.state ?? "QUEUED",
          });
          redeployed = { ok: true, deploymentId, source: "git", ref: fallbackCommit };
          publishNote = `publicação pelo Git (${cause})`;
        } else {
          publishNote = "publicação pendente";
        }
      } else {
        blocked.push(
          `Novo deployment nao disparado (as variaveis so valem apos republicar): ${
            redeployed.error ?? ""
          }`.trim(),
        );
      }
    }

    if (!deploymentId || !expectedDeploymentCommit) {
      blocked.push("deployment ou commit esperado não foi comprovado");
      await mark("deploy", "error", "deployment ou commit esperado ausente");
      checks.frontend = "error";
      return finish(url.origin, url.source);
    }

    const deploymentResult = await pollDeploymentUntilTerminal({
      deploy,
      deploymentId,
      waitMs: input.waitMs,
      sleep: input.sleep,
      onObserved: async (observed) => {
        await saveStageProgress(client, operation, {
          provisionDeploymentId: deploymentId,
          provisionDeploymentCommit: expectedDeploymentCommit ?? undefined,
          provisionDeploymentState: observed.state,
        });
      },
    });
    if (deploymentResult.refused || FAILED_DEPLOYMENT_STATES.has(deploymentResult.state)) {
      const reason = deploymentResult.reason
        ? `deployment ${deploymentResult.state}: ${deploymentResult.reason}`
        : `deployment terminou em ${deploymentResult.state}`;
      failures.push(reason);
      await mark("deploy", "error", reason);
      checks.frontend = "error";
      return finish(url.origin, url.source);
    }
    if (deploymentResult.timedOut || deploymentResult.state !== "READY") {
      await mark("deploy", "running", `deployment em andamento (${deploymentResult.state})`);
      return { result: "RUNNING", reasons: [], appUrl: url.origin, urlSource: url.source, steps };
    }
    const readyProof = validateReadyDeploymentCommit(deploymentResult, expectedDeploymentCommit);
    if (!readyProof.ok) {
      failures.push(readyProof.reason);
      await mark("deploy", "error", readyProof.reason);
      checks.frontend = "error";
      return finish(url.origin, url.source);
    }
    const deploymentReadyAt = new Date().toISOString();
    await saveStageProgress(client, operation, {
      provisionDeploymentId: deploymentId,
      provisionDeploymentCommit: expectedDeploymentCommit,
      provisionDeploymentState: "READY",
      provisionDeploymentReadyAt: deploymentReadyAt,
    });

    // Domínio definitivo precisa estar atribuído ao projeto de deploy — sem isso
    // a URL responde 404 mesmo com o app publicado.
    let domainNote = "";
    if (url.source === "custom_domain") {
      const domain = await deploy.ensureDomain(url.origin);
      if (!domain.ok) {
        failures.push(`Domínio não atribuído ao projeto de deploy: ${domain.error ?? ""}`.trim());
        domainNote = " · domínio pendente";
      } else if (!domain.verified) {
        domainNote = " · domínio aguardando verificação de DNS";
      }
    }

    // O probe HTTP é complementar: só roda após READY + commit comprovado.
    if (!redeployed.ok && failures.length === 0) {
      await mark("deploy", "error", blocked.join(" | ") || "deployment não confirmado");
      checks.frontend = "error";
      return finish(url.origin, url.source);
    }
    const probe = await probeOperationalUrl(url.origin, input.fetchImpl);
    checks.frontend = probe.ok ? "ok" : "attention";
    if (!probe.ok) {
      // Sem publicação nova (cota) ou com DNS/domínio ainda propagando, o 404 é
      // esperado: é pendência de acompanhamento, não bloqueio do provisionamento.
      const pendingPublish = redeployed.quotaExceeded === true || domainNote !== "";
      // Domínio definitivo depende do DNS do dono do domínio, fora do alcance da
      // automação. O ambiente segue aplicado e utilizável pela URL de deploy.
      const dnsPending = url.source === "custom_domain";
      const message = `Frontend ainda nao respondeu em ${url.origin}: ${probe.detail}${
        dnsPending
          ? " — publique o DNS do subdomínio apontando para cname.vercel-dns.com e o endereço definitivo passa a responder"
          : pendingPublish
            ? " — aguardando a publicação/DNS concluir"
            : ""
      }`;
      // Saúde HTTP é evidência obrigatória. DNS ou build pendente permanece
      // retomável, mas nunca conclui/promove a instalação.
      if (dnsPending || pendingPublish) failures.push(message);
      else blocked.push(message);
      await saveStageProgress(client, operation, {
        deployDone: false,
        appUrl: url.origin,
        urlSource: url.source,
        frontendOk: false,
        provisionDeploymentState: "READY",
        provisionDeploymentReadyAt: deploymentReadyAt,
      });
      await mark("deploy", "error", message);
      return finish(url.origin, url.source);
    }

    await saveStageProgress(client, operation, {
      deployDone: true,
      appUrl: url.origin,
      urlSource: url.source,
      frontendOk: probe.ok,
      provisionDeploymentState: "READY",
      provisionDeploymentReadyAt: deploymentReadyAt,
    });

    await mark(
      "deploy",
      "done",
      `${envResult.applied} variáveis gravadas — URL operacional ${url.origin} (${
        url.source === "deploy" ? "temporária do deploy" : "domínio definitivo"
      })${publishNote ? ` · ${publishNote}` : " · redeploy pendente"} · deployment ${deploymentId} READY (${deploymentSource})${domainNote}${
        probe.ok ? " · frontend respondendo" : ` · frontend ${probe.detail}`
      }`,
    );
  }

  // banco/storage/seeds já foram aplicados antes dos secrets (fase 4).

  /* 6. Brain stats */
  await mark("brain", "running");
  const brain = await management.query(stripPsqlMetaCommands(install011).sql);
  if (!brain.ok) {
    failures.push(`brain_stats_mv: ${brain.error ?? "falha"}`);
    await mark("brain", "error", "brain_stats_mv não inicializada");
  } else {
    await mark("brain", "done", "brain_stats_mv populada");
  }

  /* 7. cron na própria origem */
  await mark("cron", "running");
  const cron = await management.query(bindAppUrl(install020, url.origin));
  if (!cron.ok) {
    blocked.push(
      `Cron não agendado (a aplicação precisa responder em ${url.origin}): ${cron.error ?? ""}`.trim(),
    );
    checks.cron = "attention";
    await mark("cron", "error", "agendamento postergado");
  } else {
    checks.cron = "ok";
    await mark("cron", "done", "14 jobs na própria origem");
  }

  /* 8. verificação final READ-ONLY */
  await mark("validation", "running");
  await hardenHelperTables(management);
  const verify = await management.query(prepareVerificationSql(verifySql).sql);

  if (!verify.ok) {
    failures.push(`verify-installation: ${verify.error ?? "falha"}`);
    await mark("validation", "error", "verificação final falhou");
    return finish(url.origin, url.source);
  }
  const summary = summarizeVerificationRows(verify.rows);
  if (!summary.ok) {
    failures.push(`verify-installation: ${summary.reason ?? "resultado inconclusivo"}`);
    await mark("validation", "error", summary.reason);
    return finish(url.origin, url.source);
  }
  checks.connectivity = "ok";

  // Primeiro acesso NÃO bloqueia: a instalação já está operacional e o Super
  // Admin é criado no fluxo /setup da própria instalação.
  const firstAccess = await readFirstAccessState(management);
  checks.super_admin = firstAccess.superAdmin;
  checks.workspace = firstAccess.workspace;
  await mark("validation", "done", `${summary.total} verificações PASS · ${firstAccess.detail}`);

  if (!provisionRelease) {
    failures.push("release do commit publicado não foi comprovada");
    await mark("version", "error", "release publicada ausente");
    return finish(url.origin, url.source);
  }
  await mark("version", "done", provisionRelease);

  return finish(url.origin, url.source);
}

/* ------------------------------------------------------------ primeiro acesso */

/**
 * Estado real do primeiro acesso da instalação: existe Super Admin e existe
 * EXATAMENTE um workspace. Não bloqueia a instalação (fica `attention`), mas
 * precisa ser reportado — sem isso o núcleo nunca é comprovado e o painel não
 * consegue afirmar que a instalação está PRONTA.
 */
export async function readFirstAccessState(management: {
  query: (sql: string) => Promise<{ ok: boolean; rows: readonly unknown[]; error?: string | null }>;
}): Promise<{ superAdmin: CheckState; workspace: CheckState; detail: string }> {
  const res = await management.query(
    "select (public.installation_setup_state()->>'has_super_admin')::boolean as has_super_admin," +
      " (select count(*) from public.brands) as brand_count",
  );
  if (!res.ok) {
    return {
      superAdmin: "pending",
      workspace: "pending",
      detail: "primeiro acesso não verificado",
    };
  }
  const row = res.rows[0] as
    | { has_super_admin?: boolean | null; brand_count?: unknown }
    | undefined;
  if (!row || !("has_super_admin" in row) || !("brand_count" in row)) {
    return {
      superAdmin: "pending",
      workspace: "pending",
      detail: "primeiro acesso não verificado: resposta vazia",
    };
  }
  const hasSuperAdmin = row.has_super_admin === true;
  const brands = Number(row.brand_count ?? 0);
  const workspace: CheckState = brands === 1 ? "ok" : brands === 0 ? "attention" : "error";
  return {
    superAdmin: hasSuperAdmin ? "ok" : "attention",
    workspace,
    detail: hasSuperAdmin
      ? brands === 1
        ? "Super Admin criado · 1 workspace"
        : brands === 0
          ? "Super Admin criado · workspace ainda não criado"
          : `atenção: ${brands} workspaces (o modelo é 1 por instalação)`
      : "crie o primeiro Super Admin em /setup",
  };
}

/* ------------------------------------------------------- validação automática */

type VerificationTarget = {
  step: (typeof VALIDATE_STEPS)[number]["id"];
  health: HealthCheckId;
};

/** Fonte única para a etapa da linha do tempo e o cartão de saúde. */
export function classifyVerificationTarget(checkName: string): VerificationTarget {
  const name = checkName.toLowerCase();
  if (
    name.startsWith("isolamento") ||
    name.startsWith("installation.app_url") ||
    name.startsWith("sem dados de negócio")
  )
    return { step: "isolation", health: "configuration" };
  if (name.startsWith("storage:")) return { step: "storage", health: "storage" };
  if (name.startsWith("cron:") || name.startsWith("vault:") || name.includes("brain_stats_mv"))
    return { step: "cron", health: "cron" };
  if (name.startsWith("seeds:") || name.startsWith("mensagens: recurso"))
    return { step: "seeds", health: "seeds" };
  if (
    name.startsWith("rls ") ||
    name.includes("policies") ||
    name.includes("triggers") ||
    name.startsWith("trigger ")
  )
    return { step: "rls", health: "rls" };
  if (
    name.startsWith("schema:") ||
    name.startsWith("módulo ") ||
    name.startsWith("clientes:") ||
    name.startsWith("briefing:") ||
    name.startsWith("conteúdo:") ||
    name.startsWith("auditoria:") ||
    name.startsWith("legendas:") ||
    name.startsWith("tarefas:") ||
    name.startsWith("ambiente:") ||
    name.startsWith("instalações:")
  )
    return { step: "schema", health: "schema" };
  return { step: "database", health: "database" };
}

/** Compatibilidade para consumidores existentes; ambos derivam da mesma regra. */
export function classifyVerificationCheck(checkName: string): VerificationTarget["step"] {
  return classifyVerificationTarget(checkName).step;
}

export function classifyVerificationHealthCheck(checkName: string): HealthCheckId {
  return classifyVerificationTarget(checkName).health;
}

type VerificationRow = { status: string; check_name: string; observed: string | null };

function normalizeVerificationRows(rows: readonly unknown[]): VerificationRow[] {
  return rows
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
    .map((r) => ({
      status: String(r["status"] ?? "")
        .trim()
        .toUpperCase(),
      check_name: String(r["check_name"] ?? "verificação sem nome"),
      observed: r["observed"] == null ? null : String(r["observed"]),
    }));
}

/**
 * Validação READ-ONLY executada pelo próprio MASTER via Management API, com as
 * credenciais de gestão do MASTER. Nada é criado ou alterado no destino — é o
 * mesmo `verify-installation.sql` do fallback manual, sem pedir Bash.
 */
export async function runAutomatedValidate(input: {
  client: Client;
  operation: OperationRow;
  installation: AutomationInstallation;
  env?: Record<string, string | undefined>;
  fetchImpl?: Fetcher;
}): Promise<{ result: "PASS" | "FAIL" | "BLOCKED"; reasons: string[]; total: number }> {
  const env = input.env ?? runtimeEnv();
  const { client, operation, installation } = input;
  const stepIds = VALIDATE_STEPS.map((s) => s.id);

  const fail = async (result: "FAIL" | "BLOCKED", reason: string, stepId = stepIds[0]!) => {
    await report(client, operation, stepId, "error", reason);
    await finalizeOperation(client as never, operation as never, {
      ok: false,
      summary: `${result}: ${reason}`,
      errorKind: result.toLowerCase(),
    });
    return { result, reasons: [reason], total: 0 };
  };

  const capability = resolveAutomationCapability(env);
  if (!capability.available) return fail("BLOCKED", capability.blockedReasons.join(" | "));

  const target = resolveAutomationTarget(installation);
  if (!target.ok) return fail("BLOCKED", target.reason);

  const management = createManagementClient({
    token: (env["UNITOS_SUPABASE_MANAGEMENT_TOKEN"] ?? "").trim(),
    projectRef: target.projectRef,
    fetchImpl: input.fetchImpl,
  });

  for (const id of stepIds) await report(client, operation, id, "running");

  await hardenHelperTables(management);
  const verify = await management.query(prepareVerificationSql(verifySql).sql);

  if (!verify.ok) {
    return fail(
      "BLOCKED",
      `verify-installation não pôde ser executado: ${verify.error ?? "falha"}`,
    );
  }

  const rows = normalizeVerificationRows(verify.rows);
  if (rows.length === 0) {
    return fail("FAIL", "verify-installation não retornou nenhuma verificação");
  }

  const failedByStep = new Map<string, string[]>();
  const totalByStep = new Map<string, number>();
  const failedHealth = new Set<HealthCheckId>();
  const measuredHealth = new Set<HealthCheckId>();
  for (const row of rows) {
    const target = classifyVerificationTarget(row.check_name);
    const step = target.step;
    const healthId = target.health;
    totalByStep.set(step, (totalByStep.get(step) ?? 0) + 1);
    measuredHealth.add(healthId);
    if (row.status === "FAIL") {
      const list = failedByStep.get(step) ?? [];
      list.push(row.check_name);
      failedByStep.set(step, list);
      failedHealth.add(healthId);
    }
  }

  const checks: Partial<Record<HealthCheckId, CheckState>> = {};
  for (const healthId of measuredHealth) {
    checks[healthId] = failedHealth.has(healthId) ? "error" : "ok";
  }

  for (const id of stepIds) {
    const failed = failedByStep.get(id) ?? [];
    const total = totalByStep.get(id) ?? 0;
    await report(
      client,
      operation,
      id,
      failed.length > 0 ? "error" : "done",
      failed.length > 0
        ? `${failed.length} de ${total} em FAIL: ${failed.slice(0, 4).join("; ")}`
        : `${total} verificação(ões) PASS`,
    );
  }

  const summary = summarizeVerificationRows(verify.rows);
  if (summary.ok) checks.connectivity = "ok";

  // Reporta também o primeiro acesso (Super Admin + workspace único) para que o
  // painel possa concluir READY sem depender de inspeção manual.
  const firstAccess = await readFirstAccessState(management);
  checks.super_admin = firstAccess.superAdmin;
  checks.workspace = firstAccess.workspace;

  await finalizeOperation(client as never, operation as never, {
    ok: summary.ok,
    version: summary.ok ? MASTER_RELEASE_VERSION : null,
    summary: summary.ok
      ? `Validação automática concluída — ${summary.total} verificações PASS · ${firstAccess.detail}.`
      : `FAIL: ${summary.reason ?? "verificações em FAIL"}`,
    errorKind: summary.ok ? null : "fail",
    checks: checks as never,
  }).catch(() => undefined);

  return {
    result: summary.ok ? "PASS" : "FAIL",
    reasons: summary.ok ? [] : summary.failedChecks,
    total: summary.total,
  };
}

/* ------------------------------------------- atualização de banco (delta SQL) */

/** Rótulo do arquivo de delta aplicado nas atualizações. */
export const UPDATE_DELTA_LABEL = "007_delta_migrations";

function localDeltaPackage(commitSha: string): OperationPackageSnapshot {
  const version = /^version=(.+)$/m.exec(deltaVersion)?.[1]?.trim() ?? "";
  const sha256 = /^sha256=([a-f0-9]{64})$/m.exec(deltaVersion)?.[1] ?? "";
  return {
    version,
    commitSha,
    sha256,
    total: splitDeltaMigrations(baseline007).length,
    sql: baseline007,
    manifest: deltaManifest,
  };
}

/** Assinatura do conteúdo do delta: muda sempre que novas migrations entram. */
function deltaFingerprint(sql: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x1000193;
  for (let i = 0; i < sql.length; i += 1) {
    const c = sql.charCodeAt(i);
    h1 = ((h1 ^ c) * 0x01000193) >>> 0;
    h2 = (h2 + c * 31) >>> 0;
  }
  return `${sql.length.toString(36)}-${h1.toString(36)}-${h2.toString(36)}`;
}

/**
 * Chave de checkpoint do delta no provisionamento. Inclui a impressão digital
 * do conteúdo: quando o MASTER publica um pacote novo, o checkpoint antigo não
 * vale mais e o delta é aplicado de novo (idempotente por statement) em vez de
 * ser pulado como "já aplicado".
 */
export function deltaProgressKey(sql: string): string {
  return `${UPDATE_DELTA_LABEL}:${deltaFingerprint(sql)}`;
}

export type DeltaMigration = { file: string; sql: string; fingerprint: string };
export const INCREMENTAL_LEDGER_CUTOVER_FILE =
  "20260913124118_9f453a5e-8c5e-4504-9f99-3a8ecfd59eb2.sql";

/**
 * Ponte mínima para instalações que já tinham o marcador cumulativo legado.
 * Algumas delas foram consideradas cobertas até o corte incremental mesmo sem
 * terem recebido as colunas de lease da migration do corte. A preparação roda
 * antes do ledger e permite que a primeira migration incremental crie seus
 * índices e funções sem depender de uma migration corretiva posterior.
 */
export const INSTALLATION_OPERATIONS_INCREMENTAL_PREREQUISITES_SQL = [
  "alter table public.installation_operations add column if not exists lease_owner text",
  "alter table public.installation_operations add column if not exists lease_expires_at timestamptz",
  "alter table public.installation_operations add column if not exists attempt_count integer not null default 0",
].join(";\n");

/** Divide o pacote pelos marcadores emitidos pelo gerador MASTER-first. */
export function splitDeltaMigrations(sql: string): DeltaMigration[] {
  const marker = /^-- -+\n-- ([0-9]{14}_[A-Za-z0-9_-]+\.sql)\n-- -+\n/gm;
  const matches = [...sql.matchAll(marker)];
  return matches.map((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index ?? sql.length;
    const body = sql.slice(start, end).trim();
    return {
      file: match[1] ?? `migration-${index}.sql`,
      sql: body,
      fingerprint: deltaFingerprint(body),
    };
  });
}

async function seedDeltaLedger(
  management: Pick<ManagementClient, "query">,
  migrations: DeltaMigration[],
): Promise<{ ok: boolean; error?: string }> {
  const setup = await management.query(
    [
      "create table if not exists public._unitos_applied_deltas (label text primary key, applied_at timestamptz not null default now())",
      "alter table public._unitos_applied_deltas add column if not exists kind text not null default 'blob'",
      "alter table public._unitos_applied_deltas add column if not exists file text",
      "alter table public._unitos_applied_deltas add column if not exists fingerprint text",
      "drop index if exists public._unitos_applied_deltas_file_key",
      "create unique index if not exists _unitos_applied_deltas_file_fingerprint_key on public._unitos_applied_deltas (file, fingerprint) where kind = 'migration'",
      HELPER_TABLE_HARDENING_SQL("public._unitos_applied_deltas"),
    ].join(";\n"),
  );
  if (!setup.ok) return { ok: false, error: setup.error };
  // Este helper cria somente a estrutura. Backfill por presunção é proibido:
  // uma migration só entra no ledger após execução confirmada pelo executor.
  if (migrations.length > 0) {
    return { ok: false, error: "backfill sem evidência verificável foi bloqueado" };
  }
  return { ok: true };
}

/** Progresso acumulado entre todas as migrations, sem regredir na troca de arquivo. */
export function databaseMigrationsPercent(input: {
  total: number;
  completed: number;
  currentProcessed?: number;
  currentTotal?: number;
}): number {
  if (input.total <= 0) return 100;
  const currentFraction =
    input.currentTotal && input.currentTotal > 0
      ? Math.min(1, Math.max(0, (input.currentProcessed ?? 0) / input.currentTotal))
      : 0;
  return Math.min(
    99,
    Math.max(0, Math.round(((input.completed + currentFraction) / input.total) * 100)),
  );
}

export type OperationPackageSnapshot = {
  version: string;
  commitSha: string;
  sha256: string;
  total: number;
  sql: string;
  manifest?: string;
};

export async function validateDeltaManifest(
  manifestRaw: string,
  sql: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const migrations = splitDeltaMigrations(sql);
  const entries = manifestRaw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [file = "", fingerprint = ""] = line.split(/\s+/);
      return { file, fingerprint: fingerprint.toLowerCase() };
    });
  if (entries.length !== migrations.length) {
    return {
      ok: false,
      error: `manifesto incompatível: esperado ${migrations.length}, recebido ${entries.length}`,
    };
  }
  for (let index = 0; index < migrations.length; index += 1) {
    const migration = migrations[index];
    const entry = entries[index];
    if (!migration || !entry || entry.file !== migration.file) {
      return { ok: false, error: `manifesto fora de ordem na posição ${index + 1}` };
    }
    if (!/^[0-9a-f]{64}$/.test(entry.fingerprint)) {
      return { ok: false, error: `manifesto sem SHA-256 válido para ${migration.file}` };
    }
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`${migration.sql.trim()}\n`),
    );
    const actual = Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    if (entry.fingerprint !== actual) {
      return { ok: false, error: `integridade da migration não confere: ${migration.file}` };
    }
  }
  return { ok: true };
}

export function operationPackageIdentity(snapshot: Omit<OperationPackageSnapshot, "sql">): string {
  return `${snapshot.version}:${snapshot.commitSha}:${snapshot.total}`;
}

export function validateOperationPackageSnapshot(
  operation: Pick<OperationRow, "baseline_id" | "baseline_hash">,
  snapshot: OperationPackageSnapshot,
): { ok: true } | { ok: false; error: string } {
  const actualTotal = splitDeltaMigrations(snapshot.sql).length;
  if (actualTotal !== snapshot.total) {
    return {
      ok: false,
      error: `total do pacote incompatível: esperado ${snapshot.total}, recebido ${actualTotal}`,
    };
  }
  if (operation.baseline_id !== operationPackageIdentity(snapshot)) {
    return { ok: false, error: "identidade do pacote divergiu da autorização da operação" };
  }
  if (operation.baseline_hash !== snapshot.sha256) {
    return { ok: false, error: "assinatura do pacote divergiu da autorização da operação" };
  }
  return { ok: true };
}

export async function validateCanonicalPackage(
  operation: Pick<OperationRow, "baseline_id" | "baseline_hash">,
  snapshot: OperationPackageSnapshot,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!/^\d+\.\d+\.\d+$/.test(snapshot.version)) {
    return { ok: false, error: "versão do pacote canônico é inválida" };
  }
  if (!/^[0-9a-f]{64}$/.test(snapshot.sha256)) {
    return { ok: false, error: "SHA-256 global do pacote é inválido" };
  }
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(snapshot.sql));
  const actualSha = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  if (actualSha !== snapshot.sha256) {
    return { ok: false, error: "SHA-256 global do pacote não confere" };
  }
  if (!snapshot.manifest) {
    return { ok: false, error: "manifesto canônico do pacote está ausente" };
  }
  const manifestCheck = await validateDeltaManifest(snapshot.manifest, snapshot.sql);
  if (!manifestCheck.ok) return manifestCheck;
  return validateOperationPackageSnapshot(operation, snapshot);
}

export function reconcileConfirmedMigrationCount(confirmed: number, observed: number) {
  const safeConfirmed = Math.max(0, Math.floor(confirmed));
  const safeObserved = Math.max(0, Math.floor(observed));
  return {
    completed: Math.max(safeConfirmed, safeObserved),
    partialRead: safeObserved < safeConfirmed,
  };
}

export type CanonicalMigrationProgress = {
  migration_file: string;
  fingerprint: string;
  package_position: number;
  statement_index: number;
  total_statements: number;
  status: "running" | "completed";
};

export function validateCanonicalMigrationProgress(
  rows: CanonicalMigrationProgress[],
  migrations: DeltaMigration[],
): { completed: Set<string>; current: CanonicalMigrationProgress | null } {
  const completed = new Set<string>();
  let current: CanonicalMigrationProgress | null = null;
  let expectedPosition = 1;
  for (const row of rows) {
    const migration = migrations[row.package_position - 1];
    if (
      row.package_position !== expectedPosition ||
      !migration ||
      migration.file !== row.migration_file ||
      migration.fingerprint !== row.fingerprint ||
      !Number.isInteger(row.statement_index) ||
      !Number.isInteger(row.total_statements) ||
      row.statement_index < 0 ||
      row.total_statements < row.statement_index
    ) {
      throw new Error("Progresso canônico parcial ou divergente do pacote fixado.");
    }
    if (row.status === "completed") {
      if (current || row.statement_index !== row.total_statements) {
        throw new Error("Progresso canônico contém uma conclusão incompatível.");
      }
      completed.add(`${row.migration_file}:${row.fingerprint}`);
    } else {
      if (current) throw new Error("Progresso canônico contém mais de uma migration em execução.");
      current = row;
    }
    expectedPosition += 1;
  }
  return { completed, current };
}

async function readCanonicalMigrationProgress(
  client: Client,
  operation: OperationRow,
): Promise<CanonicalMigrationProgress[]> {
  const { data, error } = await (
    client as never as {
      from: (table: string) => {
        select: (columns: string) => {
          eq: (
            column: string,
            value: string,
          ) => {
            order: (
              column: string,
              options: { ascending: boolean },
            ) => Promise<{ data?: unknown[] | null; error?: { message?: string } | null }>;
          };
        };
      };
    }
  )
    .from("installation_operation_migrations")
    .select(
      "migration_file, fingerprint, package_position, statement_index, total_statements, status",
    )
    .eq("operation_id", operation.id)
    .order("package_position", { ascending: true });
  if (error) throw new Error(error.message ?? "falha ao ler progresso canônico");
  if (!Array.isArray(data))
    throw new Error("Leitura do progresso canônico retornou resposta inválida.");
  return data.filter((row): row is CanonicalMigrationProgress => {
    if (!row || typeof row !== "object") return false;
    const value = row as Record<string, unknown>;
    return typeof value["migration_file"] === "string" && typeof value["fingerprint"] === "string";
  });
}

async function checkpointCanonicalMigration(
  client: Client,
  operation: OperationRow,
  migration: DeltaMigration,
  position: number,
  statementIndex: number,
  totalStatements: number,
  completed: boolean,
): Promise<void> {
  const rpc = client as never as {
    rpc: (
      name: string,
      args: Record<string, unknown>,
    ) => Promise<{ data?: unknown; error?: { message?: string } | null }>;
  };
  const { data, error } = await rpc.rpc("checkpoint_installation_migration", {
    _operation_id: operation.id,
    _owner: operation.lease_owner ?? "",
    _fencing_token: operation.fencing_token ?? -1,
    _migration_file: migration.file,
    _fingerprint: migration.fingerprint,
    _package_position: position,
    _statement_index: statementIndex,
    _total_statements: totalStatements,
    _completed: completed,
  });
  if (error || data !== true)
    throw new Error(error?.message ?? "lease da operação perdida no checkpoint canônico");
}

async function reconcileCanonicalMigrations(
  client: Client,
  operation: OperationRow,
  migrations: DeltaMigration[],
  appliedLabels: Set<string>,
): Promise<void> {
  const inventory = migrations
    .map((migration, index) => ({ migration, index }))
    .filter(({ migration }) => appliedLabels.has(`${migration.file}:${migration.fingerprint}`))
    .map(({ migration, index }) => {
      const totalStatements = splitSqlStatements(
        sanitizeBaselineSqlForManagementApi(migration.sql).sql,
      ).length;
      return {
        file: migration.file,
        fingerprint: migration.fingerprint,
        position: index + 1,
        statementIndex: totalStatements,
        totalStatements,
        completed: true,
      };
    });
  const rpc = client as never as {
    rpc: (
      name: string,
      args: Record<string, unknown>,
    ) => Promise<{ data?: unknown; error?: { message?: string } | null }>;
  };
  const { data, error } = await rpc.rpc("reconcile_installation_operation_migrations", {
    _operation_id: operation.id,
    _owner: operation.lease_owner ?? "",
    _fencing_token: operation.fencing_token ?? -1,
    _migrations: inventory,
  });
  if (error || typeof data !== "number")
    throw new Error(error?.message ?? "reconciliação canônica não confirmada");
}

/**
 * Aplica o delta de banco do MASTER no Supabase da instalação, item por item,
 * com checkpoint e ledger no banco de destino. Idempotente: repetir com o mesmo
 * delta já registrado é no-op.
 */
export async function applyDatabaseDelta(input: {
  client: Client;
  operation: OperationRow;
  installation: AutomationInstallation;
  env?: Record<string, string | undefined>;
  fetchImpl?: Fetcher;
  maxStatementsPerInvocation?: number;
  timeBudgetMs?: number;
  maxMigrationsPerInvocation?: number;
  now?: () => number;
  snapshot: OperationPackageSnapshot;
}): Promise<
  | { state: "done"; detail: string; percent: 100 }
  | { state: "pending"; detail: string; percent: number }
  | { state: "blocked" | "error"; detail: string }
> {
  const env = input.env ?? runtimeEnv();
  const { client, operation, installation } = input;

  const target = resolveAutomationTarget(installation);
  if (!target.ok) return { state: "blocked", detail: target.reason };

  const managementToken = (env["UNITOS_SUPABASE_MANAGEMENT_TOKEN"] ?? "").trim();
  if (!managementToken) {
    return { state: "blocked", detail: "credencial de gestão do Supabase indisponível no MASTER" };
  }

  const management = createManagementClient({
    token: managementToken,
    projectRef: target.projectRef,
    fetchImpl: input.fetchImpl,
  });

  const prerequisites = await management.query(
    INSTALLATION_OPERATIONS_INCREMENTAL_PREREQUISITES_SQL,
  );
  if (!prerequisites.ok) {
    return {
      state: "error",
      detail: `preparação do banco para migrations incrementais falhou: ${prerequisites.error ?? "erro"}`,
    };
  }

  const migrations = splitDeltaMigrations(input.snapshot.sql);
  if (migrations.length === 0) {
    return { state: "error", detail: "pacote de migrations do MASTER está sem marcadores válidos" };
  }
  const validatedSnapshot = await validateCanonicalPackage(operation, input.snapshot);
  if (!validatedSnapshot.ok) return { state: "blocked", detail: validatedSnapshot.error };

  const ledgerSetup = await seedDeltaLedger(management, []);
  if (!ledgerSetup.ok)
    return {
      state: "error",
      detail: `banco da instalação inacessível: ${ledgerSetup.error ?? "falha"}`,
    };
  const ledger = await management.query(
    "select label, file, fingerprint from public._unitos_applied_deltas order by applied_at, label",
  );
  if (!ledger.ok) {
    return {
      state: "error",
      detail: `banco da instalação inacessível: ${ledger.error ?? "falha"}`,
    };
  }
  const appliedLabels = new Set(
    ledger.rows
      .filter((row): row is Record<string, unknown> => !!row && typeof row === "object")
      .filter((row) => Boolean(row["file"] && row["fingerprint"]))
      .map((row) => `${String(row["file"])}:${String(row["fingerprint"])}`)
      .filter(Boolean),
  );
  const hasLegacyBlob = ledger.rows.some(
    (row) =>
      !!row &&
      typeof row === "object" &&
      String((row as Record<string, unknown>)["label"] ?? "").startsWith(
        `${UPDATE_DELTA_LABEL}:`,
      ) &&
      !(row as Record<string, unknown>)["file"],
  );
  if (hasLegacyBlob && appliedLabels.size === 0) {
    return {
      state: "blocked",
      detail:
        "ledger legado sem evidência por migration; reconciliação verificável é obrigatória antes de continuar",
    };
  }
  await reconcileCanonicalMigrations(client, operation, migrations, appliedLabels);
  let canonicalProgress = await readCanonicalMigrationProgress(client, operation);
  let canonicalState = validateCanonicalMigrationProgress(canonicalProgress, migrations);
  const canonicalCompleted = canonicalState.completed;
  let migration = migrations.find(
    (item) => !canonicalCompleted.has(`${item.file}:${item.fingerprint}`),
  );
  if (!migration) {
    return { state: "done", detail: "banco já está na versão do MASTER", percent: 100 };
  }

  const now = input.now ?? Date.now;
  const startedAt = now();
  const budgetMs = input.timeBudgetMs ?? UPDATE_DATABASE_TIME_BUDGET_MS;
  const migrationLimit =
    input.maxMigrationsPerInvocation ?? UPDATE_DATABASE_MIGRATIONS_PER_INVOCATION;
  let processedMigrations = 0;

  while (migration) {
    const ledgerLabel = `${migration.file}:${migration.fingerprint}`;
    const migrationPosition =
      migrations.findIndex(
        (item) => item.file === migration?.file && item.fingerprint === migration?.fingerprint,
      ) + 1;
    const canonicalCurrent =
      canonicalState.current?.migration_file === migration.file &&
      canonicalState.current.fingerprint === migration.fingerprint
        ? canonicalState.current.statement_index
        : 0;
    const alreadyApplied = canonicalCurrent;
    const prepared = sanitizeBaselineSqlForManagementApi(migration.sql);
    const applied = await applyStatementByStatement(management, prepared.sql, {
      runKey: `${operation.id}:${ledgerLabel}`,
      isCancelled: () => shouldInterruptOperation(client as never, operation),
      startIndex: alreadyApplied === DONE ? 0 : alreadyApplied,
      maxStatements: input.maxStatementsPerInvocation ?? BASELINE_STATEMENTS_PER_INVOCATION,
    });

    if (!applied.ok) {
      await checkpointCanonicalMigration(
        client,
        operation,
        migration,
        migrationPosition,
        applied.processed ?? alreadyApplied,
        applied.total ?? splitSqlStatements(prepared.sql).length,
        false,
      );
      return { state: "error", detail: `atualização do banco falhou: ${applied.error ?? "erro"}` };
    }

    if (!applied.complete) {
      await checkpointCanonicalMigration(
        client,
        operation,
        migration,
        migrationPosition,
        applied.processed,
        applied.total,
        false,
      );
      const percent = databaseMigrationsPercent({
        total: migrations.length,
        completed: canonicalCompleted.size,
        currentProcessed: applied.processed,
        currentTotal: applied.total,
      });
      return {
        state: "pending",
        percent,
        detail: `Banco ${canonicalCompleted.size}/${migrations.length} migrations; atual ${applied.processed}/${applied.total} comandos · ${percent}%`,
      };
    }

    const mark = await management.query(
      `insert into public._unitos_applied_deltas (label, kind, file, fingerprint) values (${sqlLiteral(ledgerLabel)}, 'migration', ${sqlLiteral(migration.file)}, ${sqlLiteral(migration.fingerprint)}) on conflict do nothing`,
    );
    if (!mark.ok) {
      return {
        state: "error",
        detail: `registro da versão do banco falhou: ${mark.error ?? "erro"}`,
      };
    }
    await checkpointCanonicalMigration(
      client,
      operation,
      migration,
      migrationPosition,
      applied.total,
      applied.total,
      true,
    );
    appliedLabels.add(ledgerLabel);
    canonicalCompleted.add(ledgerLabel);
    processedMigrations += 1;

    const remaining = migrations.length - canonicalCompleted.size;
    if (remaining === 0) {
      await management.query("NOTIFY pgrst, 'reload schema';").catch(() => undefined);
      return {
        state: "done",
        detail: `banco atualizado (${migrations.length} migrations registradas)`,
        percent: 100,
      };
    }

    const percent = databaseMigrationsPercent({
      total: migrations.length,
      completed: canonicalCompleted.size,
    });
    if (processedMigrations >= migrationLimit || now() - startedAt >= budgetMs) {
      await management.query("NOTIFY pgrst, 'reload schema';").catch(() => undefined);
      return {
        state: "pending",
        percent,
        detail: `Banco ${canonicalCompleted.size}/${migrations.length} migrations concluídas; ${remaining} pendentes · ${percent}%`,
      };
    }
    canonicalProgress = await readCanonicalMigrationProgress(client, operation);
    canonicalState = validateCanonicalMigrationProgress(canonicalProgress, migrations);
    migration = migrations.find(
      (item) => !canonicalState.completed.has(`${item.file}:${item.fingerprint}`),
    );
  }

  return {
    state: "done",
    detail: `banco atualizado (${migrations.length} migrations registradas)`,
    percent: 100,
  };
}

/* ----------------------------------------------------- atualização de código */

/**
 * ATUALIZAÇÃO DE CÓDIGO — traz o código publicado no MASTER para o deploy da
 * instalação. Dispara um novo build a partir do repositório ligado ao projeto
 * de deploy (branch de produção) e acompanha o estado até `READY`.
 *
 * Sem repositório ligado, o Vercel só permite reaproveitar o snapshot anterior:
 * nesse caso a operação termina em `attention` explicando que o código novo
 * exige um deploy ligado ao repositório — nunca finge sucesso.
 */
export async function runAutomatedUpdate(input: {
  client: Client;
  operation: OperationRow;
  installation: AutomationInstallation;
  env?: Record<string, string | undefined>;
  fetchImpl?: Fetcher;
  /** Commit do MASTER autorizado pelo Super Admin para esta instalação. */
  commitSha?: string | null;

  /** Tempo máximo aguardando o build ficar READY. */
  waitMs?: number;
  sleep?: (ms: number) => Promise<void>;
}): Promise<{ result: "PASS" | "PENDING" | "FAIL" | "BLOCKED"; reasons: string[] }> {
  const env = input.env ?? runtimeEnv();
  const { client, operation, installation } = input;

  const fail = async (result: "FAIL" | "BLOCKED", reason: string, stepId = "code") => {
    await report(client, operation, stepId, "error", reason);
    await finalizeOperation(client as never, operation as never, {
      ok: false,
      summary: `${result}: ${reason}`,
      errorKind: result.toLowerCase(),
    });
    return { result, reasons: [reason] };
  };

  const capability = resolveAutomationCapability(env);
  if (!capability.vercel.available) {
    return fail("BLOCKED", capability.vercel.reason ?? "token de deploy indisponível no MASTER");
  }
  const project = (installation.deployProject ?? "").trim();
  if (!project) {
    return fail("BLOCKED", "a instalação não tem projeto de deploy configurado");
  }

  const target = resolveAutomationTarget(installation);
  if (!target.ok) return fail("BLOCKED", target.reason, "database");
  const management = createManagementClient({
    token: (env["UNITOS_SUPABASE_MANAGEMENT_TOKEN"] ?? "").trim(),
    projectRef: target.projectRef,
    fetchImpl: input.fetchImpl,
  });
  // Instalações antigas também passam a nascer/ficar sem confirmação de e-mail.
  await applyInstallationAuthDefaults(management).catch(() => undefined);

  const masterRepo = (env["UNITOS_MASTER_REPO"] ?? "").trim() || null;
  const repo = resolveInstallationRepo({
    gitRepoUrl: installation.gitRepoUrl ?? null,
    masterRepo: masterRepo ?? DEFAULT_MASTER_REPO,
  });
  if (!repo.ok) {
    return fail("BLOCKED", repo.reason);
  }
  if (!capability.github.available) {
    return fail("BLOCKED", capability.github.reason ?? "token do GitHub indisponível no MASTER");
  }

  const deploy = createDeployClient({
    token: (env["UNITOS_VERCEL_TOKEN"] ?? "").trim(),
    project,
    teamId: (env["UNITOS_VERCEL_TEAM_ID"] ?? "").trim() || null,
    masterRepo,
    repo: repo.slug,
    githubToken: (env["UNITOS_GITHUB_TOKEN"] ?? "").trim(),
    fetchImpl: input.fetchImpl,
  });
  const code = createCodeClient({
    token: (env["UNITOS_GITHUB_TOKEN"] ?? "").trim(),
    masterToken:
      (process.env["UNITOS_GITHUB_TOKEN"] ?? "").trim() ||
      (env["UNITOS_GITHUB_TOKEN"] ?? "").trim(),
    owner: repo.owner,
    repo: repo.repo,
    masterRepo,
    fetchImpl: input.fetchImpl,
  });

  const checkpoint = await readStageProgress(client, operation);
  const alreadyPublished = checkpoint.codeDone === true && Boolean(checkpoint.codeSha);
  const targetSha = alreadyPublished
    ? (checkpoint.codeSha ?? null)
    : (input.commitSha ?? "").trim() || null;
  if (!targetSha) {
    return fail("BLOCKED", "a operação não possui commit autorizado do MASTER");
  }
  const packageSnapshot = await code.releaseSnapshotAtCommit(targetSha);
  if (
    !packageSnapshot.ok ||
    !packageSnapshot.version ||
    !packageSnapshot.sha256 ||
    !packageSnapshot.total ||
    !packageSnapshot.sql
  ) {
    return fail("BLOCKED", packageSnapshot.error ?? "snapshot autorizado do MASTER indisponível");
  }
  const snapshot = {
    version: packageSnapshot.version,
    commitSha: targetSha,
    sha256: packageSnapshot.sha256,
    total: packageSnapshot.total,
    sql: packageSnapshot.sql,
  };
  if (!operation.baseline_id && !operation.baseline_hash) {
    const rpc = client as never as {
      rpc: (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<{ data?: unknown; error?: { message?: string } | null }>;
    };
    const { data: sealed, error: sealError } = await rpc.rpc(
      "seal_installation_operation_baseline",
      {
        _operation_id: operation.id,
        _owner: operation.lease_owner ?? "",
        _fencing_token: operation.fencing_token ?? -1,
        _baseline_id: operationPackageIdentity(snapshot),
        _baseline_hash: snapshot.sha256,
      },
    );
    if (sealError || sealed !== true) {
      return fail(
        "BLOCKED",
        sealError?.message ?? "não foi possível fixar o pacote autorizado da operação",
      );
    }
    operation.baseline_id = operationPackageIdentity(snapshot);
    operation.baseline_hash = snapshot.sha256;
  }
  const snapshotValidation = validateOperationPackageSnapshot(operation, snapshot);
  if (!snapshotValidation.ok) return fail("BLOCKED", snapshotValidation.error);

  // Nenhum delta é aplicado antes de comprovar banco, GitHub e Vercel.
  const updatePreflight = await preflightAccess({
    management,
    suppliedKeys: {
      publishableKey: (env["UNITOS_SUPABASE_PUBLISHABLE_KEY"] ?? "").trim(),
      serviceRoleKey: (env["UNITOS_SUPABASE_SERVICE_ROLE_KEY"] ?? "").trim(),
    },
    deploy,
    code,
    deployProject: project,
  });
  if (updatePreflight.terminal || updatePreflight.transient) {
    return fail(
      "BLOCKED",
      updatePreflight.terminal ??
        `${updatePreflight.transient ?? "serviço temporariamente indisponível"}. Tente novamente em alguns minutos.`,
      updatePreflight.checks.find((check) => !check.ok)?.area === "database" ? "database" : "code",
    );
  }

  /* Banco antes do código, mas somente depois do preflight completo. */
  await report(client, operation, "database", "running");
  const delta = await applyDatabaseDelta({
    client,
    operation,
    installation,
    env,
    snapshot,
    ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
  });
  if (delta.state === "blocked" || delta.state === "error") {
    return fail(delta.state === "blocked" ? "BLOCKED" : "FAIL", delta.detail, "database");
  }
  if (delta.state === "pending") {
    await report(client, operation, "database", "running", delta.detail, delta.percent);
    return { result: "PENDING", reasons: [delta.detail] };
  }
  await report(client, operation, "database", "done", delta.detail, 100);

  // Checkpoints antigos podem apontar para uma tentativa REST recusada. Só um
  // deployment associado ao commit de push Git pode ser retomado.
  let deploymentId = checkpoint.updateGitPushCommit
    ? (checkpoint.updateDeploymentId ?? null)
    : null;
  let deploymentSource: "git" | "rebuild" | undefined = checkpoint.updateGitPushCommit
    ? "git"
    : undefined;
  let deploymentRef = checkpoint.updateGitPushCommit ?? checkpoint.updateDeploymentRef;
  let gitPushCommit = checkpoint.updateGitPushCommit ?? null;

  // Retomada: se o código desta MESMA operação já foi publicado, o alvo é o
  // commit do checkpoint. Nunca revalidar "MASTER publicado" aqui — o pacote já
  // está no repositório da instalação e barrar agora perderia o registro da
  // versão (foi exatamente o que deixou o painel parado numa versão antiga).
  // Commit autorizado pelo Super Admin (gravado na operação). Sem ele, fixa o
  // commit atual da branch do MASTER no momento da autorização.

  // A versão que existe DENTRO do commit do MASTER. O repositório de código só
  // avança quando o MASTER é publicado; sem esta checagem a operação enviaria o
  // mesmo pacote de novo e ainda gravaria o número de versão novo na instalação.
  const { compareReleaseVersions, masterNotPublishedMessage } = await import("./manager-contract");
  let publishedRelease = alreadyPublished
    ? (checkpoint.updateRelease ?? null)
    : packageSnapshot.version;
  if (!publishedRelease) {
    const repoRelease = await code.releaseAtCommit(targetSha);
    if (!repoRelease.ok || !repoRelease.version) {
      return fail(
        "BLOCKED",
        repoRelease.error ?? "versão do pacote do MASTER não pôde ser lida no commit autorizado",
        "code",
      );
    }
    publishedRelease = repoRelease.version;
    if (!alreadyPublished && compareReleaseVersions(publishedRelease, MASTER_RELEASE_VERSION) < 0) {
      return fail(
        "BLOCKED",
        masterNotPublishedMessage(publishedRelease, MASTER_RELEASE_VERSION),
        "code",
      );
    }
    await saveStageProgress(client, operation, { updateRelease: publishedRelease });
  }

  // A instalação constrói o SEU repositório: a versão autorizada do MASTER é
  // publicada nele antes do build. Sem isso o deployment repetiria o código
  // antigo. Idempotente: repetir não gera commit novo (devolve o commit atual).
  let buildRef: string | null = null;
  let changedFiles: number | null = null;
  if (!deploymentId) {
    await report(client, operation, "code", "running");
    const ensured = await code.ensureRepo();
    if (!ensured.ok) {
      return fail("BLOCKED", ensured.error ?? `repositório ${repo.slug} indisponível`);
    }
    const reusableBlobs =
      checkpoint.codeSourceSha === targetSha ? (checkpoint.codeBlobs ?? {}) : {};
    await saveStageProgress(client, operation, {
      codeSourceSha: targetSha,
      codeBlobs: reusableBlobs,
    });
    const published = await code.publishSnapshot(targetSha, {
      blobMap: reusableBlobs,
      timeBudgetMs: 20_000,
      onProgress: async (progress) => {
        await report(client, operation, "code", "running", progress.detail, progress.percent);
      },
      onCheckpoint: async (blobMap) => {
        await saveStageProgress(client, operation, {
          codeSourceSha: targetSha,
          codeBlobs: blobMap,
        });
      },
    });
    if (!published.ok) {
      const detail = withRepoWriteHint(
        published.error ?? `não foi possível publicar em ${repo.slug}`,
        repo.slug,
      );
      return fail(classifyAccessFailure(detail) === "permission" ? "BLOCKED" : "FAIL", detail);
    }

    if (published.partial) {
      const detail =
        published.note ??
        `publicando código em ${repo.slug} — ${published.changed ?? 0} arquivos nesta rodada (continua)`;
      await report(client, operation, "code", "running", detail);
      return { result: "PENDING", reasons: [detail] };
    }
    buildRef = published.commitSha ?? null;
    changedFiles = typeof published.changed === "number" ? published.changed : null;
    await saveStageProgress(client, operation, {
      codeDone: true,
      codeSha: targetSha,
      codeRepo: repo.slug,
      codeBlobs: {},
    });
    // Quando houve alteração, publishSnapshot já avançou a branch e esse é o
    // commit que deve disparar/identificar o build Git. Se nada mudou, o helper
    // abaixo cria um commit vazio para produzir um novo webhook inequívoco.
    if ((changedFiles ?? 0) > 0 && buildRef) {
      gitPushCommit = buildRef;
      deploymentSource = "git";
      deploymentRef = buildRef;
      await saveStageProgress(client, operation, {
        updateGitPushCommit: buildRef,
        updateDeploymentSource: "git",
        updateDeploymentRef: buildRef,
        updateDeploymentId: null,
      });
    }
  }

  /**
   * Saída por PUSH quando a API não pode publicar: cota diária estourada, a
   * Vercel não resolve o repositório, ou a conta só aceita publicação disparada
   * pelo Git em produção. O código autorizado JÁ está no repositório da
   * instalação, então basta ligar o build automático e forçar o gatilho.
   */
  const finishByGitPush = async (
    cause: string,
  ): Promise<{ result: "PASS" | "PENDING" | "FAIL" | "BLOCKED"; reasons: string[] }> => {
    await deploy.setAutoDeploy(true);
    // Um commit vazio produz um SHA inequívoco para localizar o build criado
    // pelo webhook Git. O checkpoint evita novos nudges em cada retomada.
    let pushedCommit = gitPushCommit;
    if (!pushedCommit) {
      const nudge = await code.nudgeDeploy("chore(unitos): republicar versao autorizada");
      if (!nudge.ok || !nudge.commitSha) {
        return fail(
          "FAIL",
          `${cause} · publicação pelo Git também falhou: ${nudge.error ?? "commit de publicação não retornado"}`.trim(),
          "build",
        );
      }
      pushedCommit = nudge.commitSha;
      deploymentSource = "git";
      deploymentRef = pushedCommit;
      await saveStageProgress(client, operation, {
        updateGitPushCommit: pushedCommit,
        updateDeploymentSource: "git",
        updateDeploymentRef: pushedCommit,
        updateDeploymentId: null,
      });
    }
    const appliedByPush = publishedRelease ?? MASTER_RELEASE_VERSION;
    const shortPush = targetSha ? targetSha.slice(0, 7) : null;

    if (!deploymentId) {
      const located = await deploy.findProductionDeployment(pushedCommit);
      if (!located.ok) {
        await report(
          client,
          operation,
          "build",
          "running",
          located.error ?? "aguardando a hospedagem",
        );
        return { result: "PENDING", reasons: [located.error ?? "aguardando a hospedagem"] };
      }
      deploymentId = located.deploymentId ?? null;
      if (!deploymentId) {
        await report(
          client,
          operation,
          "build",
          "running",
          "aguardando a hospedagem detectar o novo commit",
        );
        return { result: "PENDING", reasons: ["aguardando a hospedagem detectar o novo commit"] };
      }
      await saveStageProgress(client, operation, { updateDeploymentId: deploymentId });
    }

    await report(client, operation, "code", "done", "código publicado no repositório");
    await report(client, operation, "build", "running", `build disparado pelo Git (${cause})`);
    const polled = await pollDeploymentUntilTerminal({
      deploy,
      deploymentId,
      waitMs: input.waitMs,
      sleep: input.sleep,
      onObserved: async () =>
        saveStageProgress(client, operation, { updateDeploymentId: deploymentId }),
    });
    const pushState = polled.state;
    const pushUrl = polled.url;
    const pushRefusedReason = polled.refused
      ? (polled.reason ?? `a hospedagem recusou a publicação (${pushState})`)
      : null;
    if (pushRefusedReason) {
      return fail(
        "FAIL",
        `o build disparado pelo Git foi recusado pela hospedagem: ${pushRefusedReason}`,
        "build",
      );
    }
    if (FAILED_DEPLOYMENT_STATES.has(pushState)) {
      return fail("FAIL", `o build disparado pelo Git terminou em ${pushState}`, "build");
    }
    if (pushState !== "READY") {
      const startedAt = Date.parse(
        ((operation as unknown as { started_at?: string | null; created_at?: string | null })
          .started_at ??
          (operation as unknown as { created_at?: string | null }).created_at ??
          "") as string,
      );
      const elapsedMin = Number.isFinite(startedAt) ? (Date.now() - startedAt) / 60_000 : 0;
      if (elapsedMin >= BUILD_MAX_MINUTES) {
        return fail(
          "FAIL",
          `a publicação pelo Git não concluiu em ${BUILD_MAX_MINUTES} minutos (último estado: ${pushState}). Confira a hospedagem e autorize a atualização novamente.`,
          "build",
        );
      }
      await report(
        client,
        operation,
        "build",
        "running",
        `build disparado pelo Git em andamento (${pushState})`,
      );
      return { result: "PENDING", reasons: [`build disparado pelo Git em ${pushState}`] };
    }
    await report(
      client,
      operation,
      "build",
      "done",
      pushUrl ? `publicado em ${pushUrl}` : "publicado",
    );
    await report(client, operation, "validation", "running");
    await hardenHelperTables(management);
    const pushVerification = await management.query(prepareVerificationSql(verifySql).sql);
    if (!pushVerification.ok) {
      return fail(
        "FAIL",
        `a validação final não pôde ser executada: ${pushVerification.error ?? "falha"}`,
        "validation",
      );
    }
    const pushSummary = summarizeVerificationRows(pushVerification.rows);
    if (!pushSummary.ok) {
      return fail(
        "FAIL",
        pushSummary.reason ?? "a validação final encontrou inconsistências",
        "validation",
      );
    }
    await report(client, operation, "validation", "done", `${pushSummary.total} verificações PASS`);
    await report(
      client,
      operation,
      "version",
      "done",
      shortPush ? `${appliedByPush} (${shortPush})` : appliedByPush,
    );

    if (targetSha) {
      const { error: pinError } = await (
        client.from("installations") as unknown as {
          update: (v: Record<string, unknown>) => {
            eq: (c: string, v: string) => Promise<{ error?: { message?: string } | null }>;
          };
        }
      )
        .update({
          pinned_commit_sha: targetSha,
          pinned_release: appliedByPush,
          pinned_at: new Date().toISOString(),
        })
        .eq("id", installation.id);
      if (pinError) {
        return fail(
          "FAIL",
          `a publicação ficou pronta, mas a versão não pôde ser registrada: ${pinError.message ?? "falha no registro"}`,
          "version",
        );
      }
    }

    await finalizeOperation(client as never, operation as never, {
      ok: true,
      version: appliedByPush,
      summary: `Atualização aplicada: código do MASTER (${appliedByPush}${shortPush ? ` · ${shortPush}` : ""}) confirmado na hospedagem após publicação pelo Git.`,
    }).catch(() => undefined);
    return { result: "PASS", reasons: [] };
  };
  return finishByGitPush("atualização enviada ao repositório");
}
