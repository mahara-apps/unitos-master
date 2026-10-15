// Leitura/gravação das regras por cliente. Só Owner/Admin (e Super Admin)
// podem alterar — o banco também garante isso por trigger.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertBrandAdmin } from "@/lib/access-guard";
import {
  APPROVAL_STAGES,
  SCOPE_FRONTS,
  type ApprovalPolicy,
  type ScopePolicy,
} from "@/lib/client-policy";

const approvalSchema = z.object({
  plan: z.enum(["client", "internal"]),
  content: z.enum(["client", "internal"]),
  schedule: z.enum(["client", "internal"]),
});

const scopeSchema = z.object({
  mode: z.enum(["warn", "block"]),
  applies: z.array(z.enum(SCOPE_FRONTS)).max(SCOPE_FRONTS.length),
});

export type ClientPolicies = {
  approval: ApprovalPolicy;
  scope: ScopePolicy;
  /** Pendências que ficariam órfãs se uma etapa for dispensada agora. */
  pending: { plan: number; content: number; schedule: number };
  /** Padrão do workspace e se o cliente segue esse padrão. */
  workspace: { approval: ApprovalPolicy; scope: ScopePolicy };
  inherits: { approval: boolean; scope: boolean };
};

type Counts = { plan: number; content: number; schedule: number };
type Ctx = { supabase: any; userId: string }; // eslint-disable-line @typescript-eslint/no-explicit-any

const waivedStages = (a: ApprovalPolicy) => APPROVAL_STAGES.filter((s) => a[s] === "internal");

const hasKeys = (v: unknown) => !!v && typeof v === "object" && Object.keys(v as object).length > 0;

async function countPending(ctx: Ctx, brandId: string, clientIds: string[]): Promise<Counts> {
  if (clientIds.length === 0) return { plan: 0, content: 0, schedule: 0 };
  const [plans, posts, schedule] = await Promise.all([
    ctx.supabase
      .from("monthly_plans")
      .select("id", { count: "exact", head: true })
      .eq("brand_id", brandId)
      .in("client_id", clientIds)
      .eq("status", "pending_client"),
    ctx.supabase
      .from("posts")
      .select("id", { count: "exact", head: true })
      .eq("brand_id", brandId)
      .in("client_id", clientIds)
      .is("deleted_at", null)
      .eq("visible_in_portal", true)
      .eq("review_status", "pending"),
    ctx.supabase
      .from("posts")
      .select("id", { count: "exact", head: true })
      .eq("brand_id", brandId)
      .in("client_id", clientIds)
      .is("deleted_at", null)
      .eq("schedule_status", "client_pending"),
  ]);
  for (const r of [plans, posts, schedule]) if (r.error) throw r.error;
  return { plan: plans.count ?? 0, content: posts.count ?? 0, schedule: schedule.count ?? 0 };
}

/** Libera pelo caminho oficial o que aguardava o cliente nas etapas dispensadas. */
async function releasePending(
  ctx: Ctx,
  brandId: string,
  clientIds: string[],
  waived: string[],
): Promise<Counts> {
  const released: Counts = { plan: 0, content: 0, schedule: 0 };
  if (clientIds.length === 0) return released;
  const now = new Date().toISOString();
  if (waived.includes("plan")) {
    const { data: rows, error } = await ctx.supabase
      .from("monthly_plans")
      .update({
        status: "approved",
        client_decision_at: now,
        client_decision_mode: "internal_waived",
      } as never)
      .eq("brand_id", brandId)
      .in("client_id", clientIds)
      .eq("status", "pending_client")
      .select("id, client_id");
    if (error) throw error;
    released.plan = (rows ?? []).length;
    const { materializePlanToKanban } = await import("@/lib/monthly-plan-kanban.server");
    for (const row of (rows ?? []) as Array<{ id: string; client_id: string }>) {
      try {
        await materializePlanToKanban(ctx.supabase, {
          planId: row.id,
          brandId,
          clientId: row.client_id,
          userId: ctx.userId,
        });
      } catch {
        // A equipe reprocessa na tela da pauta; não invalida a mudança de regra.
      }
    }
  }
  if (waived.includes("content")) {
    const { data: rows, error } = await ctx.supabase
      .from("posts")
      .update({ review_status: "approved" } as never)
      .eq("brand_id", brandId)
      .in("client_id", clientIds)
      .is("deleted_at", null)
      .eq("visible_in_portal", true)
      .eq("review_status", "pending")
      .select("id");
    if (error) throw error;
    released.content = (rows ?? []).length;
  }
  if (waived.includes("schedule")) {
    const { data: rows, error } = await ctx.supabase
      .from("posts")
      .update({ schedule_status: "reserved", schedule_client_decision_at: now } as never)
      .eq("brand_id", brandId)
      .in("client_id", clientIds)
      .is("deleted_at", null)
      .eq("schedule_status", "client_pending")
      .select("id");
    if (error) throw error;
    released.schedule = (rows ?? []).length;
  }
  return released;
}

