/**
 * Installation Manager — execução/orquestração (server-only).
 *
 * O MASTER NÃO reimplementa o bootstrap: ele emite um token de execução de uso
 * único, o operador roda os scripts existentes de `supabase/install/` na
 * instalação de destino e o script reporta progresso real de volta.
 *
 * Regras duras:
 *  - o token só é exibido UMA vez; no banco fica apenas o hash SHA-256;
 *  - nenhum secret/credencial do destino é armazenado;
 *  - nenhuma operação pode apontar para o MASTER;
 *  - resultado parcial nunca é descartado em caso de erro.
 */

import {
  MASTER_RELEASE_VERSION,
  applyStepReport,
  normalizeStepPercent,
  healthFromChecks,
  isStepState,
  normalizeHealthChecks,
  operationStatusFromSteps,
  stepsFor,
  statusAfterOperation,
  type CheckState,
  type HealthCheckId,
  type InstallationOperationKind,
  type OperationStep,
} from "./manager-contract";

/* ----------------------------------------------------------------- token */

const HEX = "0123456789abcdef";

export function generateRunToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += HEX[b >> 4] + HEX[b & 15];
  return out;
}

export async function hashRunToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token.trim()));
  return Array.from(new Uint8Array(digest))
    .map((b) => HEX[b >> 4] + HEX[b & 15])
    .join("");
}

/** Validade do token de execução: suficiente para um bootstrap completo. */
export const RUN_TOKEN_TTL_MS = 2 * 60 * 60 * 1000;

/* ------------------------------------------------------------- health probe */

type ProbeResult = { state: CheckState; detail?: string | null };

async function probeUrl(url: string, timeoutMs = 10_000): Promise<ProbeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: "GET", signal: controller.signal });
    if (res.status >= 200 && res.status < 400) return { state: "ok", detail: `HTTP ${res.status}` };
    if (res.status === 401 || res.status === 403)
      return { state: "ok", detail: `HTTP ${res.status} (protegido)` };
    return { state: "attention", detail: `HTTP ${res.status}` };
  } catch (e) {
    const aborted = (e as Error)?.name === "AbortError";
    return { state: "error", detail: aborted ? "timeout" : "sem resposta" };
  } finally {
    clearTimeout(timer);
  }
}

