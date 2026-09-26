import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertSuperAdmin, resolveIsSuperAdmin } from "@/lib/super-admin";
import { assertConfirmLabel, type CriticalActionKey } from "@/lib/critical-actions";
import type { RpcClient } from "@/lib/access-guard";

import {
  INSTALLATION_STATUS_LABEL,
  MASTER_RELEASE_VERSION,
  PROVISION_STEPS,
  VALIDATE_STEPS,
  assertOperationTarget,
  buildRunCommand,
  canRetryFailedProvision,
  canStartOperation,
  healthAfterOperation,
  initialSteps,
  isInstallationStatus,
  isUpdateAvailable,
  normalizeHealthChecks,
  runningStatusFor,
  statusAfterOperation,
  stepsProgress,
  updateSummary,
  validateInstallationInput,
  type HealthCheckId,
  type HealthCheckResult,
  type InstallationHealth,
  type InstallationOperationKind,
  type InstallationOperationStatus,
  type InstallationOperationAttempt,
  type InstallationMigrationCheckpoint,
  type InstallationStatus,
  type OperationStep,
  type StepProgress,
} from "./manager-contract";

/**
 * Installation Manager — server functions do MASTER.
 *
 * Autorização em três camadas, todas no servidor:
 *  1. `assertMasterInstallation()` — o módulo não existe em instalação cliente;
 *  2. `assertSuperAdmin()` — nenhum outro papel acessa;
 *  3. RLS de `public.installations` / `public.installation_operations`.
 *
 * Nenhum segredo do destino é persistido: só metadados e estado.
 */

export type InstallationRecord = {
  id: string;
  name: string;
  slug: string;
  domain: string | null;
  supabaseProjectRef: string | null;
  supabaseUrl: string | null;
  gitRepoUrl: string | null;
  deployProject: string | null;
  notes: string | null;
  /**
   * BYOK: instalação cadastrada com o Supabase Access Token do próprio cliente.
   * Nestas o token global do MASTER não é usado como reserva.
   */
  requiresOwnSupabaseToken: boolean;

  status: InstallationStatus;
  health: InstallationHealth;
  currentVersion: string | null;
  availableVersion: string;
  /** Commit do MASTER fixado nesta instalação (versão publicada). */
  pinnedCommitSha: string | null;
  pinnedRelease: string | null;
  pinnedAt: string | null;
  updateAvailable: boolean;
  lastProvisionedAt: string | null;
  lastValidatedAt: string | null;
  lastError: string | null;
  healthChecks: Record<HealthCheckId, HealthCheckResult>;
  healthCheckedAt: string | null;
  activeOperationId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OperationDetail = {
  releaseVersion?: string;
  /** Operação terminal de provisionamento que originou esta nova tentativa. */
  retryOfOperationId?: string;
  retryReason?: "failed_provision";
  /** Commit do MASTER autorizado para esta atualização. */
  targetCommitSha?: string;
  /** Versão publicada antes desta atualização. */
  fromVersion?: string | null;
  /** Versão que esta atualização publica. */
  toVersion?: string | null;
  executed?: boolean;
  warnings?: boolean;
  /** true quando o MASTER executou a operação automaticamente (sem comando manual). */
  automated?: boolean;
  stageProgress?: {
    updateDeploymentId?: string;
    updateDeploymentSource?: "git" | "rebuild";
    updateDeploymentRef?: string;
    updateGitPushCommit?: string;
  };
};

export type InstallationOperationRecord = {
  id: string;
  kind: InstallationOperationKind;
  status: InstallationOperationStatus;
  summary: string | null;
  detail: OperationDetail;
  steps: OperationStep[];
  progress: StepProgress;
  errorKind: string | null;
  currentStep: string | null;
  migrationFile: string | null;
  migrationPosition: number | null;
  migrationStatement: number | null;
  migrationStatementsTotal: number | null;
  startedAt: string;
  finishedAt: string | null;
  lastReportAt: string | null;
  workflowVersion: number | null;
  attemptCount: number;
  nextAttemptAt: string | null;
  heartbeatAt: string | null;
  leaseExpiresAt: string | null;
  hasLease: boolean;
  fencingToken: number;
  attempts: InstallationOperationAttempt[];
  checkpoints: InstallationMigrationCheckpoint[];
};

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapInstallation(row: any): InstallationRecord {
  const status: InstallationStatus = isInstallationStatus(row.status) ? row.status : "preparing";
  const installedVersion = row.pinned_release ?? row.current_version ?? null;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    domain: row.domain ?? null,
    supabaseProjectRef: row.supabase_project_ref ?? null,
    supabaseUrl: row.supabase_url ?? null,
    gitRepoUrl: row.git_repo_url ?? null,
    deployProject: row.deploy_project ?? null,
    notes: row.notes ?? null,
    requiresOwnSupabaseToken: row.requires_own_supabase_token === true,

    status,
    health: (row.health ?? "unknown") as InstallationHealth,
    currentVersion: row.current_version ?? null,
    pinnedCommitSha: row.pinned_commit_sha ?? null,
    pinnedRelease: row.pinned_release ?? null,
    pinnedAt: row.pinned_at ?? null,
    // A versão disponível é SEMPRE a do MASTER em execução: valores antigos
    // gravados no banco (formato ano.mês) não devem aparecer na tela.
    availableVersion: MASTER_RELEASE_VERSION,
    updateAvailable: isUpdateAvailable(installedVersion, MASTER_RELEASE_VERSION),
    lastProvisionedAt: row.last_provisioned_at ?? null,
    lastValidatedAt: row.last_validated_at ?? null,
    lastError: row.last_error ?? null,
    healthChecks: normalizeHealthChecks(row.health_checks),
    healthCheckedAt: row.health_checked_at ?? null,
    activeOperationId: row.active_operation_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function readSteps(raw: unknown): OperationStep[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s) => !!s && typeof s === "object")
    .map((s: any) => ({
      id: String(s.id ?? ""),
      label: String(s.label ?? ""),
      script: String(s.script ?? ""),
      state:
        s.state === "running" || s.state === "done" || s.state === "error" ? s.state : "pending",
      detail: typeof s.detail === "string" ? s.detail : null,
      percent: typeof s.percent === "number" ? s.percent : null,
    }))
    .filter((s) => s.id);
}

type MigrationEvidence = {
  migration_file?: string | null;
  package_position?: number | null;
  statement_index?: number | null;
  total_statements?: number | null;
  status?: string | null;
  updated_at?: string | null;
};

type AttemptEvidence = {
  id: string;
  attempt_number: number;
  status: string;
  error_kind?: string | null;
  error_message?: string | null;
  retryable?: boolean | null;
  fencing_token: number;
  started_at: string;
  heartbeat_at?: string | null;
  finished_at?: string | null;
};

function mapOperation(
  row: any,
  migrations: MigrationEvidence[] = [],
  attempts: AttemptEvidence[] = [],
): InstallationOperationRecord {
  const steps = readSteps(row.steps);
  const migration = migrations[0];
  return {
    id: row.id,
    kind: row.kind as InstallationOperationKind,
    status: row.status as InstallationOperationStatus,
    summary: row.summary ?? null,
    detail: (row.detail ?? {}) as OperationDetail,
    steps,
    progress: stepsProgress(steps),
    errorKind: row.error_kind ?? null,
    currentStep: row.current_step ?? null,
    migrationFile: migration?.migration_file ?? null,
    migrationPosition: migration?.package_position ?? null,
    migrationStatement: migration?.statement_index ?? null,
    migrationStatementsTotal: migration?.total_statements ?? null,
    startedAt: row.started_at,
    finishedAt: row.finished_at ?? null,
    lastReportAt: row.last_report_at ?? null,
    workflowVersion: typeof row.workflow_version === "number" ? row.workflow_version : null,
    attemptCount: typeof row.attempt_count === "number" ? row.attempt_count : 0,
    nextAttemptAt: row.next_attempt_at ?? null,
    heartbeatAt: row.heartbeat_at ?? null,
    leaseExpiresAt: row.lease_expires_at ?? null,
    hasLease: typeof row.lease_owner === "string" && row.lease_owner.trim().length > 0,
    fencingToken: typeof row.fencing_token === "number" ? row.fencing_token : 0,
    attempts: attempts.map((attempt) => ({
      id: attempt.id,
      attemptNumber: attempt.attempt_number,
      status: attempt.status,
      errorKind: attempt.error_kind ?? null,
      errorMessage: attempt.error_message ?? null,
      retryable: attempt.retryable ?? null,
      fencingToken: attempt.fencing_token,
      startedAt: attempt.started_at,
      heartbeatAt: attempt.heartbeat_at ?? null,
      finishedAt: attempt.finished_at ?? null,
    })),
    checkpoints: migrations.map((checkpoint) => ({
      migrationFile: checkpoint.migration_file ?? "",
      packagePosition: checkpoint.package_position ?? null,
      statementIndex: checkpoint.statement_index ?? null,
      totalStatements: checkpoint.total_statements ?? null,
      status: checkpoint.status ?? "unknown",
      updatedAt: checkpoint.updated_at ?? null,
    })),
  };
}

/**
 * Credencial do MASTER para LER o código-fonte. O token da instalação fica só
 * para gravar no repositório dela: separar as duas contas divide a cota de uso
 * do GitHub e evita o 403 "API rate limit exceeded" durante a publicação.
 */
function masterGithubToken(): string {
  return (process.env["UNITOS_GITHUB_TOKEN"] ?? "").trim();
}

async function guard(context: { supabase: unknown; userId: string }) {
  const { assertMasterInstallation } = await import("./manager.server");
  assertMasterInstallation();
  await assertSuperAdmin(context.supabase as unknown as RpcClient, context.userId);
}

async function mutationGuard(context: { supabase: unknown; userId: string }) {
  await guard(context);
  const { assertInstallationOperationsWritable } = await import("./freeze.server");
  await assertInstallationOperationsWritable(context.supabase as never);
}

export async function resolveInstallationManagerAccess(
  read: () => Promise<boolean>,
): Promise<boolean> {
  return read();
}

export function resolveOperationRowsRead<T>(result: { data?: T[] | null; error?: unknown }): T[] {
  if (result.error) throw result.error;
  return result.data ?? [];
}

export function resolveRunningProvisionRead<T>(result: {
  data?: T[] | null;
  error?: unknown;
}): T | null {
  const rows = resolveOperationRowsRead(result);
  return rows[0] ?? null;
}

export async function assertNoActiveInstallationOperation(
  supabase: { from: (table: string) => any },
  installationId: string,
): Promise<void> {
  const { data: active, error } = await supabase
    .from("installation_operations")
    .select("id")
    .eq("installation_id", installationId)
    .in("status", ["pending", "running", "retryable"])
    .maybeSingle();
  if (error) throw error;
  if (active) throw new Error("Já existe uma operação em andamento nesta instalação.");
}

/**
 * Ação CRÍTICA de instalação: além do guard de autoridade, exige que o Super
 * Admin tenha digitado o NOME EXATO da instalação (validação real no servidor,
 * a UI não é suficiente) e registra a ação no histórico auditável.
 */
