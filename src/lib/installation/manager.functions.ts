import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertSuperAdmin, resolveIsSuperAdmin } from "@/lib/super-admin";
import type { RpcClient } from "@/lib/access-guard";

import {
  INSTALLATION_STATUS_LABEL,
  MASTER_RELEASE_VERSION,
  PROVISION_STEPS,
  VALIDATE_STEPS,
  assertOperationTarget,
  buildRunCommand,
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
  status: InstallationStatus;
  health: InstallationHealth;
  currentVersion: string | null;
  availableVersion: string;
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
  executed?: boolean;
  warnings?: boolean;
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
  startedAt: string;
  finishedAt: string | null;
  lastReportAt: string | null;
};

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapInstallation(row: any): InstallationRecord {
  const status: InstallationStatus = isInstallationStatus(row.status) ? row.status : "preparing";
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
    status,
    health: (row.health ?? "unknown") as InstallationHealth,
    currentVersion: row.current_version ?? null,
    availableVersion: row.available_version ?? MASTER_RELEASE_VERSION,
    updateAvailable: isUpdateAvailable(
      row.current_version,
      row.available_version ?? MASTER_RELEASE_VERSION,
    ),
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
      state: s.state === "running" || s.state === "done" || s.state === "error" ? s.state : "pending",
      detail: typeof s.detail === "string" ? s.detail : null,
    }))
    .filter((s) => s.id);
}

function mapOperation(row: any): InstallationOperationRecord {
  const steps = readSteps(row.steps);
  return {
    id: row.id,
    kind: row.kind as InstallationOperationKind,
    status: row.status as InstallationOperationStatus,
    summary: row.summary ?? null,
    detail: (row.detail ?? {}) as OperationDetail,
    steps,
    progress: stepsProgress(steps),
    errorKind: row.error_kind ?? null,
    startedAt: row.started_at,
    finishedAt: row.finished_at ?? null,
    lastReportAt: row.last_report_at ?? null,
  };
}


async function guard(context: { supabase: unknown; userId: string }) {
  const { assertMasterInstallation } = await import("./manager.server");
  assertMasterInstallation();
  await assertSuperAdmin(context.supabase as unknown as RpcClient, context.userId);
}

/** Disponibilidade do módulo — usado pela UI para esconder a área. */
export const getInstallationManagerAccessFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { detectMaster } = await import("./manager.server");
    const isMaster = detectMaster();
    const isSuperAdmin = await resolveIsSuperAdmin(
      context.supabase as unknown as RpcClient,
      context.userId,
    ).catch(() => false);
    return {
      isMaster,
      isSuperAdmin,
      available: isMaster && isSuperAdmin,
      releaseVersion: MASTER_RELEASE_VERSION,
    };
  });

export const listInstallationsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await guard(context);
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

export const createInstallationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpsertInput.parse(input))
  .handler(async ({ data, context }) => {
    await guard(context);

    const validation = validateInstallationInput(data);
    if (!validation.ok) throw new Error(validation.error);

    const insert = {
      name: data.name.trim(),
      slug: validation.slug,
      domain: clean(data.domain),
      supabase_url: clean(data.supabaseUrl),
      supabase_project_ref: clean(data.supabaseProjectRef),
      git_repo_url: clean(data.gitRepoUrl),
      deploy_project: clean(data.deployProject),
      notes: clean(data.notes),
      status: "preparing" as const,
      health: "unknown" as const,
      available_version: MASTER_RELEASE_VERSION,
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

    await context.supabase.from("installation_operations").insert({
      installation_id: row.id,
      kind: "register",
      status: "success",
      summary: "Instalação cadastrada — apenas metadados, nenhum segredo armazenado.",
      detail: { releaseVersion: MASTER_RELEASE_VERSION },
      actor_id: context.userId,
      finished_at: new Date().toISOString(),
    });

    return mapInstallation(row);
  });

export const updateInstallationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpsertInput.extend({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await guard(context);
    const validation = validateInstallationInput(data);
    if (!validation.ok) throw new Error(validation.error);

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
    return {
      installation: mapInstallation(row),
      operations: (ops.data ?? []).map(mapOperation),
      provisionSteps: PROVISION_STEPS,
      validateSteps: VALIDATE_STEPS,
    };
  });

export const deleteInstallationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await guard(context);
    const { error } = await context.supabase.from("installations").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true as const };
  });

const StartInput = z.object({
  id: z.string().uuid(),
  kind: z.enum(["provision", "validate", "update"]),
  /** Confirmação explícita exigida para atualizar uma instalação. */
  confirm: z.boolean().optional(),
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
    await guard(context);

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

    if (kind === "update") {
      if (!isUpdateAvailable(record.currentVersion, record.availableVersion)) {
        throw new Error("A instalação já está na versão do MASTER — nada a atualizar.");
      }
      if (!data.confirm) throw new Error(updateSummary(record.currentVersion, record.availableVersion));
    }

    if (!canStartOperation(kind, record.status)) {
      throw new Error(
        `A instalação está em “${INSTALLATION_STATUS_LABEL[record.status]}” e não aceita esta operação agora.`,
      );
    }

    // Trava: no máximo uma operação viva por instalação (índice único no banco).
    const { data: active } = await context.supabase
      .from("installation_operations")
      .select("id")
      .eq("installation_id", data.id)
      .in("status", ["pending", "running"])
      .maybeSingle();
    if (active) throw new Error("Já existe uma operação em andamento nesta instalação.");

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
      process.env["PUBLIC_APP_URL"] ?? process.env["VITE_PUBLIC_APP_URL"] ?? "https://unitos-master.lovable.app";

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
});

/** Registro manual do resultado (fallback quando o script não reporta). */
export const completeInstallationOperationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CompleteInput.parse(input))
  .handler(async ({ data, context }) => {
    await guard(context);

    const { data: op, error } = await context.supabase
      .from("installation_operations")
      .select("*")
      .eq("id", data.operationId)
      .maybeSingle();
    if (error) throw error;
    if (!op) throw new Error("Operação não encontrada.");

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
  .inputValidator((input: unknown) => z.object({ operationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await guard(context);
    const { data: op, error } = await context.supabase
      .from("installation_operations")
      .select("*")
      .eq("id", data.operationId)
      .maybeSingle();
    if (error) throw error;
    if (!op) throw new Error("Operação não encontrada.");

    const { finalizeOperation } = await import("./runner.server");
    await finalizeOperation(context.supabase as never, op as never, {
      ok: false,
      summary: "Operação cancelada pelo Super Admin. Resultado parcial preservado.",
      errorKind: "cancelada",
    });
    return { ok: true as const };
  });

/** Reavalia a saúde da instalação com probes reais (sem credenciais do destino). */
export const refreshInstallationHealthFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await guard(context);
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

