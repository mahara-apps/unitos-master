import baseline000 from "../../supabase/baseline-snapshot/000_extensions.sql?raw";
import baseline001 from "../../supabase/baseline-snapshot/001_initial_schema.sql?raw";
import baseline003 from "../../supabase/baseline-snapshot/003_storage_buckets.sql?raw";
import baseline004 from "../../supabase/baseline-snapshot/004_seeds.sql?raw";
import baseline005 from "../../supabase/baseline-snapshot/005_auth_trigger.sql?raw";
import baseline006 from "../../supabase/baseline-snapshot/006_storage_policies.sql?raw";
import baseline007 from "../../supabase/baseline-snapshot/007_delta_migrations.sql?raw";
import verifySql from "../../supabase/install/verify-installation-client.sql?raw";

import {
  applyStatementByStatement,
  createManagementClient,
  VECTOR_EXTENSION_POSTCONDITION,
} from "../../src/lib/installation/automation.server";
import {
  prepareVerificationSql,
  sanitizeBaselineSqlForManagementApi,
} from "../../src/lib/installation/baseline-sql";
import { BASELINE_ORDER } from "../../src/lib/installation/bootstrap-contract";
import {
  FORBIDDEN_MASTER_PROJECT_REF,
  INTEGRATION_TEST_PROJECT_REF,
  assertPrivilegedTestEnv,
} from "./test-env";

type QueryResult = { ok: boolean; rows: unknown[]; error?: string };
type Management = { query: (sql: string) => Promise<QueryResult> };

const BASELINE_SQL: Record<(typeof BASELINE_ORDER)[number], string> = {
  "000_extensions.sql": baseline000,
  "001_initial_schema.sql": baseline001,
  "005_auth_trigger.sql": baseline005,
  "007_delta_migrations.sql": baseline007,
  "003_storage_buckets.sql": baseline003,
  "006_storage_policies.sql": baseline006,
  "004_seeds.sql": baseline004,
};

const INSPECT_SCHEMA_SQL = `
select
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r','p') and c.relname not like '_unitos_%') as public_tables,
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r','p')
      and c.relname in ('brands','clients','projects','tasks','installation')) as critical_tables
`;

const INSPECT_BUSINESS_DATA_SQL = `
select
  (select count(*)::int from public.brands) +
  (select count(*)::int from public.clients) +
  (select count(*)::int from public.projects) +
  (select count(*)::int from public.tasks) +
  (select count(*)::int from public.posts) +
  (select count(*)::int from public.brand_api_credentials) as business_rows
`;

const EXPECTED_OPERATIONAL_FAILURES = new Set([
  "installation.app_url definido e https",
  "vault: cron_secret presente e com tamanho mínimo",
  "cron: total de jobs (esperado 14+)",
  "cron: jobs HTTP apontam para installation.app_url",
  "cron: nenhuma URL do MASTER",
  "cron: jobs HTTP usam x-cron-secret (nunca chave anon)",
  "cron: limpeza diária da Lixeira de Conteúdo",
  "brain_stats_mv existe e está populada",
]);

function numberField(row: unknown, field: string): number {
  if (!row || typeof row !== "object") return Number.NaN;
  return Number((row as Record<string, unknown>)[field]);
}

async function requireQuery(management: Management, sql: string, label: string): Promise<unknown[]> {
  const result = await management.query(sql);
  if (!result.ok) throw new Error(`${label}: ${result.error ?? "consulta recusada"}`);
  return result.rows;
}

async function verifyClientSchema(management: Management): Promise<void> {
  const prepared = prepareVerificationSql(verifySql);
  const rows = await requireQuery(management, prepared.sql, "verificação Client");
  if (rows.length === 0) throw new Error("verificação Client não retornou checks");
  const failures = rows
    .filter((row): row is Record<string, unknown> => !!row && typeof row === "object")
    .filter((row) => String(row["status"] ?? "").toUpperCase() === "FAIL")
    .map((row) => String(row["check_name"] ?? "verificação sem nome"))
    .filter((name) => !EXPECTED_OPERATIONAL_FAILURES.has(name));
  if (failures.length > 0) {
    throw new Error(`schema descartável reprovado: ${failures.slice(0, 5).join("; ")}`);
  }
}

export async function ensureGlobalTestSchema(options?: {
  management?: Management;
  applyFile?: (management: Management, name: string, sql: string) => Promise<void>;
}): Promise<"ready" | "provisioned"> {
  assertPrivilegedTestEnv("GLOBAL_TEST_SCHEMA_SETUP");
  const projectRef = (process.env["SUPABASE_PROJECT_ID"] ?? "").trim();
  if (projectRef === FORBIDDEN_MASTER_PROJECT_REF || projectRef !== INTEGRATION_TEST_PROJECT_REF) {
    throw new Error("GLOBAL_TEST_SCHEMA_SETUP bloqueado: alvo não é o descartável autorizado");
  }

  const token = (process.env["DISPOSABLE_SUPABASE_MANAGEMENT_TOKEN"] ?? "").trim();
  if (!options?.management && !token) {
    throw new Error("GLOBAL_TEST_SCHEMA_SETUP bloqueado: credencial de gestão descartável ausente");
  }
  const management =
    options?.management ?? createManagementClient({ token, projectRef: INTEGRATION_TEST_PROJECT_REF });
  const inspected = await requireQuery(management, INSPECT_SCHEMA_SQL, "inspeção do schema");
  const publicTables = numberField(inspected[0], "public_tables");
  const criticalTables = numberField(inspected[0], "critical_tables");
  if (!Number.isInteger(publicTables) || !Number.isInteger(criticalTables)) {
    throw new Error("inspeção do schema retornou resultado inválido");
  }

  if (criticalTables === 5) {
    const business = await requireQuery(management, INSPECT_BUSINESS_DATA_SQL, "inspeção de dados");
    if (numberField(business[0], "business_rows") !== 0) {
      throw new Error("setup recusado: o projeto contém dados de negócio e não será alterado");
    }
    await verifyClientSchema(management);
    return "ready";
  }
  if (publicTables !== 0 || criticalTables !== 0) {
    throw new Error("setup recusado: schema parcial ou desconhecido; nenhuma correção automática foi feita");
  }

  const applyFile =
    options?.applyFile ??
    (async (target: Management, name: string, sql: string) => {
      const prepared = sanitizeBaselineSqlForManagementApi(sql);
      const applied = await applyStatementByStatement(target, prepared.sql, {
        runKey: `global-test-schema:${name}`,
        maxStatements: Number.POSITIVE_INFINITY,
        ...(name === "000_extensions.sql"
          ? { completionPostcondition: VECTOR_EXTENSION_POSTCONDITION }
          : {}),
      });
      if (!applied.ok || !applied.complete) {
        throw new Error(`${name}: ${applied.ok ? "aplicação incompleta" : applied.error ?? "falha"}`);
      }
    });
  for (const name of BASELINE_ORDER) await applyFile(management, name, BASELINE_SQL[name]);
  await requireQuery(management, "NOTIFY pgrst, 'reload schema';", "recarga do schema");
  await verifyClientSchema(management);
  return "provisioned";
}

export const GLOBAL_TEST_BASELINE_ORDER = BASELINE_ORDER;