async function assertCriticalInstallationConfirm(
  context: { supabase: unknown; userId: string },
  installationId: string,
  confirmLabel: string | null | undefined,
  action: CriticalActionKey,
  impact: Record<string, unknown> = {},
): Promise<{ id: string; name: string }> {
  const supabase = context.supabase as never as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (
          c: string,
          v: string,
        ) => { maybeSingle: () => Promise<{ data: unknown; error: unknown }> };
      };
    };
  };
  const { data, error } = await supabase
    .from("installations")
    .select("id,name")
    .eq("id", installationId)
    .maybeSingle();
  if (error) throw error;
  const row = data as { id: string; name: string } | null;
  if (!row) throw new Error("Instalação não encontrada.");
  assertConfirmLabel(confirmLabel, row.name);
  const { logCriticalAction } = await import("@/lib/critical-audit.server");
  await logCriticalAction(context.supabase as never, {
    action,
    actorId: context.userId,
    targetId: row.id,
    targetLabel: row.name,
    impact,
  });
  return row;
}

/** Disponibilidade do módulo — usado pela UI para esconder a área. */
export const getInstallationManagerAccessFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { detectMaster } = await import("./manager.server");
    const isMaster = detectMaster();
    const isSuperAdmin = await resolveInstallationManagerAccess(() =>
      resolveIsSuperAdmin(context.supabase as unknown as RpcClient, context.userId),
    );
    return {
      isMaster,
      isSuperAdmin,
      available: isMaster && isSuperAdmin,
      releaseVersion: MASTER_RELEASE_VERSION,
    };
  });

/**
 * Encerra operações que ficaram "em andamento" sem reportar progresso. Sem
 * isto, uma queda no meio da execução deixa a instalação travada para sempre.
 */
export async function reconcileStuckOperations(context: { supabase: unknown }): Promise<void> {
  const { readInstallationOperationsFreeze } = await import("./freeze.server");
  if ((await readInstallationOperationsFreeze(context.supabase as never)).frozen) return;
  const supabase = context.supabase as {
    from: (table: string) => {
      select: (columns: string) => {
        in: (
          column: string,
          values: string[],
        ) => {
          order: (
            column: string,
            options: { ascending: boolean },
          ) => {
            limit: (n: number) => Promise<{
              data?: Array<{
                id: string;
                started_at: string;
                last_report_at?: string | null;
              }> | null;
              error?: unknown;
            }>;
          };
        };
      };
    };
  };
  try {
    const result = await supabase
      .from("installation_operations")
      .select("*")
      .in("status", ["pending", "running", "retryable"])
      .order("created_at", { ascending: false })
      .limit(20);
    const rows = resolveOperationRowsRead(result).filter(
      (row) => !((row as { detail?: { automated?: boolean } }).detail?.automated ?? false),
    );
    const [{ isOperationStale }, { finalizeOperation }] = await Promise.all([
      import("./manager-contract"),
      import("./runner.server"),
    ]);
    for (const op of rows) {
      const stale = isOperationStale({
        status: "running",
        startedAt: op.started_at,
        lastReportAt: op.last_report_at ?? null,
      });
      if (!stale) continue;
      await finalizeOperation(supabase as never, op as never, {
        ok: false,
        summary:
          "Operação encerrada por falta de resposta do processo. O progresso já concluído foi preservado — execute novamente para retomar.",
        errorKind: "interrompida",
      }).catch(() => undefined);
    }
  } catch {
    // reconciliação é best-effort: nunca deve impedir a listagem do painel.
  }
  // Segunda rede de proteção: a operação pode ter sido encerrada (success/failed)
  // sem que o patch da instalação tenha sido gravado — `finish()` engole erros
  // de rede. Nesse caso a instalação fica "em andamento" para sempre. Aqui a
  // referência órfã é liberada usando o resultado real da operação.
  try {
    const db = context.supabase as never as {
      from: (table: string) => any;
    };
    const { data: pending, error: pendingError } = await db
      .from("installations")
      .select("id, active_operation_id, status")
      .not("active_operation_id", "is", null)
      .limit(50);
    if (pendingError) throw pendingError;
    for (const row of (pending ?? []) as Array<{
      id: string;
      active_operation_id: string;
    }>) {
      const { data: op, error: operationError } = await db
        .from("installation_operations")
        .select("status, summary")
        .eq("id", row.active_operation_id)
        .maybeSingle();
      if (operationError) throw operationError;
      const status = (op as { status?: string } | null)?.status ?? null;
      if (status === "pending" || status === "running" || status === "retryable") continue;
      await db
        .from("installations")
        .update({
          active_operation_id: null,
          ...(status === "success"
            ? {}
            : {
                status: "error",
                last_error:
                  status === null
                    ? "A referência apontava para uma operação inexistente."
                    : ((op as { summary?: string | null }).summary ??
                      "Falha registrada na operação."),
              }),
        })
        .eq("id", row.id);
    }
  } catch {
    // best-effort
  }
}

export const listInstallationsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await guard(context);
    const { readInstallationOperationsFreezeForListing } = await import("./freeze.server");
    const freeze = await readInstallationOperationsFreezeForListing(context.supabase as never);
    // Compatibilidade de leitura durante a promoção 1.4.15: sem os objetos do
    // freeze, listar é seguro, mas a reconciliação (que pode escrever) não é.
    if (freeze.status === "inactive") await reconcileStuckOperations(context);
    const { data, error } = await context.supabase
      .from("installations")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return {
      releaseVersion: MASTER_RELEASE_VERSION,
      installations: (data ?? []).map(mapInstallation),
    };
  });

const UpsertInput = z.object({
  name: z.string().min(1).max(120),
  domain: z.string().max(200).nullable().optional(),
  supabaseUrl: z.string().max(300).nullable().optional(),
  supabaseProjectRef: z.string().max(120).nullable().optional(),
  gitRepoUrl: z.string().max(300).nullable().optional(),
  deployProject: z.string().max(200).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

function clean(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  return v ? v : null;
}

async function assertSupabaseManagementAccess(input: {
  token: string;
  supabaseProjectRef?: string | null;
  supabaseUrl?: string | null;
  requireKeys?: boolean;
}): Promise<void> {
  const { extractProjectRef } = await import("./automation-contract");
  const projectRef = extractProjectRef(input);
  if (!projectRef) {
    throw new Error("Informe a URL ou o Project ref do Supabase antes de salvar o token.");
  }
  const { createManagementClient } = await import("./automation.server");
  const management = createManagementClient({ token: input.token.trim(), projectRef });
  const database = await management.query("select 1 as ok");
  if (!database.ok) {
    throw new Error(
      `Este token não pode administrar o projeto informado. ${database.error ?? "Acesso recusado."}`,
    );
  }
  if (input.requireKeys === false) return;
  const keys = await management.keys();
  if (!keys.ok || !keys.publishableKey || !keys.serviceRoleKey) {
    throw new Error(
      `Este token não possui todos os acessos exigidos pelo provisionamento. ${keys.error ?? "Não foi possível ler as chaves de API do projeto."}`,
    );
  }
}

async function assertEmptySupabaseProject(input: {
  token: string;
  supabaseProjectRef?: string | null;
  supabaseUrl?: string | null;
}): Promise<string> {
  const { extractProjectRef } = await import("./automation-contract");
  const projectRef = extractProjectRef(input);
  if (!projectRef) throw new Error("Informe a URL do projeto Supabase novo.");

  const { createManagementClient } = await import("./automation.server");
  const management = createManagementClient({ token: input.token, projectRef });
  const emptyCheck = await management.query(
    `select
      (select count(*)::int from information_schema.tables where table_schema='public' and table_type='BASE TABLE') as public_tables,
      (select count(*)::int from auth.users) as auth_users,
      (select count(*)::int from storage.objects) as storage_objects`,
  );
  const emptyRow = emptyCheck.rows[0] as
    | { public_tables?: unknown; auth_users?: unknown; storage_objects?: unknown }
    | undefined;
  const counts = {
    publicTables: Number(emptyRow?.public_tables ?? NaN),
    authUsers: Number(emptyRow?.auth_users ?? NaN),
    storageObjects: Number(emptyRow?.storage_objects ?? NaN),
  };
  if (!emptyCheck.ok || Object.values(counts).some((count) => !Number.isFinite(count))) {
    throw new Error(
      `Não foi possível confirmar que o projeto Supabase novo está vazio. ${emptyCheck.error ?? ""}`.trim(),
    );
  }
  if (Object.values(counts).some((count) => count !== 0)) {
    throw new Error(
      `O projeto Supabase informado não está vazio (${counts.publicTables} tabela(s) em public, ${counts.authUsers} usuário(s), ${counts.storageObjects} arquivo(s)). Nenhum dado foi alterado.`,
    );
  }
  return projectRef;
}

async function prevalidateSupabaseOperation(input: {
  env: Record<string, string | undefined>;
  supabaseProjectRef?: string | null;
  supabaseUrl?: string | null;
  requireKeys?: boolean;
}): Promise<void> {
  const token = (input.env["UNITOS_SUPABASE_MANAGEMENT_TOKEN"] ?? "").trim();
  if (!token) {
    throw new Error(
      "Supabase Access Token ausente. Configure o acesso antes de iniciar a operação.",
    );
  }
  await assertSupabaseManagementAccess({
    token,
    supabaseProjectRef: input.supabaseProjectRef,
    supabaseUrl: input.supabaseUrl,
    requireKeys: input.requireKeys,
  });
}

/**
 * Cadastro de instalação no modelo BYOK: o Supabase Access Token do cliente é
 * obrigatório e gravado cifrado no mesmo passo. Se a gravação falhar, o
 * cadastro é desfeito — instalação sem acesso próprio não deve existir.
 */
const CreateInput = UpsertInput.extend({
  supabaseManagementToken: z
    .string()
    .max(4096)
    .transform((v) => v.trim())
    .refine((v) => v.length > 0, {
      message: "Informe o Supabase Access Token da instalação.",
    }),
});

export const createInstallationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CreateInput.parse(input))
  .handler(async ({ data, context }) => {
    await mutationGuard(context);

    const validation = validateInstallationInput(data);
    if (!validation.ok) throw new Error(validation.error);

    await assertSupabaseManagementAccess({
      token: data.supabaseManagementToken,
      supabaseProjectRef: data.supabaseProjectRef,
      supabaseUrl: data.supabaseUrl,
    });
    const projectRef = await assertEmptySupabaseProject({
      token: data.supabaseManagementToken,
      supabaseProjectRef: data.supabaseProjectRef,
      supabaseUrl: data.supabaseUrl,
    });

    const insert = {
      name: data.name.trim(),
      slug: validation.slug,
      domain: clean(data.domain),
      supabase_url: clean(data.supabaseUrl),
      supabase_project_ref: clean(data.supabaseProjectRef) ?? projectRef,
      git_repo_url: clean(data.gitRepoUrl),
      deploy_project: clean(data.deployProject),
      notes: clean(data.notes),
      status: "preparing" as const,
      health: "unknown" as const,
      available_version: MASTER_RELEASE_VERSION,
      requires_own_supabase_token: true,
      created_by: context.userId,
    };

    const { data: row, error } = await context.supabase
      .from("installations")
      .insert(insert)
      .select("*")
      .single();
    if (error) {
      if ((error as { code?: string }).code === "23505")
        throw new Error("Já existe uma instalação com este nome.");
      throw error;
    }

    try {
      const { saveInstallationCredentials } = await import("./credentials.server");
      await saveInstallationCredentials(context.supabase, row.id, context.userId, {
        supabaseManagementToken: data.supabaseManagementToken,
      });
    } catch (e) {
      // Rollback: sem token próprio a instalação não pode ser provisionada.
      await context.supabase.from("installations").delete().eq("id", row.id);
      throw new Error(
        `Não foi possível guardar o Supabase Access Token com segurança, então a instalação não foi cadastrada. ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }

    await context.supabase.from("installation_operations").insert({
      installation_id: row.id,
      kind: "register",
      status: "success",
      summary:
        "Instalação cadastrada com acesso próprio do Supabase (token guardado cifrado, nunca exibido).",
      detail: { releaseVersion: MASTER_RELEASE_VERSION, byok: true },
      actor_id: context.userId,
      finished_at: new Date().toISOString(),
    });

    return mapInstallation(row);
  });

/**
 * Edição dos dados. O Supabase Access Token é opcional aqui: campo vazio
 * MANTÉM o token já guardado (nunca apaga por descuido). Se a gravação cifrada
 * falhar, nada é alterado — o cadastro não fica pela metade.
 */
const UpdateInput = UpsertInput.extend({
  id: z.string().uuid(),
  supabaseManagementToken: z.string().max(4096).optional(),
});

export const updateInstallationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdateInput.parse(input))
  .handler(async ({ data, context }) => {
    await mutationGuard(context);
    const validation = validateInstallationInput(data);
    if (!validation.ok) throw new Error(validation.error);

    const token = (data.supabaseManagementToken ?? "").trim();
    if (token) {
      await assertSupabaseManagementAccess({
        token,
        supabaseProjectRef: data.supabaseProjectRef,
        supabaseUrl: data.supabaseUrl,
      });
      const { saveInstallationCredentials } = await import("./credentials.server");
      try {
        await saveInstallationCredentials(context.supabase as never, data.id, context.userId, {
          supabaseManagementToken: token,
        } as never);
      } catch (e) {
        throw new Error(
          `Não foi possível guardar o Supabase Access Token com segurança, então nada foi alterado. ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
      }
    }

    const { data: row, error } = await context.supabase
      .from("installations")
      .update({
        name: data.name.trim(),
        slug: validation.slug,
        domain: clean(data.domain),
        supabase_url: clean(data.supabaseUrl),
        supabase_project_ref: clean(data.supabaseProjectRef),
        git_repo_url: clean(data.gitRepoUrl),
        deploy_project: clean(data.deployProject),
        notes: clean(data.notes),
      })
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw error;
    return mapInstallation(row);
  });

export const getInstallationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await guard(context);
    await reconcileStuckOperations(context);
    const [{ data: row, error }, ops] = await Promise.all([
      context.supabase.from("installations").select("*").eq("id", data.id).maybeSingle(),
      context.supabase
        .from("installation_operations")
        .select("*")
        .eq("installation_id", data.id)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    if (error) throw error;
    if (!row) throw new Error("Instalação não encontrada.");
    if (ops.error) throw ops.error;
    const operationRows = ops.data ?? [];
    const operationIds = operationRows.map((operation) => operation.id);
    const [migrations, attempts] = operationIds.length
      ? await Promise.all([
          context.supabase
            .from("installation_operation_migrations")
            .select(
              "operation_id,migration_file,package_position,statement_index,total_statements,status,updated_at",
            )
            .in("operation_id", operationIds)
            .order("package_position", { ascending: false })
            .order("updated_at", { ascending: false }),
          context.supabase
            .from("installation_operation_attempts")
            .select(
              "id,operation_id,attempt_number,status,error_kind,error_message,retryable,fencing_token,started_at,heartbeat_at,finished_at",
            )
            .in("operation_id", operationIds)
            .order("attempt_number", { ascending: false }),
        ])
      : [
          { data: [], error: null },
          { data: [], error: null },
        ];
    if (migrations.error) throw migrations.error;
    if (attempts.error) throw attempts.error;
    const migrationsByOperation = new Map<string, MigrationEvidence[]>();
    for (const migration of migrations.data ?? []) {
      const current = migrationsByOperation.get(migration.operation_id) ?? [];
      current.push(migration);
      migrationsByOperation.set(migration.operation_id, current);
    }
    const attemptsByOperation = new Map<string, AttemptEvidence[]>();
    for (const attempt of attempts.data ?? []) {
      const current = attemptsByOperation.get(attempt.operation_id) ?? [];
      current.push(attempt);
      attemptsByOperation.set(attempt.operation_id, current);
    }
    return {
      installation: mapInstallation(row),
      operations: operationRows.map((operation) =>
        mapOperation(
          operation,
          migrationsByOperation.get(operation.id),
          attemptsByOperation.get(operation.id),
        ),
      ),
      provisionSteps: PROVISION_STEPS,
      validateSteps: VALIDATE_STEPS,
    };
  });

export const deleteInstallationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), confirmLabel: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await mutationGuard(context);
    await assertCriticalInstallationConfirm(
      context,
      data.id,
      data.confirmLabel,
      "installation.delete",
    );
    const { error } = await context.supabase.from("installations").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true as const };
  });