function toOrigin(value: string): string {
  const v = value.trim().replace(/\/+$/, "");
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

/**
 * Checks que o MASTER consegue medir sozinho (sem credenciais do destino):
 * frontend, conectividade e Supabase. Banco, Storage, Cron e Secrets vêm da
 * última validação reportada pelo script — até então ficam `pending`.
 */
export async function probeInstallationHealth(input: {
  domain: string | null;
  supabaseUrl: string | null;
  gitRepoUrl: string | null;
  deployProject: string | null;
  storedChecks: unknown;
}): Promise<Record<HealthCheckId, ProbeResult>> {
  const stored = normalizeHealthChecks(input.storedChecks);

  const frontend = input.domain
    ? await probeUrl(toOrigin(input.domain))
    : ({ state: "pending", detail: "domínio não informado" } as ProbeResult);

  const supabase = input.supabaseUrl
    ? await probeUrl(`${toOrigin(input.supabaseUrl)}/auth/v1/health`)
    : ({ state: "pending", detail: "Supabase não informado" } as ProbeResult);

  const connectivity: ProbeResult =
    frontend.state === "ok" && supabase.state === "ok"
      ? { state: "ok", detail: "frontend e Supabase respondendo" }
      : frontend.state === "error" || supabase.state === "error"
        ? { state: "error", detail: "frontend ou Supabase inacessível" }
        : { state: frontend.state === "pending" ? "pending" : "attention", detail: null };

  const missing = [
    !input.domain && "domínio",
    !input.supabaseUrl && "Supabase",
    !input.gitRepoUrl && "repositório",
    !input.deployProject && "projeto de deploy",
  ].filter(Boolean) as string[];

  const configuration: ProbeResult = missing.length
    ? { state: "attention", detail: `pendente: ${missing.join(", ")}` }
    : { state: "ok", detail: "metadados completos" };

  return {
    connectivity,
    supabase,
    // Publicação do código é comprovada pelo provisionamento/atualização.
    code: stored.code,

    database: stored.database,
    schema: stored.schema,
    rls: stored.rls,
    seeds: stored.seeds,
    storage: stored.storage,
    cron: stored.cron,
    frontend,
    secrets: stored.secrets,
    configuration,
    // Primeiro acesso é reportado pela validação/provisionamento automáticos
    // (leitura real do destino); a sonda HTTP preserva o que já foi comprovado.
    super_admin: stored.super_admin,
    workspace: stored.workspace,
  };
}

/* ------------------------------------------------------- report / finalize */

type AnyClient = {
  from: (table: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

export type OperationRow = {
  id: string;
  installation_id: string;
  kind: string;
  status: string;
  steps: unknown;
  detail: unknown;
  summary: string | null;
  run_token_expires_at: string | null;
  lease_owner?: string | null;
  lease_expires_at?: string | null;
  fencing_token?: number;
  attempt_count?: number;
  max_attempts?: number;
  baseline_id?: string | null;
  baseline_hash?: string | null;
};

export const AUTOMATION_LEASE_SECONDS = 180;
export const AUTOMATION_HEARTBEAT_MS = 45_000;

export class InstallationLeaseLostError extends Error {
  constructor() {
    super("A execução perdeu a concessão da operação e foi interrompida com segurança.");
    this.name = "InstallationLeaseLostError";
  }
}

/** Versão só pode ser promovida quando a operação inteira possui evidência. */
export function versionForCompletedOperation(input: {
  kind: InstallationOperationKind;
  acceptedSuccess: boolean;
  version: string | null;
}): string | null {
  if (input.kind === "validate" || !input.acceptedSuccess) return null;
  return input.version;
}

export async function heartbeatOperation(client: AnyClient, op: OperationRow): Promise<boolean> {
  const owner = op.lease_owner?.trim();
  if (!owner || typeof op.fencing_token !== "number") return false;
  const { data, error } = await client.rpc("heartbeat_installation_operation", {
    _operation_id: op.id,
    _owner: owner,
    _fencing_token: op.fencing_token,
    _lease_seconds: AUTOMATION_LEASE_SECONDS,
  });
  if (error) throw error;
  return data === true;
}

export async function assertOperationLease(client: AnyClient, op: OperationRow): Promise<void> {
  if (!(await heartbeatOperation(client, op))) throw new InstallationLeaseLostError();
}

export async function withOperationHeartbeat<T>(
  client: AnyClient,
  op: OperationRow,
  work: () => Promise<T>,
): Promise<T> {
  await assertOperationLease(client, op);
  let lost = false;
  const timer = setInterval(() => {
    void heartbeatOperation(client, op)
      .then((ok) => {
        if (!ok) lost = true;
      })
      .catch(() => {
        lost = true;
      });
  }, AUTOMATION_HEARTBEAT_MS);
  try {
    const result = await work();
    if (lost) throw new InstallationLeaseLostError();
    return result;
  } finally {
    clearInterval(timer);
  }
}

/** Libera uma fatia concluída para o executor retomar sem consumir uma tentativa. */
export async function yieldOperation(
  client: AnyClient,
  op: OperationRow,
  delaySeconds = 5,
): Promise<void> {
  const { data, error } = await client.rpc("yield_installation_operation", {
    _operation_id: op.id,
    _owner: op.lease_owner ?? "",
    _fencing_token: op.fencing_token ?? -1,
    _delay_seconds: delaySeconds,
  });
  if (error) throw error;
  if (data !== true) throw new InstallationLeaseLostError();
}

/** Reagenda falha transitória do MASTER sem alterar falhas do destino. */
export async function deferOperation(
  client: AnyClient,
  op: OperationRow,
  errorKind: string,
  summary: string,
  delaySeconds = 30,
): Promise<void> {
  const { data, error } = await client.rpc("defer_installation_operation", {
    _operation_id: op.id,
    _owner: op.lease_owner ?? "",
    _fencing_token: op.fencing_token ?? -1,
    _delay_seconds: delaySeconds,
    _error_kind: errorKind,
    _summary: sanitize(summary),
    _error_detail: {
      failureSource: "master",
      deferredAt: new Date().toISOString(),
      retryDelaySeconds: delaySeconds,
    },
  });
  if (error) throw error;
  if (data !== true) throw new InstallationLeaseLostError();
}

/** Agenda falha transitória com backoff exponencial e limite persistido. */
export async function retryOperation(
  client: AnyClient,
  op: OperationRow,
  errorKind: string,
  summary: string,
): Promise<void> {
  const attempt = Math.max(op.attempt_count ?? 0, 0) + 1;
  const baseDelaySeconds = Math.min(750, 15 * 2 ** Math.min(attempt - 1, 6));
  const delaySeconds = Math.min(
    900,
    baseDelaySeconds + Math.floor(Math.random() * Math.max(1, baseDelaySeconds * 0.2)),
  );
  const { data, error } = await client.rpc("retry_installation_operation", {
    _operation_id: op.id,
    _owner: op.lease_owner ?? "",
    _fencing_token: op.fencing_token ?? -1,
    _delay_seconds: delaySeconds,
    _error_kind: errorKind,
    _summary: sanitize(summary),
    _error_detail: { attempt, retryDelaySeconds: delaySeconds },
  });
  if (error) throw error;
  if (data !== true) throw new InstallationLeaseLostError();
}

function readSteps(raw: unknown): OperationStep[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
    .map((s) => ({
      id: String(s["id"] ?? ""),
      label: String(s["label"] ?? ""),
      script: String(s["script"] ?? ""),
      state: isStepState(s["state"]) ? s["state"] : "pending",
      detail: typeof s["detail"] === "string" ? s["detail"] : null,
      percent: normalizeStepPercent(s["percent"]),
    }))
    .filter((s) => s.id);
}

export type StepReport = {
  step: string;
  state: string;
  detail?: string | null;
  /** Progresso interno da etapa (0–100) para etapas longas. */
  percent?: number | null;
};

export type FinalReport = {
  ok: boolean;
  warnings?: boolean;
  version?: string | null;
  summary?: string | null;
  errorKind?: string | null;
  checks?: Partial<Record<HealthCheckId, CheckState>>;
};

/** Aplica um progresso de etapa reportado pelo script. */
export async function applyProgressReport(
  client: AnyClient,
  op: OperationRow,
  report: StepReport,
): Promise<OperationStep[]> {
  await assertOperationLease(client, op);
  const state = isStepState(report.state) ? report.state : "running";
  // `op` é lido uma única vez no início da operação. Aplicar o progresso sobre
  // essa cópia apagaria as etapas já concluídas (UI ficava em "0/9 etapas" e
  // a etapa 01 parecia "pulada"). A verdade é sempre a linha persistida.
  const { data: fresh, error: readError } = await client
    .from("installation_operations")
    .select("steps, detail")
    .eq("id", op.id)
    .maybeSingle();
  if (readError) throw readError;
  if (!fresh) throw new Error("Operação não encontrada durante o checkpoint.");
  const base = readSteps(fresh.steps);
  const steps = applyStepReport(base, {
    step: report.step,
    state,
    detail: sanitize(report.detail),
    percent: report.percent ?? null,
  });
  const detail = (fresh.detail ?? {}) as Record<string, unknown>;
  const { data: saved, error } = await client.rpc("checkpoint_installation_operation", {
    _operation_id: op.id,
    _owner: op.lease_owner ?? "",
    _fencing_token: op.fencing_token ?? -1,
    _steps: steps,
    _detail: detail,
    _current_step: report.step,
    _summary: null,
    _metrics: { lastProgressAt: new Date().toISOString() },
  });
  if (error) throw error;
  if (saved !== true) throw new InstallationLeaseLostError();
  return steps;
}

/** Remove qualquer coisa que pareça segredo antes de persistir texto livre. */
export function sanitize(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  return v
    .replace(/(postgres(?:ql)?:\/\/[^\s]+)/gi, "[conexão omitida]")
    .replace(/(eyJ[A-Za-z0-9._-]{20,})/g, "[token omitido]")
    .replace(/\b(sb_secret|sb_publishable)_[A-Za-z0-9._-]+/g, "[chave omitida]")
    .replace(/\b(service_role|cron_secret|password|api[_-]?key)\b\s*[:=]\s*\S+/gi, "$1=[omitido]")
    .slice(0, 1000);
}

/** Fecha a operação, atualiza status/saúde da instalação e libera a trava. */
export async function finalizeOperation(
  client: AnyClient,
  op: OperationRow,
  report: FinalReport,
): Promise<void> {
  if (op.lease_owner?.trim()) await assertOperationLease(client, op);
  const kind = op.kind as InstallationOperationKind;
  const nowIso = new Date().toISOString();

  // As etapas persistidas durante a execução (applyProgressReport) são a fonte
  // da verdade: `op` foi lido no início da operação e já está obsoleto aqui.
  // Sem esta releitura, a etapa que falhou era sobrescrita e a UI mostrava
  // "etapa não identificada".
  const { data: fresh, error: progressError } = await client
    .from("installation_operations")
    .select("steps, detail")
    .eq("id", op.id)
    .maybeSingle();
  if (progressError) throw progressError;
  if (!fresh) throw new Error("Operação não encontrada durante a finalização.");
  const persisted = readSteps(fresh.steps);
  const expectedStepIds = new Set(stepsFor(kind).map((step) => step.id));
  const persistedStepIds = new Set(persisted.map((step) => step.id));
  const contractComplete =
    expectedStepIds.size === persistedStepIds.size &&
    [...expectedStepIds].every((stepId) => persistedStepIds.has(stepId));
  const steps = persisted.map((s) =>
    s.state === "running" ? { ...s, state: report.ok ? ("done" as const) : ("error" as const) } : s,
  );
  const incomplete = steps.filter((step) => step.state !== "done");
  const acceptedSuccess = report.ok && contractComplete && incomplete.length === 0;
  const finalSteps = steps;

  const summary = sanitize(report.summary) ?? op.summary;
  const outcome = {
    ok: acceptedSuccess,
    warnings: report.warnings ?? false,
    version: (report.version ?? "").trim() || null,
  };

  const { data: installation, error: installationError } = await client
    .from("installations")
    .select("health_checks, pinned_release, current_version")
    .eq("id", op.installation_id)
    .maybeSingle();
  if (installationError) throw installationError;
  if (!installation) throw new Error("Instalação não encontrada durante a finalização.");

  const checks = normalizeHealthChecks(installation?.health_checks);
  for (const [id, state] of Object.entries(report.checks ?? {})) {
    if (state) checks[id as HealthCheckId] = { state, detail: null };
  }

  // Validar mede a saúde do ambiente; não publica código. Portanto, uma
  // validação nunca pode promover a instalação para a versão do processo
  // MASTER. A fonte da versão instalada é a release fixada pela última
  // publicação (com current_version apenas como fallback legado).
  const installedVersion =
    (installation?.pinned_release ?? installation?.current_version ?? "").trim() || null;
  const statusOutcome = kind === "validate" ? { ...outcome, version: installedVersion } : outcome;
  const promotedVersion = versionForCompletedOperation({
    kind,
    acceptedSuccess,
    version: outcome.version,
  });

  const patch: Record<string, unknown> = {
    status: statusAfterOperation(kind, statusOutcome),
    health: healthFromChecks(checks),
    health_checks: checks,
    health_checked_at: nowIso,
    active_operation_id: null,
    last_error: acceptedSuccess
      ? null
      : report.ok
        ? `A operação tentou concluir sem evidência em todas as etapas: ${
            !contractComplete
              ? "contrato de etapas incompleto"
              : incomplete.map((step) => step.label).join(", ") || "etapas ausentes"
          }.`
        : (summary ?? "Falha registrada na operação."),
    ...(promotedVersion ? { current_version: promotedVersion } : {}),
    ...(kind !== "validate" && acceptedSuccess ? { last_provisioned_at: nowIso } : {}),
    ...(kind === "validate" ? { last_validated_at: nowIso } : {}),
  };

  const owner = op.lease_owner?.trim();
  if (owner && typeof op.fencing_token === "number") {
    const { data: closed, error } = await client.rpc("finalize_installation_operation", {
      _operation_id: op.id,
      _owner: owner,
      _fencing_token: op.fencing_token,
      _operation_status: acceptedSuccess ? "success" : "failed",
      _summary: summary,
      _error_kind: acceptedSuccess
        ? null
        : (sanitize(report.errorKind) ?? (report.ok ? "incomplete_steps" : "operation_failed")),
      _detail: {
        ...((fresh?.detail ?? op.detail ?? {}) as Record<string, unknown>),
        executed: true,
        warnings: outcome.warnings,
        releaseVersion: MASTER_RELEASE_VERSION,
      },
      _steps: finalSteps,
      _installation_status: patch.status,
      _health: patch.health,
      _health_checks: checks,
      _current_version: promotedVersion,
      _touch_provisioned: kind !== "validate" && acceptedSuccess,
      _touch_validated: kind === "validate",
    });
    if (error) throw error;
    if (closed !== true) throw new InstallationLeaseLostError();
    if (kind === "provision" && acceptedSuccess) {
      const { data: replacement, error: replacementError } = await client
        .from("installations")
        .select("clean_replacement_of,pending_domain,domain")
        .eq("id", op.installation_id)
        .maybeSingle();
      if (replacementError) throw replacementError;
      if (
        replacement?.clean_replacement_of &&
        replacement.pending_domain &&
        replacement.domain === replacement.pending_domain
      ) {
        const { data: cutover, error: cutoverError } = await client.rpc(
          "finalize_clean_installation_replacement",
          { _replacement_id: op.installation_id, _operation_id: op.id },
        );
        if (cutoverError) throw cutoverError;
        if (cutover !== true)
          throw new Error("A finalização atômica da substituição limpa foi recusada.");
      }
    }
    if (kind === "provision" && !acceptedSuccess) {
      const { data: replacement, error: replacementError } = await client
        .from("installations")
        .select("clean_replacement_of,pending_domain,domain")
        .eq("id", op.installation_id)
        .maybeSingle();
      if (replacementError) throw replacementError;
      if (
        replacement?.clean_replacement_of &&
        replacement.pending_domain &&
        replacement.domain === replacement.pending_domain
      ) {
        const { data: rolledBack, error: rollbackError } = await client.rpc(
          "rollback_clean_installation_replacement_cutover",
          { _replacement_id: op.installation_id },
        );
        if (rollbackError) throw rollbackError;
        if (rolledBack !== true)
          throw new Error("O rollback do domínio após falha não foi confirmado.");
      }
    }
    return;
  }

  if (kind === "update") {
    throw new InstallationLeaseLostError();
  }

  // Operações manuais legadas não possuem lease e continuam fechando pelo
  // caminho restrito ao Super Admin.
  const { data: closed, error: opError } = await client
    .from("installation_operations")
    .update({
      steps: finalSteps,
      status: acceptedSuccess ? "success" : "failed",
      summary,
      error_kind: acceptedSuccess ? null : (sanitize(report.errorKind) ?? "operation_failed"),
      detail: {
        ...((fresh?.detail ?? op.detail ?? {}) as Record<string, unknown>),
        executed: true,
      },
      finished_at: nowIso,
      last_report_at: nowIso,
    })
    .eq("id", op.id)
    .is("lease_owner", null)
    .in("status", ["pending", "running", "retryable"])
    .select("id")
    .maybeSingle();
  if (opError) throw opError;
  if (!closed) throw new InstallationLeaseLostError();
  const { error: instError } = await client
    .from("installations")
    .update(patch)
    .eq("id", op.installation_id)
    .eq("active_operation_id", op.id);
  if (instError) throw instError;
}
