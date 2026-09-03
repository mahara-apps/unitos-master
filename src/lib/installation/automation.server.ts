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
import baseline003 from "../../../supabase/baseline-snapshot/003_storage_buckets.sql?raw";
import baseline006 from "../../../supabase/baseline-snapshot/006_storage_policies.sql?raw";
import baseline004 from "../../../supabase/baseline-snapshot/004_seeds.sql?raw";
import install010 from "../../../supabase/install/010_installation_identity.sql?raw";
import install011 from "../../../supabase/install/011_brain_stats_init.sql?raw";
import install020 from "../../../supabase/install/020_cron.sql?raw";
import verifySql from "../../../supabase/install/verify-installation.sql?raw";

import { runtimeEnv } from "@/lib/runtime-env.server";

import {
  isDuplicateObjectError,
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
  resolveOperationalUrl,
  type AutomationOutcome,
  type GeneratedSecretVar,
} from "./automation-contract";
import { applyProgressReport, finalizeOperation, sanitize, type OperationRow } from "./runner.server";
import { MASTER_RELEASE_VERSION, type CheckState, type HealthCheckId } from "./manager-contract";

/* --------------------------------------------------------------- utilidades */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

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
  },
): Promise<{ ok: true; skipped: number } | { ok: false; error?: string; processed?: number }> {
  const statements = splitSqlStatements(sql);
  // Lotes grandes (150 statements) chegaram a ultrapassar a janela real do
  // Worker/Management API: o request era encerrado antes do AbortController e
  // o checkpoint ficava parado exatamente no limite do lote (ex.: 150/264 =
  // 57% no delta). 25 mantém cada chamada curta e deixa um checkpoint fino.
  const batchSize = 25;
  const from = Math.min(Math.max(options?.startIndex ?? 0, 0), statements.length);
  let processed = from;

  // Cada statement é protegido no próprio Postgres e os lotes são enviados em
  // poucas chamadas. Assim um objeto duplicado é ignorado isoladamente, mas
  // qualquer erro diferente continua abortando. Isso evita as ~1.800 chamadas
  // sequenciais que excediam a vida do Worker em retomadas parciais.
  for (let start = from; start < statements.length; start += batchSize) {
    if (await options?.isCancelled?.()) {
      return { ok: false, error: "Operação cancelada pelo Super Admin.", processed };
    }
    const batch = statements.slice(start, start + batchSize);
    const guarded = batch
      .map((statement, index) => {
        let suffix = index;
        let tag = `$unitos_stmt_${suffix}$`;
        while (statement.includes(tag)) {
          suffix += batch.length;
          tag = `$unitos_stmt_${suffix}$`;
        }
        return [
          "DO $unitos_guard$",
          "BEGIN",
          `  EXECUTE ${tag}${statement}${tag};`,
          "EXCEPTION",
          "  WHEN SQLSTATE '42710' OR SQLSTATE '42P07' OR SQLSTATE '42P06'",
          "    OR SQLSTATE '42701' OR SQLSTATE '42723' OR SQLSTATE '23505' THEN NULL;",
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
    const result = await management.query(guarded);
    if (!result.ok) return { ok: false, error: result.error, processed };
    processed += batch.length;
    await options?.onProgress?.(processed, statements.length);
  }
  return { ok: true, skipped: 0 };
}



export type ManagementClient = {
  query: (sql: string) => Promise<{ ok: boolean; rows: unknown[]; error?: string }>;
  keys: () => Promise<{ ok: boolean; publishableKey?: string; serviceRoleKey?: string; error?: string }>;
};

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

  return {
    async query(sql) {
      const controller = new AbortController();
      // Precisa expirar ANTES do limite do runtime. Um timeout de 60s não
      // ajudava: o isolate podia morrer primeiro e a operação ficava running.
      const timer = setTimeout(() => controller.abort(), 15_000);
      try {
        const res = await doFetch(`${base}/database/query`, {
          method: "POST",
          headers,
          body: JSON.stringify({ query: sql }),
          signal: controller.signal,
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          return { ok: false, rows: [], error: `HTTP ${res.status} ${text.slice(0, 300)}` };
        }
        const body = (await res.json().catch(() => [])) as unknown;
        return { ok: true, rows: Array.isArray(body) ? body : [] };
      } catch (e) {
        const aborted = e instanceof Error && e.name === "AbortError";
        return { ok: false, rows: [], error: aborted ? "timeout de 15s na Management API" : (e as Error).message };
      } finally {
        clearTimeout(timer);
      }
    },
    async keys() {
      try {
        const res = await doFetch(`${base}/api-keys?reveal=true`, { headers });
        if (!res.ok) {
          return { ok: false, error: `HTTP ${res.status} ao ler as chaves do Supabase destino` };
        }
        const body = (await res.json().catch(() => [])) as Array<{
          name?: string;
          type?: string;
          api_key?: string;
        }>;
        const find = (name: string) =>
          body.find((k) => k.name === name || k.type === name)?.api_key ?? undefined;
        return {
          ok: true,
          publishableKey: find("anon") ?? find("publishable"),
          serviceRoleKey: find("service_role") ?? find("secret"),
        };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    },
  };
}

/* ------------------------------------------------------------- Vercel API */

export type DeployClient = {
  deploymentUrl: () => Promise<{ ok: boolean; url?: string; error?: string }>;
  /** Redeploy da producao — necessario para que as variaveis gravadas valham. */
  redeploy: () => Promise<{ ok: boolean; deploymentId?: string; error?: string }>;
  setEnv: (
    entries: readonly { key: string; value: string; sensitive: boolean }[],
  ) => Promise<{ ok: boolean; applied: number; error?: string }>;
};

export function createDeployClient(input: {
  token: string;
  project: string;
  teamId?: string | null;
  fetchImpl?: Fetcher;
}): DeployClient {
  const doFetch = input.fetchImpl ?? fetch;
  const team = input.teamId ? `teamId=${encodeURIComponent(input.teamId)}` : "";
  const qs = (extra?: string) => [team, extra].filter(Boolean).join("&");
  const headers = {
    authorization: `Bearer ${input.token}`,
    "content-type": "application/json",
  };
  const project = encodeURIComponent(input.project);

  return {
    async deploymentUrl() {
      try {
        const res = await doFetch(
          `https://api.vercel.com/v9/projects/${project}?${qs()}`.replace(/\?$/, ""),
          { headers },
        );
        if (!res.ok) {
          return { ok: false, error: `HTTP ${res.status} ao consultar o projeto de deploy` };
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
        return { ok: true, url: candidate.startsWith("http") ? candidate : `https://${candidate}` };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    },
    async redeploy() {
      try {
        const list = await doFetch(
          `https://api.vercel.com/v6/deployments?${qs(
            `app=${project}&target=production&limit=1`,
          )}`,
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
          return { ok: false, error: `HTTP ${res.status} ao disparar redeploy (${text.slice(0, 200)})` };
        }
        const created = (await res.json().catch(() => ({}))) as { id?: string; uid?: string };
        return { ok: true, deploymentId: created.id ?? created.uid };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    },
    async setEnv(entries) {
      try {
        const res = await doFetch(
          `https://api.vercel.com/v10/projects/${project}/env?${qs("upsert=true")}`,
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
  };
}

/* --------------------------------------------------------------- execução */

export type AutomationInstallation = {
  id: string;
  domain: string | null;
  supabaseUrl: string | null;
  supabaseProjectRef: string | null;
  deployProject: string | null;
};

type Client = { from: (table: string) => unknown };

export type AutomationRunResult = AutomationOutcome & {
  appUrl: string | null;
  urlSource: "custom_domain" | "deploy" | null;
  steps: { id: string; state: CheckState | "done" | "error"; detail: string | null }[];
};

/* ------------------------------------------------- checkpoint do baseline */

/** Marcador de arquivo integralmente aplicado. */
export const DONE = -1;

export type BaselineProgress = Record<string, number>;

/**
 * Lê o checkpoint da instalação: a última operação (inclusive a atual) que
 * registrou progresso de baseline. Permite retomar sem reaplicar tudo.
 */
export async function readBaselineProgress(
  client: Client,
  installationId: string,
  operation: OperationRow,
): Promise<BaselineProgress> {
  try {
    const db = client as never as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (
            c: string,
            v: string,
          ) => {
            order: (
              c: string,
              o: { ascending: boolean },
            ) => { limit: (n: number) => Promise<{ data?: { detail?: unknown }[] | null }> };
          };
        };
      };
    };
    const { data } = await db
      .from("installation_operations")
      .select("detail")
      .eq("installation_id", installationId)
      .order("started_at", { ascending: false })
      .limit(5);
    const rows = [{ detail: operation.detail }, ...(data ?? [])];
    for (const row of rows) {
      const raw = (row?.detail as { baselineProgress?: unknown } | null)?.baselineProgress;
      if (raw && typeof raw === "object") {
        const out: BaselineProgress = {};
        for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
          if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
        }
        if (Object.keys(out).length > 0) return out;
      }
    }
  } catch {
    // checkpoint é otimização: falha na leitura só significa aplicar do zero.
  }
  return {};
}

/** Persiste o checkpoint no detalhe da operação (nunca contém secrets). */
export async function saveBaselineProgress(
  client: Client,
  operation: OperationRow,
  progress: BaselineProgress,
): Promise<void> {
  try {
    const db = client as never as {
      from: (t: string) => {
        update: (v: Record<string, unknown>) => {
          eq: (c: string, v: string) => Promise<unknown>;
        };
      };
    };
    await db
      .from("installation_operations")
      .update({
        detail: { ...((operation.detail ?? {}) as Record<string, unknown>), baselineProgress: progress },
        last_report_at: new Date().toISOString(),
      })
      .eq("id", operation.id);
  } catch {
    // idem: perder o checkpoint não invalida a operação.
  }
}

async function report(

  client: Client,
  op: OperationRow,
  step: string,
  state: "running" | "done" | "error",
  detail?: string | null,
) {
  await applyProgressReport(client as never, op as never, {
    step,
    state,
    detail: detail ?? null,
  }).catch(() => undefined);
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
}): Promise<AutomationRunResult> {
  const env = input.env ?? runtimeEnv();
  const { client, operation, installation } = input;
  const failures: string[] = [];
  const blocked: string[] = [];
  const checks: Partial<Record<HealthCheckId, CheckState>> = {};
  const steps: AutomationRunResult["steps"] = [];

  const finish = async (appUrl: string | null, source: "custom_domain" | "deploy" | null) => {
    const outcome = automationOutcome({ blocked, failures });
    await finalizeOperation(client as never, operation as never, {
      ok: outcome.result === "PASS",
      warnings: outcome.result === "PASS" && blocked.length > 0,
      // PASS => a instalação passa a rodar a versão do MASTER, e o status
      // derivado vira "Atualizada" (operacional). Sem isso ficaria em "Atenção".
      version: outcome.result === "PASS" ? MASTER_RELEASE_VERSION : null,
      summary:
        outcome.result === "PASS"
          ? `Provisionamento automático concluído${appUrl ? ` em ${appUrl}` : ""}.`
          : `${outcome.result}: ${outcome.reasons.join(" | ")}`,
      errorKind: outcome.result === "PASS" ? null : outcome.result.toLowerCase(),
      checks: checks as never,
    }).catch(() => undefined);
    return { ...outcome, appUrl, urlSource: source, steps };
  };

  const mark = async (
    id: string,
    state: "running" | "done" | "error",
    detail?: string | null,
  ) => {
    if (state !== "running") steps.push({ id, state, detail: sanitize(detail ?? null) });
    await report(client, operation, id, state, detail);
  };

  const isCancelled = async () => {
    const db = client as never as {
      from: (table: string) => {
        select: (columns: string) => {
          eq: (column: string, value: string) => {
            maybeSingle: () => Promise<{ data?: { status?: string } | null }>;
          };
        };
      };
    };
    const current = await db
      .from("installation_operations")
      .select("status")
      .eq("id", operation.id)
      .maybeSingle();
    return current.data?.status !== "running" && current.data?.status !== "pending";
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

  const managementToken = (env["UNITOS_SUPABASE_MANAGEMENT_TOKEN"] ?? "").trim();
  const deployToken = (env["UNITOS_VERCEL_TOKEN"] ?? "").trim();
  const teamId = (env["UNITOS_VERCEL_TEAM_ID"] ?? "").trim() || null;


  const management = createManagementClient({
    token: managementToken,
    projectRef: target.projectRef,
    fetchImpl: input.fetchImpl,
  });
  const deploy = createDeployClient({
    token: deployToken,
    project: target.deployProject,
    teamId,
    fetchImpl: input.fetchImpl,
  });

  /* 2. Supabase destino: conectividade, plataforma e chaves */
  await mark("supabase", "running");
  const ping = await management.query(
    "select count(*)::int as schemas from information_schema.schemata where schema_name in ('auth','storage','vault')",
  );
  if (!ping.ok) {
    blocked.push(`Supabase destino inacessível com a credencial de gestão: ${ping.error ?? ""}`.trim());
    await mark("supabase", "error", ping.error);
    checks.supabase = "error";
    return finish(null, null);
  }
  const schemas = Number((ping.rows[0] as { schemas?: number } | undefined)?.schemas ?? 0);
  if (schemas < 3) {
    blocked.push("O alvo não é um projeto Supabase completo (auth/storage/vault ausentes).");
    await mark("supabase", "error", "schemas de plataforma ausentes");
    checks.supabase = "error";
    return finish(null, null);
  }

  const keys = await management.keys();
  if (!keys.ok || !keys.publishableKey || !keys.serviceRoleKey) {
    blocked.push(
      `Não foi possível ler as chaves do Supabase destino: ${keys.error ?? "chaves não retornadas"}`,
    );
    await mark("supabase", "error", "chaves do destino indisponíveis");
    checks.supabase = "attention";
    return finish(null, null);
  }
  checks.supabase = "ok";
  await mark("supabase", "done", `projeto ${target.projectRef} acessível`);

  /* 3. baseline */
  const baseline: { id: string; label: string; sql: string }[] = [
    { id: "database", label: "000_extensions", sql: baseline000 },
    { id: "database", label: "001_initial_schema", sql: baseline001 },
    { id: "database", label: "005_auth_trigger", sql: baseline005 },
    { id: "database", label: "007_delta_migrations", sql: baseline007 },
    { id: "storage", label: "003_storage_buckets", sql: baseline003 },
    { id: "storage", label: "006_storage_policies", sql: baseline006 },
    { id: "seeds", label: "004_seeds", sql: baseline004 },
  ];

  // Checkpoint: o Worker tem vida limitada. Cada arquivo (e cada lote dentro
  // do arquivo) é registrado, então uma retomada continua de onde parou em vez
  // de reaplicar o baseline inteiro — a causa do travamento em 99%.
  const progress = await readBaselineProgress(client, installation.id, operation);

  let currentGroup = "";
  for (const file of baseline) {
    if (file.id !== currentGroup) {
      currentGroup = file.id;
      await mark(file.id, "running");
    }
    if (progress[file.label] === DONE) {
      await mark(file.id, "running", `${file.label}: já aplicado (checkpoint)`);
      continue;
    }
    await mark(file.id, "running", `${file.label}: aplicando`);
    // A Management API executa como `postgres` (não superusuário): comandos
    // exclusivos de superusuário do dump são removidos antes de enviar.
    const prepared = sanitizeBaselineSqlForManagementApi(file.sql);
    const alreadyApplied = progress[file.label] ?? 0;
    // Nunca envie o arquivo inteiro em uma única chamada. Além de não gerar
    // heartbeat durante sua execução, 001 (530 KB) e 007 podiam exceder a vida
    // do runtime. O mesmo caminho curto/idempotente vale para primeira execução
    // e retomada, portanto todos os arquivos do instalador ficam protegidos.
    const perStatement = await applyStatementByStatement(management, prepared.sql, {
      isCancelled,
      startIndex: alreadyApplied,
      onProgress: async (processed, total) => {
        progress[file.label] = processed;
        await saveBaselineProgress(client, operation, progress);
        const percent = Math.min(99, Math.round((processed / Math.max(total, 1)) * 100));
        const action = alreadyApplied > 0 ? "retomando aplicação" : "aplicando";
        await mark(file.id, "running", `${file.label}: ${action} (${percent}%)`);
      },
    });
    if (!perStatement.ok) {
      if (typeof perStatement.processed === "number" && perStatement.processed > 0) {
        progress[file.label] = perStatement.processed;
        await saveBaselineProgress(client, operation, progress);
      }
      failures.push(`${file.label}: ${perStatement.error ?? "falha ao aplicar"}`);
      await mark(file.id, "error", `${file.label} falhou`);
      checks[file.id === "seeds" ? "database" : (file.id as HealthCheckId)] = "error";
      return finish(null, null);
    }
    progress[file.label] = DONE;
    await saveBaselineProgress(client, operation, progress);

  }
  checks.database = "ok";
  checks.storage = "ok";
  await mark("database", "done", "baseline aplicado no destino");
  await mark("storage", "done", "buckets e policies aplicados");
  await mark("seeds", "done", "seeds de catálogo aplicados");

  /* 4. secrets exclusivos da instalação */
  await mark("secrets", "running");
  const secrets = {} as Record<GeneratedSecretVar, string>;
  for (const name of GENERATED_SECRET_VARS) secrets[name] = generateInstallationSecret();
  const isolation = assertSecretsAreExclusive({ generated: secrets, masterEnv: env });
  if (!isolation.ok) {
    failures.push(isolation.reason);
    await mark("secrets", "error", isolation.reason);
    checks.secrets = "error";
    return finish(null, null);
  }
  const vault = await management.query(
    `select public.set_cron_secret(${sqlLiteral(secrets.CRON_SECRET)});`,
  );
  if (!vault.ok) {
    failures.push(`CRON_SECRET não gravado no Vault do destino: ${vault.error ?? ""}`.trim());
    await mark("secrets", "error", "set_cron_secret falhou");
    checks.secrets = "error";
    return finish(null, null);
  }
  checks.secrets = "ok";
  await mark("secrets", "done", "secrets próprios gerados (valores nunca exibidos)");

  /* 5. URL operacional e variáveis do deploy */
  await mark("deploy", "running");
  const deployment = await deploy.deploymentUrl();
  const url = resolveOperationalUrl({
    customDomain: installation.domain,
    deploymentUrl: deployment.url ?? null,
  });
  if (!url.ok) {
    blocked.push(
      `URL operacional indisponível: ${url.reason}${deployment.error ? ` (${deployment.error})` : ""}`,
    );
    await mark("deploy", "error", url.reason);
    checks.frontend = "error";
    return finish(null, null);
  }
  if (containsMasterReference(url.origin)) {
    failures.push("A URL resolvida aponta para o MASTER — operação recusada.");
    await mark("deploy", "error", "URL do MASTER recusada");
    return finish(null, null);
  }

  const plan = buildDeployEnvPlan({
    appUrl: url.origin,
    supabaseUrl: installation.supabaseUrl ?? `https://${target.projectRef}.supabase.co`,
    publishableKey: keys.publishableKey,
    serviceRoleKey: keys.serviceRoleKey,
    projectRef: target.projectRef,
    secrets,
  });
  if (!plan.ok) {
    failures.push(plan.reason);
    await mark("deploy", "error", plan.reason);
    return finish(url.origin, url.source);
  }
  const envResult = await deploy.setEnv(plan.entries);
  if (!envResult.ok) {
    blocked.push(`Variáveis do deploy não configuradas: ${envResult.error ?? ""}`.trim());
    await mark("deploy", "error", "falha ao gravar variáveis do deploy");
    checks.configuration = "attention";
    return finish(url.origin, url.source);
  }

  const identity = await management.query(bindAppUrl(install010, url.origin));
  if (!identity.ok) {
    failures.push(`installation.app_url não registrada: ${identity.error ?? ""}`.trim());
    await mark("deploy", "error", "identidade da instalação inválida");
    return finish(url.origin, url.source);
  }
  checks.configuration = "ok";

  // Gravar variaveis NAO republica o app: sem um novo deployment o frontend
  // continua rodando com o env antigo. O redeploy e disparado aqui.
  const redeployed = await deploy.redeploy();
  if (!redeployed.ok) {
    blocked.push(
      `Novo deployment nao disparado (as variaveis so valem apos republicar): ${
        redeployed.error ?? ""
      }`.trim(),
    );
  }

  // Estado do frontend so vira "ok" com resposta HTTP real da URL operacional.
  const probe = await probeOperationalUrl(url.origin, input.fetchImpl);
  checks.frontend = probe.ok ? "ok" : "attention";
  if (!probe.ok) {
    blocked.push(`Frontend ainda nao respondeu em ${url.origin}: ${probe.detail}`);
  }

  await mark(
    "deploy",
    "done",
    `${envResult.applied} variáveis gravadas — URL operacional ${url.origin} (${
      url.source === "deploy" ? "temporária do deploy" : "domínio definitivo"
    })${redeployed.ok ? " · novo deployment disparado" : " · redeploy pendente"}${
      probe.ok ? " · frontend respondendo" : ` · frontend ${probe.detail}`
    }`,
  );

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
  const setup = await management.query(
    "select (public.installation_setup_state()->>'has_super_admin')::boolean as has_super_admin",
  );
  const hasSuperAdmin =
    (setup.rows[0] as { has_super_admin?: boolean | null } | undefined)?.has_super_admin === true;
  await mark(
    "validation",
    "done",
    hasSuperAdmin
      ? `${summary.total} verificações PASS · Super Admin já criado`
      : `${summary.total} verificações PASS · crie o primeiro Super Admin em ${url.origin}/setup`,
  );

  return finish(url.origin, url.source);
}