/**
 * Suspende / reativa o ambiente do cliente.
 *
 * Escreve o estado no banco do PRÓPRIO ambiente (singleton `installation`):
 * é lá que a tela do cliente lê. Suspenso = ninguém entra, exceto o Super
 * Admin daquele ambiente. Nenhum dado é apagado.
 */
export const setInstallationServiceStateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        state: z.enum(["active", "suspended"]),
        reason: z.string().max(500).optional(),
        confirmLabel: z.string().min(1),
        retryOfOperationId: z.string().uuid().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await mutationGuard(context);
    const suspend = data.state === "suspended";
    const reason = (data.reason ?? "").trim();
    if (suspend && !reason) throw new Error("Informe o motivo da suspensão.");

    await assertCriticalInstallationConfirm(
      context,
      data.id,
      data.confirmLabel,
      suspend ? "installation.suspend" : "installation.resume",
      { state: data.state, reason: reason || null },
    );

    const { data: current, error: readError } = await context.supabase
      .from("installations")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (readError) throw readError;
    if (!current) throw new Error("Instalação não encontrada.");
    const record = mapInstallation(current);
    if (!record.supabaseProjectRef) {
      throw new Error("A instalação não tem o projeto do Supabase configurado.");
    }

    const { resolveInstallationEnv } = await import("./credentials.server");
    const env = await resolveInstallationEnv(context.supabase as never, data.id);
    const token = (env["UNITOS_SUPABASE_MANAGEMENT_TOKEN"] ?? "").trim();
    if (!token) {
      throw new Error(
        "Nenhum Supabase Access Token disponível para esta instalação. Cadastre o token do cliente em “Editar dados” e tente de novo.",
      );
    }

    const { setRemoteInstallationServiceState } = await import("./service-state.server");
    const changed = await setRemoteInstallationServiceState({
      env,
      projectRef: record.supabaseProjectRef,
      state: data.state,
      actor: context.userId,
      preserveSuspended: false,
    });
    if (!changed) {
      throw new Error(
        `Não foi possível ${suspend ? "suspender" : "reativar"} o ambiente: falha ao falar com o banco da instalação`,
      );
    }

    await context.supabase.from("installation_operations").insert({
      installation_id: data.id,
      kind: "register",
      status: "success",
      summary: suspend ? `Ambiente suspenso: ${reason}` : "Ambiente reativado.",
      detail: { serviceState: data.state },
      actor_id: context.userId,
      finished_at: new Date().toISOString(),
    });

    return { ok: true as const, state: data.state };
  });

const StartInput = z.object({
  id: z.string().uuid(),
  kind: z.enum(["provision", "validate", "update"]),
  /** Confirmação explícita exigida para atualizar uma instalação. */
  confirm: z.boolean().optional(),
  confirmLabel: z.string().min(1),
});

/**
 * Abre a operação: valida o alvo, garante que não há outra operação em
 * andamento e emite um token de execução de uso único. Quem executa é o
 * script existente em `supabase/install/` — o MASTER só acompanha.
 */
export const startInstallationOperationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => StartInput.parse(input))
  .handler(async ({ data, context }) => {
    await mutationGuard(context);
    await assertCriticalInstallationConfirm(
      context,
      data.id,
      data.confirmLabel,
      data.kind === "update"
        ? "installation.update"
        : data.kind === "validate"
          ? "installation.validate"
          : "installation.provision",
      { kind: data.kind, mode: "manual" },
    );

    const { data: current, error: readError } = await context.supabase
      .from("installations")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (readError) throw readError;
    if (!current) throw new Error("Instalação não encontrada.");

    const record = mapInstallation(current);
    const kind = data.kind as InstallationOperationKind;

    const target = assertOperationTarget(record);
    if (!target.ok) throw new Error(target.error);

    // Fluxo manual é fallback: com credenciais de gestão do MASTER disponíveis
    // a operação precisa ir pelo caminho automatizado. Sem isso, um clique
    // antes da capability carregar criava uma operação "pending" que ninguém
    // executava e travava a instalação em "Validando"/"Provisionando".
    {
      const { resolveAutomationCapability, resolveAutomationTarget } =
        await import("./automation-contract");
      const { resolveInstallationEnv } = await import("./credentials.server");
      const capability = resolveAutomationCapability(
        await resolveInstallationEnv(context.supabase as never, data.id),
      );
      const autoTarget = resolveAutomationTarget(record);
      if (capability.available && autoTarget.ok) {
        throw new Error(
          "Esta instalação usa o fluxo automatizado do MASTER. Use “Provisionar automaticamente” ou “Validar automaticamente”.",
        );
      }
    }

    if (kind === "update") {
      if (!isUpdateAvailable(record.currentVersion, record.availableVersion)) {
        throw new Error("A instalação já está na versão do MASTER — nada a atualizar.");
      }
      if (!data.confirm)
        throw new Error(updateSummary(record.currentVersion, record.availableVersion));
    }

    if (!canStartOperation(kind, record.status)) {
      throw new Error(
        `A instalação está em “${INSTALLATION_STATUS_LABEL[record.status]}” e não aceita esta operação agora.`,
      );
    }

    // Trava: no máximo uma operação viva por instalação (índice único no banco).
    await assertNoActiveInstallationOperation(context.supabase as never, data.id);

    const { generateRunToken, hashRunToken, RUN_TOKEN_TTL_MS } = await import("./runner.server");
    const runToken = generateRunToken();
    const nowIso = new Date().toISOString();

    const { data: op, error: opError } = await context.supabase
      .from("installation_operations")
      .insert({
        installation_id: data.id,
        kind,
        status: "pending",
        summary:
          kind === "validate"
            ? "Validação aberta — rode supabase/install/validate.sh na instalação."
            : "Execução aberta — rode supabase/install/bootstrap.sh na instalação de destino.",
        steps: initialSteps(kind),
        detail: { releaseVersion: MASTER_RELEASE_VERSION, executed: false },
        actor_id: context.userId,
        started_at: nowIso,
        run_token_hash: await hashRunToken(runToken),
        run_token_expires_at: new Date(Date.now() + RUN_TOKEN_TTL_MS).toISOString(),
      })
      .select("*")
      .single();
    if (opError) {
      if ((opError as { code?: string }).code === "23505")
        throw new Error("Já existe uma operação em andamento nesta instalação.");
      throw opError;
    }

    const { data: updated, error: updateError } = await context.supabase
      .from("installations")
      .update({
        status: runningStatusFor(kind),
        last_error: null,
        active_operation_id: op.id,
      })
      .eq("id", data.id)
      .select("*")
      .single();
    if (updateError) throw updateError;

    const masterUrl =
      process.env["PUBLIC_APP_URL"] ??
      process.env["VITE_PUBLIC_APP_URL"] ??
      "https://unitos-master.lovable.app";

    return {
      installation: mapInstallation(updated),
      operation: mapOperation(op),
      /** Exibido UMA única vez; no banco existe apenas o hash. */
      runCommand: buildRunCommand({
        kind,
        masterUrl,
        operationId: op.id,
        runToken,
        appUrl: record.domain,
      }),
    };
  });