export const getClientPoliciesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ brandId: z.string().uuid(), clientId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }): Promise<ClientPolicies> => {
    const { resolveClientApprovalPolicy, resolveClientScopePolicy } =
      await import("@/lib/client-policy.server");
    const [approval, scope, workspaceApproval, workspaceScope, own, pending] = await Promise.all([
      resolveClientApprovalPolicy(context.supabase, data),
      resolveClientScopePolicy(context.supabase, data),
      resolveClientApprovalPolicy(context.supabase, { brandId: data.brandId }),
      resolveClientScopePolicy(context.supabase, { brandId: data.brandId }),
      context.supabase
        .from("clients")
        .select("approval_policy, scope_policy")
        .eq("id", data.clientId)
        .eq("brand_id", data.brandId)
        .maybeSingle(),
      countPending(context, data.brandId, [data.clientId]),
    ]);
    const row = (own.data ?? {}) as { approval_policy?: unknown; scope_policy?: unknown };
    return {
      approval,
      scope,
      pending,
      workspace: { approval: workspaceApproval, scope: workspaceScope },
      inherits: { approval: !hasKeys(row.approval_policy), scope: !hasKeys(row.scope_policy) },
    };
  });

export type WorkspacePolicies = {
  approval: ApprovalPolicy;
  scope: ScopePolicy;
  clients: { total: number; inheritingApproval: number; inheritingScope: number };
  /** Pendências dos clientes que seguem o padrão. */
  pending: Counts;
};

async function inheritingClients(ctx: Ctx, brandId: string) {
  const { data, error } = await ctx.supabase
    .from("clients")
    .select("id, approval_policy, scope_policy")
    .eq("brand_id", brandId)
    .limit(1000);
  if (error) throw error;
  const rows = (data ?? []) as Array<{ id: string; approval_policy: unknown; scope_policy: unknown }>;
  return {
    total: rows.length,
    approval: rows.filter((r) => !hasKeys(r.approval_policy)).map((r) => r.id),
    scope: rows.filter((r) => !hasKeys(r.scope_policy)).map((r) => r.id),
  };
}

export const getWorkspacePoliciesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ brandId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<WorkspacePolicies> => {
    const { resolveClientApprovalPolicy, resolveClientScopePolicy } =
      await import("@/lib/client-policy.server");
    const [approval, scope, inh] = await Promise.all([
      resolveClientApprovalPolicy(context.supabase, { brandId: data.brandId }),
      resolveClientScopePolicy(context.supabase, { brandId: data.brandId }),
      inheritingClients(context, data.brandId),
    ]);
    return {
      approval,
      scope,
      clients: {
        total: inh.total,
        inheritingApproval: inh.approval.length,
        inheritingScope: inh.scope.length,
      },
      pending: await countPending(context, data.brandId, inh.approval),
    };
  });

export const setWorkspacePoliciesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        brandId: z.string().uuid(),
        approval: approvalSchema,
        scope: scopeSchema,
        pendingAction: z.enum(["keep", "release"]).default("keep"),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertBrandAdmin(context.supabase, context.userId, data.brandId);
    const { data: rows, error } = await context.supabase
      .from("brands")
      .update({ approval_policy: data.approval, scope_policy: data.scope } as never)
      .eq("id", data.brandId)
      .select("id");
    if (error) throw error;
    if (!rows || rows.length === 0) throw new Error("Forbidden: workspace fora do seu escopo");
    // Só clientes que seguem o padrão são afetados; exceções ficam intactas.
    const released =
      data.pendingAction === "release"
        ? await releasePending(
            context,
            data.brandId,
            (await inheritingClients(context, data.brandId)).approval,
            waivedStages(data.approval),
          )
        : { plan: 0, content: 0, schedule: 0 };
    return { ok: true as const, released };
  });

export const setClientPoliciesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        brandId: z.string().uuid(),
        clientId: z.string().uuid(),
        /** `null` = voltar a seguir o padrão do workspace. */
        approval: approvalSchema.nullable().optional(),
        scope: scopeSchema.nullable().optional(),
        /** O que fazer com o que já está aguardando o cliente. */
        pendingAction: z.enum(["keep", "release"]).default("keep"),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertBrandAdmin(context.supabase, context.userId, data.brandId);

    const patch: Record<string, unknown> = {};
    if (data.approval !== undefined) patch["approval_policy"] = data.approval ?? {};
    if (data.scope !== undefined) patch["scope_policy"] = data.scope ?? {};
    if (Object.keys(patch).length > 0) {
      const { error } = await context.supabase
        .from("clients")
        .update(patch as never)
        .eq("id", data.clientId)
        .eq("brand_id", data.brandId);
      if (error) throw error;
    }

    const released =
      data.approval && data.pendingAction === "release"
        ? await releasePending(context, data.brandId, [data.clientId], waivedStages(data.approval))
        : { plan: 0, content: 0, schedule: 0 };

    return { ok: true as const, released };
  });
