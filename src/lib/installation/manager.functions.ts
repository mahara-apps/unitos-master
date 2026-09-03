import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertSuperAdmin, resolveIsSuperAdmin } from "@/lib/super-admin";
import type { RpcClient } from "@/lib/access-guard";

import {
  MASTER_RELEASE_VERSION,
  PROVISION_STEPS,
  VALIDATE_STEPS,
  canStartOperation,
  healthAfterOperation,
  isInstallationStatus,
  isUpdateAvailable,
  runningStatusFor,
  statusAfterOperation,
  validateInstallationInput,
  type InstallationHealth,
  type InstallationOperationKind,
  type InstallationOperationStatus,
  type InstallationStatus,
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
  createdAt: string;
  updatedAt: string;
};

export type OperationDetail = {
  steps?: Array<{ id: string; label: string; script: string }>;
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
  startedAt: string;
  finishedAt: string | null;
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapOperation(row: any): InstallationOperationRecord {
  return {
    id: row.id,
    kind: row.kind as InstallationOperationKind,
    status: row.status as InstallationOperationStatus,
    summary: row.summary ?? null,
    detail: (row.detail ?? {}) as OperationDetail,
    startedAt: row.started_at,
    finishedAt: row.finished_at ?? null,
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
});

/**
 * Enfileira a operação. Nesta versão o fluxo está PREPARADO, não executado:
 * o MASTER registra a intenção, os passos e os scripts de `supabase/install/`
 * que serão rodados, e move a instalação para o estado em execução.
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
    if (!canStartOperation(kind, record.status)) {
      throw new Error(
        `A instalação está em “${record.status}” e não aceita esta operação agora.`,
      );
    }

    const steps = kind === "validate" ? VALIDATE_STEPS : PROVISION_STEPS;
    const nowIso = new Date().toISOString();

    const { data: op, error: opError } = await context.supabase
      .from("installation_operations")
      .insert({
        installation_id: data.id,
        kind,
        status: "pending",
        summary:
          kind === "validate"
            ? "Validação preparada — execute supabase/install/verify-installation.sql na instalação."
            : "Execução preparada — rode supabase/install/bootstrap.sh na instalação de destino.",
        detail: {
          steps: steps.map((s) => ({ id: s.id, label: s.label, script: s.script })),
          releaseVersion: MASTER_RELEASE_VERSION,
          executed: false,
        },
        actor_id: context.userId,
        started_at: nowIso,
      })
      .select("*")
      .single();
    if (opError) throw opError;

    const { data: updated, error: updateError } = await context.supabase
      .from("installations")
      .update({ status: runningStatusFor(kind), last_error: null })
      .eq("id", data.id)
      .select("*")
      .single();
    if (updateError) throw updateError;

    return { installation: mapInstallation(updated), operation: mapOperation(op) };
  });

const CompleteInput = z.object({
  operationId: z.string().uuid(),
  ok: z.boolean(),
  warnings: z.boolean().optional(),
  version: z.string().max(40).nullable().optional(),
  summary: z.string().max(500).optional(),
});

/** Registra o resultado da operação executada fora da aplicação. */
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

    const kind = op.kind as InstallationOperationKind;
    const outcome = {
      ok: data.ok,
      warnings: data.warnings ?? false,
      version: clean(data.version),
    };
    const status = statusAfterOperation(kind, outcome);
    const health = healthAfterOperation(outcome);
    const nowIso = new Date().toISOString();

    const { error: opError } = await context.supabase
      .from("installation_operations")
      .update({
        status: data.ok ? (outcome.warnings ? "success" : "success") : "failed",
        summary: data.summary ?? op.summary,
        detail: {
          ...((op.detail ?? {}) as OperationDetail),
          executed: true,
          warnings: outcome.warnings,
        },
        finished_at: nowIso,
      })
      .eq("id", data.operationId);
    if (opError) throw opError;

    const patch = {
      status,
      health,
      last_error: data.ok ? null : (data.summary ?? "Falha registrada na operação."),
      ...(outcome.version ? { current_version: outcome.version } : {}),
      ...(kind !== "validate" && data.ok ? { last_provisioned_at: nowIso } : {}),
      ...(kind === "validate" ? { last_validated_at: nowIso } : {}),
    };

    const { data: updated, error: updateError } = await context.supabase
      .from("installations")
      .update(patch)
      .eq("id", op.installation_id)
      .select("*")
      .single();
    if (updateError) throw updateError;

    return mapInstallation(updated);
  });