const CompleteInput = z.object({
  operationId: z.string().uuid(),
  ok: z.boolean(),
  warnings: z.boolean().optional(),
  version: z.string().max(40).nullable().optional(),
  summary: z.string().max(500).optional(),
  confirmLabel: z.string().min(1),
});

/** Registro manual do resultado (fallback quando o script não reporta). */
export const completeInstallationOperationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CompleteInput.parse(input))
  .handler(async ({ data, context }) => {
    await mutationGuard(context);

    const { data: op, error } = await context.supabase
      .from("installation_operations")
      .select("*")
      .eq("id", data.operationId)
      .maybeSingle();
    if (error) throw error;
    if (!op) throw new Error("Operação não encontrada.");
    await assertCriticalInstallationConfirm(
      context,
      op.installation_id as string,
      data.confirmLabel,
      "installation.complete_operation",
      { operationId: data.operationId, ok: data.ok, version: data.version ?? null },
    );

    const { finalizeOperation } = await import("./runner.server");
    await finalizeOperation(context.supabase as never, op as never, {
      ok: data.ok,
      warnings: data.warnings ?? false,
      version: data.version ?? null,
      summary: data.summary ?? null,
      errorKind: data.ok ? null : "registro_manual",
    });

    const { data: updated, error: readError } = await context.supabase
      .from("installations")
      .select("*")
      .eq("id", op.installation_id)
      .single();
    if (readError) throw readError;
    return mapInstallation(updated);
  });

/** Cancela a operação viva, preservando o resultado parcial já reportado. */
export const cancelInstallationOperationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ operationId: z.string().uuid(), confirmLabel: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await mutationGuard(context);
    const { data: op, error } = await context.supabase
      .from("installation_operations")
      .select("*")
      .eq("id", data.operationId)
      .maybeSingle();
    if (error) throw error;
    if (!op) throw new Error("Operação não encontrada.");
    await assertCriticalInstallationConfirm(
      context,
      op.installation_id as string,
      data.confirmLabel,
      "installation.cancel_operation",
      { operationId: data.operationId, kind: op.kind ?? null },
    );

    const { finalizeOperation } = await import("./runner.server");
    await finalizeOperation(context.supabase as never, op as never, {
      ok: false,
      summary: "Operação cancelada pelo Super Admin. Resultado parcial preservado.",
      errorKind: "cancelada",
    });

    // Cancelar devolve a instalação a um estado que ACEITA novo provisionamento.
    await context.supabase
      .from("installations")
      .update({
        status: "attention",
        active_operation_id: null,
        last_error: "Operação cancelada pelo Super Admin.",
      })
      .eq("id", op.installation_id);

    return { ok: true as const };
  });

/** Reavalia a saúde da instalação com probes reais (sem credenciais do destino). */
export const refreshInstallationHealthFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await mutationGuard(context);
    const { data: row, error } = await context.supabase
      .from("installations")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new Error("Instalação não encontrada.");

    const { probeInstallationHealth } = await import("./runner.server");
    const { healthFromChecks } = await import("./manager-contract");
    const checks = await probeInstallationHealth({
      domain: row.domain ?? null,
      supabaseUrl: row.supabase_url ?? null,
      gitRepoUrl: row.git_repo_url ?? null,
      deployProject: row.deploy_project ?? null,
      storedChecks: row.health_checks,
    });

    const { data: updated, error: updateError } = await context.supabase
      .from("installations")
      .update({
        health_checks: checks,
        health_checked_at: new Date().toISOString(),
        health: healthFromChecks(checks),
      })
      .eq("id", data.id)
      .select("*")
      .single();
    if (updateError) throw updateError;
    return mapInstallation(updated);
  });

/* ------------------------------------------------ provisionamento automático */

/**
 * Disponibilidade do provisionamento automático. Retorna somente estados e
 * motivos — nunca valores de credenciais.
 */
export const getAutomationCapabilityFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ id: z.string().uuid().optional().nullable() })
      .optional()
      .nullable()
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await guard(context);
    const { resolveAutomationCapability } = await import("./automation-contract");
    const { runtimeEnv } = await import("@/lib/runtime-env.server");
    // Com id: capability da INSTALAÇÃO (credencial própria tem precedência).
    // Sem id: capability global do MASTER.
    const installationId = data?.id ?? null;
    let env = runtimeEnv();
    if (installationId) {
      const { resolveInstallationEnv } = await import("./credentials.server");
      env = await resolveInstallationEnv(context.supabase as never, installationId, env);
    }
    const capability = resolveAutomationCapability(env);
    return {
      available: capability.available,
      supabase: capability.supabase,
      vercel: capability.vercel,
      blockedReasons: capability.blockedReasons,
    };
  });

export type AutomatedProvisionStart =
  | {
      result: "STARTED";
      operationId: string;
      reasons: string[];
      appUrl: string | null;
      urlSource: null;
    }
  | {
      result: "BLOCKED";
      operationId: null;
      reasons: string[];
      appUrl: null;
      urlSource: null;
    };

async function startAtomicInstallationOperation(input: {
  actorId: string;
  installationId: string;
  kind: "provision" | "validate" | "update";
  summary: string;
  steps: OperationStep[];
  detail: Record<string, unknown>;
  baselineId?: string | null;
  baselineHash?: string | null;
  retryOfOperationId?: string | null;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { callRpc } = await import("@/lib/supabase-rpc");
  const { data, error } = await callRpc<Record<string, unknown>>(
    supabaseAdmin as never,
    "start_durable_installation_operation",
    {
      _actor_id: input.actorId,
      _installation_id: input.installationId,
      _kind: input.kind,
      _summary: input.summary,
      _steps: input.steps,
      _run_token_hash: null,
      _run_token_expires_at: null,
      _detail: input.detail,
      _workflow_version: 3,
      _baseline_id: input.baselineId ?? null,
      _baseline_hash: input.baselineHash ?? null,
      _retry_of_operation_id: input.retryOfOperationId ?? null,
    },
  );
  if (error || !data || typeof data["id"] !== "string") {
    const message = error?.message ?? "não foi possível abrir a operação";
    if (/andamento|55P03/i.test(message))
      throw new Error("Já existe uma operação em andamento nesta instalação.");
    throw new Error(message);
  }
  return data;
}

/**
 * Abre a operação de provisionamento automático e dispara a execução em
 * BACKGROUND (`waitUntil`), devolvendo imediatamente o id da operação. A UI
 * acompanha o progresso real por polling das etapas persistidas — a requisição
 * do clique nunca fica pendurada esperando o provisionamento inteiro.
 */
async function openAutomatedProvision(
  context: { supabase: unknown; userId: string },
  installationId: string,
  retryOfOperationId?: string | null,
): Promise<AutomatedProvisionStart> {
  const supabase = context.supabase as never as {
    from: (table: string) => any;
  };

  const { resolveAutomationCapability, resolveAutomationTarget } =
    await import("./automation-contract");
  const { resolveInstallationEnv } = await import("./credentials.server");
  const env = await resolveInstallationEnv(supabase as never, installationId);
  const capability = resolveAutomationCapability(env);
  if (!capability.available) {
    return {
      result: "BLOCKED",
      operationId: null,
      reasons: capability.blockedReasons,
      appUrl: null,
      urlSource: null,
    };
  }

  const { data: current, error: readError } = await supabase
    .from("installations")
    .select("*")
    .eq("id", installationId)
    .maybeSingle();
  if (readError) throw readError;
  if (!current) throw new Error("Instalação não encontrada.");

  const record = mapInstallation(current);
  const target = resolveAutomationTarget(record);
  if (!target.ok) {
    return {
      result: "BLOCKED",
      operationId: null,
      reasons: [target.reason],
      appUrl: null,
      urlSource: null,
    };
  }
  let retrySource: {
    id: string;
    kind: InstallationOperationKind;
    status: InstallationOperationStatus;
    baselineId: string | null;
    baselineHash: string | null;
  } | null = null;
  let retrySourceId: string | null = null;
  let hasSuccessfulProvision = false;
  if (retryOfOperationId) {
    const [latestResult, successfulResult] = await Promise.all([
      supabase
        .from("installation_operations")
        .select("id,kind,status,baseline_id,baseline_hash")
        .eq("installation_id", installationId)
        .eq("kind", "provision")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("installation_operations")
        .select("id")
        .eq("installation_id", installationId)
        .eq("kind", "provision")
        .eq("status", "success")
        .limit(1),
    ]);
    if (latestResult.error) throw latestResult.error;
    if (successfulResult.error) throw successfulResult.error;
    if (latestResult.data) {
      retrySource = {
        id: String(latestResult.data.id),
        kind: latestResult.data.kind as InstallationOperationKind,
        status: latestResult.data.status as InstallationOperationStatus,
        baselineId:
          typeof latestResult.data.baseline_id === "string" ? latestResult.data.baseline_id : null,
        baselineHash:
          typeof latestResult.data.baseline_hash === "string"
            ? latestResult.data.baseline_hash
            : null,
      };
      retrySourceId = retrySource.id;
    }
    hasSuccessfulProvision = (successfulResult.data ?? []).length > 0;
  }
  const retryAllowed = retryOfOperationId
    ? canRetryFailedProvision({
        installationStatus: record.status,
        lastProvisionedAt: record.lastProvisionedAt,
        activeOperationId: record.activeOperationId,
        lastProvisionOperation: retrySource,
        hasSuccessfulProvision,
      }) && retrySourceId === retryOfOperationId
    : false;
  if (!canStartOperation("provision", record.status) && !retryAllowed) {
    throw new Error(
      `A instalação está em “${INSTALLATION_STATUS_LABEL[record.status]}” e não aceita esta operação agora.`,
    );
  }
  if (retryOfOperationId && !retryAllowed) {
    throw new Error("A operação informada não é elegível para nova tentativa de provisionamento.");
  }
  if (retryOfOperationId && (!retrySource?.baselineId || !retrySource.baselineHash)) {
    throw new Error(
      "A operação anterior não possui um pacote selado; o progresso não pode ser herdado com segurança.",
    );
  }

  // Teste efetivo antes de criar a operação: token revogado, projeto incorreto
  // ou indisponibilidade são informados sem deixar uma operação BLOCKED órfã.
  await prevalidateSupabaseOperation({
    env,
    supabaseProjectRef: record.supabaseProjectRef,
    supabaseUrl: record.supabaseUrl,
  });

  await assertNoActiveInstallationOperation(supabase, installationId);

  const op = await startAtomicInstallationOperation({
    actorId: context.userId,
    installationId,
    kind: "provision",
    summary: "Provisionamento automático em execução pelo MASTER.",
    steps: initialSteps("provision"),
    detail: {
      releaseVersion: MASTER_RELEASE_VERSION,
      executed: true,
      automated: true,
      ...(retryOfOperationId
        ? { retryOfOperationId, retryReason: "failed_provision" as const }
        : {}),
    },
    baselineId: retrySource?.baselineId ?? null,
    baselineHash: retrySource?.baselineHash ?? null,
    retryOfOperationId: retryOfOperationId ?? null,
  });

  return {
    result: "STARTED",
    operationId: op.id as string,
    reasons: [],
    appUrl: null,
    urlSource: null,
  };
}

/**
 * Provisiona a instalação de forma automatizada: o MASTER usa as próprias
 * credenciais de gestão, aplica o baseline, gera secrets exclusivos, configura
 * as variáveis do deploy e resolve a URL operacional (domínio definitivo ou URL
 * temporária). Nada é simulado: dependência ausente devolve BLOCKED.
 */
export const runAutomatedProvisionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        confirmLabel: z.string().min(1),
        retryOfOperationId: z.string().uuid().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await mutationGuard(context);
    await assertCriticalInstallationConfirm(
      context,
      data.id,
      data.confirmLabel,
      data.retryOfOperationId ? "installation.retry_provision" : "installation.provision",
      data.retryOfOperationId ? { retryOfOperationId: data.retryOfOperationId } : {},
    );
    return openAutomatedProvision(context, data.id, data.retryOfOperationId ?? null);
  });

/**
 * Validação automática (READ-ONLY) executada pelo próprio MASTER: roda o mesmo
 * `verify-installation-client.sql` do fallback manual via Management API, sem pedir
 * Bash na instalação de destino. Sem credenciais de gestão devolve BLOCKED e a
 * tela volta a oferecer o comando manual.
 */
export const runAutomatedValidateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), confirmLabel: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await mutationGuard(context);
    await assertCriticalInstallationConfirm(
      context,
      data.id,
      data.confirmLabel,
      "installation.validate",
    );

    const { resolveAutomationCapability, resolveAutomationTarget } =
      await import("./automation-contract");
    const { resolveInstallationEnv } = await import("./credentials.server");
    const env = await resolveInstallationEnv(context.supabase as never, data.id);
    const capability = resolveAutomationCapability(env);
    if (!capability.available) {
      return { result: "BLOCKED" as const, operationId: null, reasons: capability.blockedReasons };
    }

    const { data: current, error: readError } = await context.supabase
      .from("installations")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (readError) throw readError;
    if (!current) throw new Error("Instalação não encontrada.");

    const record = mapInstallation(current);
    const target = resolveAutomationTarget(record);
    if (!target.ok) {
      return { result: "BLOCKED" as const, operationId: null, reasons: [target.reason] };
    }
    if (!canStartOperation("validate", record.status)) {
      throw new Error(
        `A instalação está em “${INSTALLATION_STATUS_LABEL[record.status]}” e não aceita esta operação agora.`,
      );
    }

    await prevalidateSupabaseOperation({
      env,
      supabaseProjectRef: record.supabaseProjectRef,
      supabaseUrl: record.supabaseUrl,
      requireKeys: false,
    });

    await assertNoActiveInstallationOperation(context.supabase as never, data.id);

    const op = await startAtomicInstallationOperation({
      actorId: context.userId,
      installationId: data.id,
      kind: "validate",
      summary: "Validação automática em execução pelo MASTER (somente leitura).",
      steps: initialSteps("validate"),
      detail: { releaseVersion: MASTER_RELEASE_VERSION, executed: true, automated: true },
    });

    return { result: "STARTED" as const, operationId: op.id as string, reasons: [] };
  });

/**
 * Reinício seguro: encerra a operação viva (registrando o cancelamento no
 * histórico com o resultado parcial preservado) e abre UMA nova operação
 * automatizada. Nunca cria duas operações concorrentes.
 */
export const restartAutomatedProvisionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        force: z.boolean().optional(),
        confirmLabel: z.string().min(1),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await mutationGuard(context);
    await assertCriticalInstallationConfirm(
      context,
      data.id,
      data.confirmLabel,
      "installation.reprovision",
      { force: data.force === true },
    );

    const { data: live, error } = await context.supabase
      .from("installation_operations")
      .select("*")
      .eq("installation_id", data.id)
      .in("status", ["pending", "running", "retryable"])
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) throw error;

    const op = (live ?? [])[0];
    if (op) {
      const { isOperationStale } = await import("./manager-contract");
      const stale = isOperationStale({
        status: "running",
        startedAt: op.started_at,
        lastReportAt: op.last_report_at ?? null,
      });
      if (!stale && !data.force) {
        throw new Error(
          "A operação atual ainda está reportando progresso. Aguarde ou cancele antes de reiniciar.",
        );
      }
      const { finalizeOperation } = await import("./runner.server");
      await finalizeOperation(context.supabase as never, op as never, {
        ok: false,
        summary:
          "Operação interrompida para reinício do provisionamento. Resultado parcial preservado.",
        errorKind: "reiniciada",
      });
    }

    await context.supabase
      .from("installations")
      .update({ status: "attention", active_operation_id: null })
      .eq("id", data.id);

    return openAutomatedProvision(context, data.id);
  });

/* -------------------------------------------------- atualização de código */

/**
 * Versão disponível no MASTER: commit atual da branch de produção do
 * repositório de código, usado no painel para comparar com a versão fixada em
 * cada instalação. Só leitura — não dispara deploy nenhum.
 */
export const getMasterVersionFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await guard(context);
    const { runtimeEnv } = await import("@/lib/runtime-env.server");
    const { createDeployClient } = await import("./automation.server");
    const env = runtimeEnv();
    const deploy = createDeployClient({
      token: (env["UNITOS_VERCEL_TOKEN"] ?? "").trim(),
      project: "master",
      teamId: (env["UNITOS_VERCEL_TEAM_ID"] ?? "").trim() || null,
      masterRepo: (env["UNITOS_MASTER_REPO"] ?? "").trim() || null,
      githubToken: (env["UNITOS_GITHUB_TOKEN"] ?? "").trim(),
    });
    const head = await deploy.latestCommit();
    // Versão que existe DENTRO do pacote publicado. Quando ela fica atrás de
    // MASTER_RELEASE_VERSION, o MASTER não foi publicado e "Atualizar" não tem
    // código novo para enviar — o painel precisa avisar antes da tentativa.
    let repoRelease: string | null = null;
    let repoReleaseError: string | null = null;
    if (head.ok && head.sha) {
      const { createCodeClient, DEFAULT_MASTER_REPO } = await import("./automation.server");
      const masterRepo = (env["UNITOS_MASTER_REPO"] ?? "").trim() || DEFAULT_MASTER_REPO;
      const [owner, repo] = masterRepo.split("/");
      const code = createCodeClient({
        token: (env["UNITOS_GITHUB_TOKEN"] ?? "").trim(),
        masterToken: masterGithubToken(),
        owner: owner ?? "",
        repo: repo ?? "",
        masterRepo,
      });
      const at = await code.releaseAtCommit(head.sha);
      repoRelease = at.ok ? (at.version ?? null) : null;
      repoReleaseError = at.ok ? null : (at.error ?? "versão do pacote indisponível");
    }
    const { compareReleaseVersions } = await import("./manager-contract");
    return {
      release: MASTER_RELEASE_VERSION,
      commitSha: head.ok ? (head.sha ?? null) : null,
      repoRelease,
      repoReleaseError,
      masterPublished: repoRelease
        ? compareReleaseVersions(repoRelease, MASTER_RELEASE_VERSION) >= 0
        : null,
      error: head.ok ? null : (head.error ?? "commit do MASTER indisponível"),
    };
  });

/**
 * Puxa o código publicado no MASTER para o deploy da instalação: abre uma
 * operação `update` persistida e dispara a execução em background. A UI
 * acompanha as etapas pelo mesmo polling das outras operações.
 *
 * A instalação externa nunca publica sozinha: este é o único caminho de
 * atualização, e ele exige autorização do Super Admin.
 */
export const runAutomatedUpdateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        commitSha: z
          .string()
          .regex(/^[0-9a-f]{7,40}$/i)
          .optional()
          .nullable(),
        confirmLabel: z.string().min(1),
        retryOfOperationId: z.string().uuid().optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await mutationGuard(context);
    await assertCriticalInstallationConfirm(
      context,
      data.id,
      data.confirmLabel,
      "installation.update",
      { commitSha: data.commitSha ?? null, targetVersion: MASTER_RELEASE_VERSION },
    );

    const supabase = context.supabase as never as {
      from: (table: string) => any;
    };

    const { resolveAutomationCapability } = await import("./automation-contract");
    const { resolveInstallationEnv } = await import("./credentials.server");
    const env = await resolveInstallationEnv(supabase as never, data.id);
    const capability = resolveAutomationCapability(env);
    if (!capability.vercel.available) {
      return {
        result: "BLOCKED" as const,
        operationId: null,
        reasons: [capability.vercel.reason ?? "token de deploy indisponível no MASTER"],
      };
    }

    const { data: current, error: readError } = await supabase
      .from("installations")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (readError) throw readError;
    if (!current) throw new Error("Instalação não encontrada.");

    const record = mapInstallation(current);
    if (!record.deployProject) {
      return {
        result: "BLOCKED" as const,
        operationId: null,
        reasons: ["a instalação não tem projeto de deploy configurado"],
      };
    }
    if (!canStartOperation("update", record.status)) {
      throw new Error(
        `A instalação está em “${INSTALLATION_STATUS_LABEL[record.status]}” e não aceita atualização agora.`,
      );
    }
    if (data.retryOfOperationId) {
      const { data: retrySource, error: retryError } = await supabase
        .from("installation_operations")
        .select("id")
        .eq("id", data.retryOfOperationId)
        .eq("installation_id", data.id)
        .eq("kind", "update")
        .eq("status", "failed")
        .maybeSingle();
      if (retryError) throw retryError;
      if (!retrySource) {
        throw new Error("A atualização informada não é elegível para retomada segura.");
      }
    }

    await assertNoActiveInstallationOperation(supabase, data.id);

    // A autorização precisa apontar para o ponto ATUAL do código do MASTER.
    // Aceitar um ponto antigo (por exemplo o commit já fixado na instalação)
    // faz a operação ser barrada como "MASTER não publicado" e nada sobe.
    const { createCodeClient, DEFAULT_MASTER_REPO } = await import("./automation.server");
    const masterRepoSlug = (env["UNITOS_MASTER_REPO"] ?? "").trim() || DEFAULT_MASTER_REPO;
    const [masterOwner, masterName] = masterRepoSlug.split("/");
    const masterCode = createCodeClient({
      token: (env["UNITOS_GITHUB_TOKEN"] ?? "").trim(),
      masterToken: masterGithubToken(),
      owner: masterOwner ?? "",
      repo: masterName ?? "",
      masterRepo: masterRepoSlug,
    });
    const head = await masterCode.masterHeadSha();
    if (!head.ok || !head.sha) {
      return {
        result: "BLOCKED" as const,
        operationId: null,
        reasons: [
          head.error ??
            "não foi possível ler o ponto atual do código do MASTER — configure o acesso de leitura ao repositório e publique o MASTER novamente",
        ],
      };
    }
    const targetSha = head.sha;
    const snapshot = await masterCode.releaseSnapshotAtCommit(targetSha);
    if (!snapshot.ok || !snapshot.version || !snapshot.sha256 || !snapshot.total) {
      return {
        result: "BLOCKED" as const,
        operationId: null,
        reasons: [snapshot.error ?? "não foi possível fixar o pacote autorizado do MASTER"],
      };
    }
    const { withdrawnReleaseReason } = await import("./manager-contract");
    const withdrawnReason = withdrawnReleaseReason(snapshot.version);
    if (withdrawnReason) {
      return {
        result: "BLOCKED" as const,
        operationId: null,
        reasons: [withdrawnReason],
      };
    }

    const op = await startAtomicInstallationOperation({
      actorId: context.userId,
      installationId: data.id,
      kind: "update",
      summary: "Atualização de código disparada pelo MASTER.",
      steps: initialSteps("update"),
      baselineId: `${snapshot.version}:${targetSha}:${snapshot.total}`,
      baselineHash: snapshot.sha256,
      detail: {
        releaseVersion: snapshot.version,
        executed: true,
        automated: true,
        targetCommitSha: targetSha,
        packageSnapshot: {
          version: snapshot.version,
          commitSha: targetSha,
          sha256: snapshot.sha256,
          totalMigrations: snapshot.total,
        },
        fromVersion: record.pinnedCommitSha
          ? `${record.pinnedRelease ?? record.currentVersion ?? "?"} · ${record.pinnedCommitSha.slice(0, 7)}`
          : (record.currentVersion ?? null),
        toVersion: `${snapshot.version} · ${targetSha.slice(0, 7)}`,
        ...(data.retryOfOperationId
          ? { retryOfOperationId: data.retryOfOperationId, retryReason: "failed_update" as const }
          : {}),
      },
      retryOfOperationId: data.retryOfOperationId ?? null,
    });
    await supabase.from("installations").update({ pinned_by: context.userId }).eq("id", data.id);

    return { result: "STARTED" as const, operationId: op.id as string, reasons: [] as string[] };
  });

/**
 * Reconcilia o registro do painel com a versão que está DE FATO publicada no
 * repositório da instalação. Necessário quando uma operação terminou sem gravar
 * a versão (o código subiu, o registro ficou atrás) — sem isso o painel mostra
 * um número e a instalação mostra outro.
 */
export const syncInstallationVersionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), confirmLabel: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await mutationGuard(context);
    await assertCriticalInstallationConfirm(
      context,
      data.id,
      data.confirmLabel,
      "installation.sync_version",
    );

    const supabase = context.supabase as never as {
      from: (table: string) => any;
    };
    const { data: current, error: readError } = await supabase
      .from("installations")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (readError) throw readError;
    if (!current) throw new Error("Instalação não encontrada.");
    const record = mapInstallation(current);

    const { resolveInstallationEnv } = await import("./credentials.server");
    const env = await resolveInstallationEnv(supabase as never, data.id);
    const { createCodeClient, DEFAULT_MASTER_REPO } = await import("./automation.server");
    const { resolveInstallationRepo } = await import("./automation-contract");

    const masterRepo = (env["UNITOS_MASTER_REPO"] ?? "").trim() || DEFAULT_MASTER_REPO;
    const repo = resolveInstallationRepo({
      gitRepoUrl: record.gitRepoUrl ?? null,
      masterRepo,
    });
    if (!repo.ok) return { ok: false as const, reason: repo.reason };

    const code = createCodeClient({
      token: (env["UNITOS_GITHUB_TOKEN"] ?? "").trim(),
      masterToken: masterGithubToken(),
      owner: repo.owner,
      repo: repo.repo,
      masterRepo,
    });
    const installed = await code.installedRelease();
    if (!installed.ok || !installed.version || !installed.sha) {
      return {
        ok: false as const,
        reason:
          installed.error ?? "não foi possível ler a versão publicada no repositório da instalação",
      };
    }

    const { isUpdateAvailable } = await import("./manager-contract");
    await supabase
      .from("installations")
      .update({
        current_version: installed.version,
        pinned_release: installed.version,
        pinned_commit_sha: installed.sha,
        pinned_at: new Date().toISOString(),
        status: isUpdateAvailable(installed.version, MASTER_RELEASE_VERSION)
          ? "update_available"
          : "up_to_date",
      })
      .eq("id", data.id);

    return {
      ok: true as const,
      version: installed.version,
      commitSha: installed.sha,
    };
  });

/* ------------------------------------------- credenciais próprias por instalação */

/**
 * Estado das credenciais de automação DESTA instalação. Nunca devolve valores
 * em claro: apenas “configurado” e máscara.
 */
export const getInstallationCredentialsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await guard(context);
    const { getInstallationCredentialsStatus } = await import("./credentials.server");
    return getInstallationCredentialsStatus(context.supabase as never, data.id);
  });

/**
 * Grava as credenciais próprias da instalação (cifradas). Campos omitidos
 * permanecem como estão; string vazia apaga aquele campo.
 */
export const saveInstallationCredentialsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        supabaseManagementToken: z.string().max(4096).optional(),
        supabasePublishableKey: z.string().max(4096).optional(),
        supabaseServiceRoleKey: z.string().max(4096).optional(),
        vercelToken: z.string().max(4096).optional(),
        vercelTeamId: z.string().max(200).optional(),
        githubToken: z.string().max(4096).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await mutationGuard(context);
    const incomingSupabaseToken = data.supabaseManagementToken?.trim();
    const incomingPublishableKey = data.supabasePublishableKey?.trim();
    const incomingServiceRoleKey = data.supabaseServiceRoleKey?.trim();
    if (Boolean(incomingPublishableKey) !== Boolean(incomingServiceRoleKey)) {
      throw new Error("Informe juntas a chave publicável e a chave de serviço do Supabase.");
    }
    let installationIdentity: {
      supabase_project_ref?: string | null;
      supabase_url?: string | null;
    } | null = null;
    if (incomingSupabaseToken || incomingPublishableKey) {
      const { data: installation, error: installationError } = await context.supabase
        .from("installations")
        .select("supabase_project_ref, supabase_url")
        .eq("id", data.id)
        .maybeSingle();
      if (installationError) throw installationError;
      if (!installation) throw new Error("Instalação não encontrada.");
      installationIdentity = installation;
    }
    if (incomingSupabaseToken && installationIdentity) {
      await assertSupabaseManagementAccess({
        token: incomingSupabaseToken,
        supabaseProjectRef: installationIdentity.supabase_project_ref,
        supabaseUrl: installationIdentity.supabase_url,
        requireKeys: !incomingPublishableKey,
      });
    }
    if (incomingPublishableKey && incomingServiceRoleKey && installationIdentity) {
      const { validateSupabaseProjectKeys } = await import("./automation.server");
      const checked = await validateSupabaseProjectKeys({
        supabaseUrl:
          installationIdentity.supabase_url ??
          `https://${installationIdentity.supabase_project_ref ?? ""}.supabase.co`,
        publishableKey: incomingPublishableKey,
        serviceRoleKey: incomingServiceRoleKey,
      });
      if (!checked.ok) throw new Error(checked.error);
    }
    const { saveInstallationCredentials, getInstallationCredentialsStatus } =
      await import("./credentials.server");
    const patch: Record<string, string> = {};
    for (const field of [
      "supabaseManagementToken",
      "supabasePublishableKey",
      "supabaseServiceRoleKey",
      "vercelToken",
      "vercelTeamId",
      "githubToken",
    ] as const) {
      const value = data[field];
      if (typeof value === "string") patch[field] = value;
    }
    await saveInstallationCredentials(
      context.supabase as never,
      data.id,
      context.userId,
      patch as never,
    );
    return getInstallationCredentialsStatus(context.supabase as never, data.id);
  });

/** Texto que o Super Admin digita para confirmar a propagação em massa. */
export const PROPAGATE_GITHUB_TOKEN_CONFIRM_LABEL = "APLICAR EM TODAS";

export type GithubTokenPropagationItem = {
  id: string;
  name: string;
  ok: boolean;
  error?: string;
};

/**
 * Ação CRÍTICA em massa: copia o token do GitHub do MASTER (segredo
 * `UNITOS_GITHUB_TOKEN` do servidor) para TODAS as instalações cadastradas,
 * gravando cifrado no cofre de cada uma. Usado quando o token da organização
 * é regenerado e as cópias por instalação ficam inválidas.
 *
 * O valor do token nunca sai do servidor: o retorno é só o resumo por
 * instalação, e a auditoria registra quantidades, não o segredo.
 */
export const propagateMasterGithubTokenFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ confirmLabel: z.string().max(200) }).parse(input))
  .handler(async ({ data, context }) => {
    await mutationGuard(context);
    assertConfirmLabel(data.confirmLabel, PROPAGATE_GITHUB_TOKEN_CONFIRM_LABEL);

    const githubToken = (process.env["UNITOS_GITHUB_TOKEN"] ?? "").trim();
    if (!githubToken) {
      throw new Error(
        "O token do GitHub do MASTER (UNITOS_GITHUB_TOKEN) não está configurado neste ambiente. Salve o novo token nos segredos do MASTER antes de propagar.",
      );
    }

    const { data: rows, error } = await context.supabase
      .from("installations")
      .select("id,name")
      .order("name", { ascending: true });
    if (error) throw error;
    const installations = (rows ?? []) as { id: string; name: string }[];
    if (installations.length === 0) {
      return { total: 0, updated: 0, failed: 0, results: [] as GithubTokenPropagationItem[] };
    }

    const { propagateGithubTokenToInstallations } = await import("./credentials.server");
    const results = await propagateGithubTokenToInstallations({
      client: context.supabase as never,
      actorId: context.userId,
      githubToken,
      installations,
    });

    const updated = results.filter((r) => r.ok).length;
    const failed = results.length - updated;

    const { logCriticalAction } = await import("@/lib/critical-audit.server");
    await logCriticalAction(context.supabase as never, {
      action: "installation.propagate_github_token",
      actorId: context.userId,
      targetId: null,
      targetLabel: `${updated}/${results.length} instalações`,
      impact: {
        total: results.length,
        updated,
        failed,
        failedNames: results.filter((r) => !r.ok).map((r) => r.name),
      },
    });

    return { total: results.length, updated, failed, results };
  });

/**
 * Estado dos segredos próprios da instalação (cron, criptografia, Meta).
 *
 * Só informa se cada um já existe: valores nunca voltam para a tela. Eles são
 * gerados uma única vez no provisionamento e reutilizados nas execuções
 * seguintes — trocar a chave de criptografia torna ilegíveis os acessos de
 * redes sociais já salvos, então a troca passou a ser explícita.
 */
export const getInstallationSecretsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await guard(context);
    const { getInstallationSecretsStatus } = await import("./credentials.server");
    const { GENERATED_SECRET_VARS } = await import("./automation-contract");
    return getInstallationSecretsStatus(context.supabase as never, data.id, GENERATED_SECRET_VARS);
  });

/** Troca um segredo próprio da instalação — ação deliberada, nunca automática. */
export const rotateInstallationSecretFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        name: z.string().min(3).max(120),
        confirmLabel: z.string().min(1),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await mutationGuard(context);
    await assertCriticalInstallationConfirm(
      context,
      data.id,
      data.confirmLabel,
      "installation.rotate_secret",
      { secret: data.name },
    );
    const { GENERATED_SECRET_VARS } = await import("./automation-contract");
    if (!(GENERATED_SECRET_VARS as readonly string[]).includes(data.name)) {
      throw new Error("Segredo desconhecido.");
    }
    const { rotateInstallationSecret, getInstallationSecretsStatus } =
      await import("./credentials.server");
    const { generateInstallationSecret } = await import("./automation.server");
    await rotateInstallationSecret({
      client: context.supabase as never,
      installationId: data.id,
      actorId: context.userId,
      name: data.name,
      generate: () => generateInstallationSecret(),
    });
    return {
      status: await getInstallationSecretsStatus(
        context.supabase as never,
        data.id,
        GENERATED_SECRET_VARS,
      ),
      applyHint: "Rode a atualização da instalação para publicar o novo valor no deploy.",
    };
  });

/** Remove as credenciais próprias: a instalação volta a usar as do MASTER. */
export const clearInstallationCredentialsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), confirmLabel: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await mutationGuard(context);
    await assertCriticalInstallationConfirm(
      context,
      data.id,
      data.confirmLabel,
      "installation.clear_credentials",
    );
    const { clearInstallationCredentials, getInstallationCredentialsStatus } =
      await import("./credentials.server");
    await clearInstallationCredentials(context.supabase as never, data.id);
    return getInstallationCredentialsStatus(context.supabase as never, data.id);
  });

/**
 * Testa as credenciais efetivas da instalação contra os serviços reais, sem
 * abrir operação nenhuma: confirma se o token de gestão alcança o banco de
 * destino e se o token de deploy vê o projeto. Só devolve estados e motivos.
 */
export const testInstallationCredentialsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await guard(context);

    const { data: current, error } = await context.supabase
      .from("installations")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw error;
    if (!current) throw new Error("Instalação não encontrada.");
    const record = mapInstallation(current);

    const { resolveAutomationTarget, resolveAutomationCapability } =
      await import("./automation-contract");
    const { resolveInstallationEnv } = await import("./credentials.server");
    const env = await resolveInstallationEnv(context.supabase as never, data.id);
    const capability = resolveAutomationCapability(env);
    const target = resolveAutomationTarget(record);
    if (!target.ok) {
      return {
        database: { ok: false, detail: target.reason },
        deploy: { ok: false, detail: "dados da instalação incompletos" },
        code: { ok: false, detail: "dados da instalação incompletos" },
        ok: false,
        missing: [target.reason],
        summary: `Faltam dados da instalação: ${target.reason}`,
        checks: [] as Array<{
          area: "database" | "deploy" | "code";
          label: string;
          ok: boolean;
          detail: string;
        }>,
      };
    }
    if (!capability.available) {
      const reason = capability.blockedReasons.join(" | ");
      return {
        database: { ok: false, detail: reason },
        deploy: { ok: false, detail: reason },
        code: { ok: false, detail: reason },
        ok: false,
        missing: capability.blockedReasons,
        summary: `Faltam credenciais: ${reason}`,
        checks: [] as Array<{
          area: "database" | "deploy" | "code";
          label: string;
          ok: boolean;
          detail: string;
        }>,
      };
    }

    const { createManagementClient, createDeployClient } = await import("./automation.server");
    const management = createManagementClient({
      token: (env["UNITOS_SUPABASE_MANAGEMENT_TOKEN"] ?? "").trim(),
      projectRef: target.projectRef,
    });
    const ping = await management.query("select 1 as ok");
    const remoteKeys = ping.ok ? await management.keys() : null;
    const suppliedPublishable = (env["UNITOS_SUPABASE_PUBLISHABLE_KEY"] ?? "").trim();
    const suppliedServiceRole = (env["UNITOS_SUPABASE_SERVICE_ROLE_KEY"] ?? "").trim();
    const keys =
      remoteKeys?.ok && remoteKeys.publishableKey && remoteKeys.serviceRoleKey
        ? remoteKeys
        : suppliedPublishable && suppliedServiceRole
          ? { ok: true, publishableKey: suppliedPublishable, serviceRoleKey: suppliedServiceRole }
          : remoteKeys;
    const database =
      ping.ok && keys?.ok && keys.publishableKey && keys.serviceRoleKey
        ? { ok: true, detail: `banco e chaves do projeto ${target.projectRef} acessíveis` }
        : {
            ok: false,
            detail: ping.ok
              ? (keys?.error ?? "o token não permite ler todas as chaves de API do projeto")
              : (ping.error ?? "acesso ao banco recusado"),
          };

    const deploy = createDeployClient({
      token: (env["UNITOS_VERCEL_TOKEN"] ?? "").trim(),
      project: target.deployProject,
      teamId: (env["UNITOS_VERCEL_TEAM_ID"] ?? "").trim() || null,
      masterRepo: (env["UNITOS_MASTER_REPO"] ?? "").trim() || null,
    });
    const project = await deploy.deploymentUrl();

    // Corrige automaticamente cadastros antigos quando a Vercel confirmou uma
    // equivalência canônica única (por exemplo, unitos-casa8 → unitos-casa-8).
    const resolvedDeployProject = project.ok ? (project.projectName ?? "").trim() : "";
    if (resolvedDeployProject && resolvedDeployProject !== target.deployProject) {
      const { error: deployNameError } = await context.supabase
        .from("installations")
        .update({ deploy_project: resolvedDeployProject })
        .eq("id", data.id);
      if (deployNameError) throw deployNameError;
    }

    // 404 na Vercel = o projeto não existe no escopo desse token (conta pessoal
    // vs equipe). Explicamos o que conferir e listamos os projetos visíveis.
    let deployDetail = project.ok
      ? resolvedDeployProject && resolvedDeployProject !== target.deployProject
        ? `projeto de deploy ${resolvedDeployProject} acessível · cadastro corrigido automaticamente (antes: ${target.deployProject})`
        : `projeto de deploy ${target.deployProject} acessível`
      : (project.error ?? "acesso negado");
    if (!project.ok && /HTTP 404/.test(deployDetail)) {
      const teamId = (env["UNITOS_VERCEL_TEAM_ID"] ?? "").trim();
      const url = `https://api.vercel.com/v9/projects?limit=100${
        teamId ? `&teamId=${encodeURIComponent(teamId)}` : ""
      }`;
      let visible: string[] = [];
      try {
        const res = await fetch(url, {
          headers: { authorization: `Bearer ${(env["UNITOS_VERCEL_TOKEN"] ?? "").trim()}` },
        });
        const body = (await res.json().catch(() => ({}))) as {
          projects?: Array<{ name?: string }>;
        };
        visible = (body.projects ?? []).map((p) => p.name ?? "").filter(Boolean);
      } catch {
        visible = [];
      }
      deployDetail =
        `projeto de deploy "${target.deployProject}" não encontrado com este token` +
        (teamId ? ` na equipe ${teamId}` : " (nenhuma equipe informada)") +
        ". Confira o nome exato do projeto na Vercel e informe o Team ID da equipe dona." +
        (visible.length ? ` Projetos visíveis: ${visible.slice(0, 10).join(", ")}.` : "");
    }

    // GitHub: sem este diagnóstico só se descobre no meio do provisionamento
    // que o token não cria repositório ou que o MASTER não é template.
    const { createCodeClient, DEFAULT_MASTER_REPO } = await import("./automation.server");
    const { resolveInstallationRepo } = await import("./automation-contract");
    const masterRepo = (env["UNITOS_MASTER_REPO"] ?? "").trim() || DEFAULT_MASTER_REPO;
    const repo = resolveInstallationRepo({
      gitRepoUrl: record.gitRepoUrl ?? null,
      masterRepo,
    });
    const permissionChecks: Array<{
      area: "database" | "deploy" | "code";
      label: string;
      ok: boolean;
      detail: string;
    }> = [];
    let code: { ok: boolean; detail: string } = {
      ok: false,
      detail: repo.ok ? "token do repositório não configurado" : repo.reason,
    };
    const githubToken = (env["UNITOS_GITHUB_TOKEN"] ?? "").trim();
    if (repo.ok && githubToken) {
      const client = createCodeClient({
        token: githubToken,
        masterToken: masterGithubToken(),
        owner: repo.owner,
        repo: repo.repo,
        masterRepo,
      });
      const diagnosis = await client.diagnose();
      code = { ok: diagnosis.ok, detail: diagnosis.detail };
      permissionChecks.push(...(await client.permissions()));
    }

    // Lista permissão por permissão: o painel mostra exatamente o que falta.
    const allChecks = [
      { area: "database" as const, label: "Banco e chaves do projeto", ...database },
      {
        area: "deploy" as const,
        label: "Projeto de publicação",
        ok: project.ok,
        detail: deployDetail,
      },
      { area: "code" as const, label: "Repositório da instalação", ...code },
      ...permissionChecks,
    ];
    // "Criação rápida pelo template" é conveniência, não requisito de acesso.
    const required = allChecks.filter((c) => !/template/i.test(c.label));
    const missing = required.filter((c) => !c.ok).map((c) => `${c.label}: ${c.detail}`);

    return {
      database,
      deploy: { ok: project.ok, detail: deployDetail },
      code,
      ok: missing.length === 0,
      missing,
      summary:
        missing.length === 0
          ? "OK — banco, publicação e repositório com os acessos necessários."
          : `Faltam ${missing.length} acesso(s): ${missing.join(" | ")}`,
      checks: allChecks,
    };
  });

/**
 * Adota um repositório criado à mão a partir do template do MASTER: confere se
 * o conteúdo corresponde à versão do MASTER e marca a etapa "Código no GitHub"
 * como concluída, sem publicar nada por cima. Serve de saída oficial quando a
 * criação automática está bloqueada por permissão do token.
 */
export const adoptInstallationRepositoryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        repo: z
          .string()
          .trim()
          .min(3)
          .max(200)
          .regex(/^[\w.-]+\/[\w.-]+$/, "informe no formato dono/repositorio"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await mutationGuard(context);

    const { data: current, error } = await context.supabase
      .from("installations")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw error;
    if (!current) throw new Error("Instalação não encontrada.");
    const record = mapInstallation(current);

    const { resolveInstallationEnv } = await import("./credentials.server");
    const env = await resolveInstallationEnv(context.supabase as never, data.id);
    const githubToken = (env["UNITOS_GITHUB_TOKEN"] ?? "").trim();
    if (!githubToken) throw new Error("Configure o token do repositório antes de adotar.");

    const { createCodeClient, DEFAULT_MASTER_REPO, readStageProgress, saveStageProgress } =
      await import("./automation.server");
    const masterRepo = (env["UNITOS_MASTER_REPO"] ?? "").trim() || DEFAULT_MASTER_REPO;
    const [owner, repoName] = data.repo.split("/");
    if (!owner || !repoName) throw new Error("Repositório inválido.");
    if (data.repo.toLowerCase() === masterRepo.toLowerCase()) {
      throw new Error("O repositório do MASTER não pode ser usado como destino da instalação.");
    }

    const code = createCodeClient({
      token: githubToken,
      masterToken: masterGithubToken(),
      owner,
      repo: repoName,
      masterRepo,
    });
    const head = await code.masterHeadSha();
    if (!head.ok || !head.sha) {
      throw new Error(head.error ?? "Não foi possível ler a versão atual do MASTER.");
    }
    // Confere o conteúdo sem publicar: 0 arquivos diferentes = repositório já
    // está na versão do MASTER.
    const check = await code.publishSnapshot(head.sha, { dryRun: true });
    if (!check.ok) throw new Error(check.error ?? "Repositório inacessível com este token.");

    const operation = await findRunningProvision(context.supabase as never, data.id);
    if (operation) {
      const stage = await readStageProgress(context.supabase as never, operation as never);
      await saveStageProgress(context.supabase as never, operation as never, {
        ...stage,
        codeDone: true,
        codeSha: head.sha,
        codeRepo: `${owner}/${repoName}`,
        codeBlobs: {},
      });
      const { applyProgressReport } = await import("./runner.server");
      await applyProgressReport(context.supabase as never, operation as never, {
        step: "code",
        state: "done",
        detail: `repositório ${owner}/${repoName} adotado manualmente (${head.sha.slice(0, 7)})`,
        percent: 100,
      });
    }

    // Mantém o cadastro coerente com o repositório realmente usado.
    if (record.gitRepoUrl !== `https://github.com/${owner}/${repoName}`) {
      await context.supabase
        .from("installations")
        .update({ git_repo_url: `https://github.com/${owner}/${repoName}` })
        .eq("id", data.id);
    }

    return {
      adopted: true as const,
      repo: `${owner}/${repoName}`,
      version: head.sha.slice(0, 7),
      pendingFiles: check.partial ? null : (check.changed ?? 0),
      operationUpdated: Boolean(operation),
    };
  });

/** Operação de provisionamento viva desta instalação, se houver. */
async function findRunningProvision(
  client: { from: (table: string) => never },
  installationId: string,
): Promise<{ id: string; detail?: unknown; steps?: unknown } | null> {
  const db = client as never as {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (
          c: string,
          v: string,
        ) => {
          eq: (
            c: string,
            v: string,
          ) => {
            order: (
              c: string,
              o: { ascending: boolean },
            ) => {
              limit: (n: number) => Promise<{
                data?: Array<Record<string, unknown>> | null;
                error?: unknown;
              }>;
            };
          };
        };
      };
    };
  };
  const result = await db
    .from("installation_operations")
    .select("*")
    .eq("installation_id", installationId)
    .eq("status", "running")
    .order("created_at", { ascending: false })
    .limit(1);
  return resolveRunningProvisionRead(result) as never;
}

/* ---------------------------------------------- integrações (somente leitura) */

export type IntegrationInspection = {
  id: "custom_domain" | "meta" | "resend" | "evolution" | "ai" | "branding";
  state: "configured" | "pending" | "not_configured";
  detail: string;
};

export type IntegrationsInspection = {
  ok: boolean;
  /** Motivo em pt-BR quando a leitura não foi possível (sem credenciais etc.). */
  reason: string | null;
  appUrl: string | null;
  deployedAppUrl: string | null;
  browserAppUrl: string | null;
  installationAppUrl: string | null;
  cronOrigins: string[] | null;
  cronJobCount: number | null;
  domainAssigned: boolean;
  domainVerified: boolean;
  metaRedirectUri: string | null;
  expectedMetaRedirectUri: string | null;
  superAdminSetupUrl: string | null;
  items: IntegrationInspection[];
  checkedAt: string;
};

/**
 * Conferência READ-ONLY das integrações de uma instalação: quais variáveis
 * existem no projeto de deploy (só os NOMES), se o domínio definitivo está
 * atribuído/verificado e se o endereço de retorno do Meta bate com o domínio.
 * Nenhum segredo é lido nem devolvido; nada é gravado no destino.
 */
export const inspectInstallationIntegrationsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<IntegrationsInspection> => {
    await guard(context);

    const {
      customDomainState,
      classifyOperationalUrl,
      metaIntegrationState,
      operationalUrlState,
      envIntegrationState,
      metaRedirectUriFor,
    } = await import("./readiness-contract");

    const { data: row, error } = await context.supabase
      .from("installations")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new Error("Instalação não encontrada.");
    const record = mapInstallation(row);

    const url = classifyOperationalUrl(record.domain);
    const appUrl = url.ok ? url.origin : null;
    const checkedAt = new Date().toISOString();
    const domainItem: IntegrationInspection = {
      id: "custom_domain",
      state: customDomainState(record.domain),
      detail: appUrl
        ? `URL operacional ${appUrl}.`
        : "Domínio definitivo ainda não cadastrado nesta instalação.",
    };

    const blockedResult = (reason: string): IntegrationsInspection => ({
      ok: false,
      reason,
      appUrl,
      deployedAppUrl: null,
      browserAppUrl: null,
      installationAppUrl: null,
      cronOrigins: null,
      cronJobCount: null,
      domainAssigned: false,
      domainVerified: false,
      metaRedirectUri: null,
      expectedMetaRedirectUri: metaRedirectUriFor(record.domain),
       superAdminSetupUrl: null,
      items: [{ ...domainItem, state: "pending", detail: `Cadastro ${appUrl ?? "não informado"}; configuração ativa não confirmada. ${reason}` }],
      checkedAt,
    });

    const { resolveInstallationEnv } = await import("./credentials.server");
    const env = await resolveInstallationEnv(context.supabase as never, data.id);
    const token = (env["UNITOS_VERCEL_TOKEN"] ?? "").trim();
    if (!token || !record.deployProject) {
      return blockedResult(
        !token
          ? "Sem o token do deploy desta instalação não é possível conferir as variáveis."
          : "Instalação sem projeto de deploy cadastrado.",
      );
    }

    const { createDeployClient } = await import("./automation.server");
    const deploy = createDeployClient({
      token,
      project: record.deployProject,
      teamId: (env["UNITOS_VERCEL_TEAM_ID"] ?? "").trim() || null,
    });

    const listed = await deploy.listEnv(["META_REDIRECT_URI", "PUBLIC_APP_URL", "VITE_PUBLIC_APP_URL"]);
    if (!listed.ok) {
      return blockedResult(listed.error ?? "Falha ao consultar as variáveis do deploy.");
    }
    const keys = listed.keys ?? [];
    const metaRedirectUri = listed.plain?.["META_REDIRECT_URI"] ?? null;
    const deployedAppUrl = listed.plain?.["PUBLIC_APP_URL"] ?? null;
    const browserAppUrl = listed.plain?.["VITE_PUBLIC_APP_URL"] ?? null;
    // Management API do PRÓPRIO destino, com token próprio quando BYOK.
    // Consulta apenas origens dos comandos cron; nunca retorna comandos nem chaves.
    let installationAppUrl: string | null = null;
    let cronOrigins: string[] | null = null;
    let cronJobCount: number | null = null;
    let destinationReadError: string | null = null;
    const { extractProjectRef } = await import("./automation-contract");
    const projectRef = extractProjectRef(record);
    const managementToken = (env["UNITOS_SUPABASE_MANAGEMENT_TOKEN"] ?? "").trim();
    if (projectRef && managementToken) {
      const { createManagementClient } = await import("./automation.server");
      const management = createManagementClient({ token: managementToken, projectRef });
      const identity = await management.query("select app_url from public.installation where id = true");
      const jobs = await management.query("select count(*)::int as total, coalesce(array_agg(distinct substring(command from 'https?://[a-zA-Z0-9._:-]+')) filter (where command ~ 'https?://'), array[]::text[]) as origins from cron.job");
      if (identity.ok && jobs.ok && identity.rows.length === 1 && jobs.rows.length === 1) {
        const identityRow = identity.rows[0] as { app_url?: unknown };
        const jobRow = jobs.rows[0] as { total?: unknown; origins?: unknown };
        installationAppUrl = typeof identityRow.app_url === "string" ? identityRow.app_url : null;
        cronOrigins = Array.isArray(jobRow.origins) && jobRow.origins.every((v) => typeof v === "string") ? jobRow.origins : null;
        cronJobCount = typeof jobRow.total === "number" ? jobRow.total : null;
      } else {
        destinationReadError = identity.error ?? jobs.error ?? "Leitura da identidade ou dos agendamentos incompleta.";
      }
    } else {
      destinationReadError = "Token de gestão ou projeto Supabase da instalação indisponível.";
    }
    const urlState = operationalUrlState({ registered: record.domain, deployed: deployedAppUrl, browser: browserAppUrl, installation: installationAppUrl, cronOrigins });
    domainItem.state = urlState.state;
    domainItem.detail = `${urlState.detail}${destinationReadError ? ` Não foi possível conferir a instalação: ${destinationReadError}` : ""}`;

    let domainAssigned = false;
    let domainVerified = false;
    if (url.ok && url.kind === "custom") {
      const domain = await deploy.inspectDomain(url.origin);
      domainAssigned = domain.ok && domain.assigned;
      domainVerified = domainAssigned && domain.verified;
      domainItem.detail += domain.ok
        ? ` Domínio ${domainVerified ? "verificado" : domainAssigned ? "atribuído, aguardando verificação" : "não atribuído"}.`
        : ` Não foi possível confirmar o domínio: ${domain.error ?? "erro desconhecido"}.`;
      if (!domainVerified) domainItem.state = "pending";
    }

    const meta = metaIntegrationState({
      envKeys: keys,
      redirectUri: metaRedirectUri,
      appUrl: record.domain,
      appType: "unitos",
    });
    if (domainItem.state !== "configured") {
      meta.state = "pending";
      meta.detail += " A sincronização completa do endereço da instalação ainda não foi comprovada.";
    }

    const items: IntegrationInspection[] = [
      domainItem,
      { id: "meta", state: meta.state, detail: meta.detail },
      {
        id: "resend",
        state: "pending" as const,
        detail:
          "Resend é configurado dentro da instalação, em Administração → Conexões. O estado efetivo é validado no próprio ambiente sem expor a chave.",
      },
      {
        id: "evolution",
        ...envIntegrationState({
          envKeys: keys,
          required: ["EVOLUTION_API_URL", "EVOLUTION_API_KEY"],
          label: "WhatsApp (Evolution)",
        }),
      },
      {
        id: "ai",
        // IA é BYOK por workspace (credenciais no banco da instalação), não por
        // variável de ambiente: aqui só informamos onde ela é configurada.
        state: "not_configured" as const,
        detail:
          "IA é configurada dentro da instalação, em Administração → IA, com as chaves da própria agência.",
      },
    ].map((i) => ({ id: i.id, state: i.state, detail: i.detail }) as IntegrationInspection);

    return {
      ok: true,
      reason: null,
      appUrl,
      deployedAppUrl,
      browserAppUrl,
      installationAppUrl,
      cronOrigins,
      cronJobCount,
      domainAssigned,
      domainVerified,
      metaRedirectUri,
      expectedMetaRedirectUri: meta.expectedRedirectUri ?? null,
      superAdminSetupUrl: appUrl && domainItem.state === "configured" && metaRedirectUri === metaRedirectUriFor(record.domain) ? `${appUrl}/setup` : null,
      items,
      checkedAt,
    };
  });
