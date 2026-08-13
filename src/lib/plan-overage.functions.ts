import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PLAN_CHANNELS } from "@/lib/monthly-plan-fields";
import { currentPeriodMonth } from "@/lib/plan-overage.server";

export type OverageStatus = "pending" | "approved" | "rejected";

export type OverageRequestRow = {
  id: string;
  brand_id: string;
  client_id: string;
  client_name: string | null;
  channel: string;
  period_month: string;
  quota: number;
  requested: number;
  overage: number;
  justification: string | null;
  status: OverageStatus;
  requested_by: string | null;
  requester_name: string | null;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
};

/* ---------- Solicitar excedente ---------- */

export const requestPlanOverageFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        brandId: z.string().uuid(),
        clientId: z.string().uuid(),
        justification: z.string().trim().max(1000).optional().default(""),
        items: z
          .array(
            z.object({
              channel: z.enum(PLAN_CHANNELS),
              quota: z.number().int().min(0),
              requested: z.number().int().min(1),
              overage: z.number().int().min(1),
            }),
          )
          .min(1),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const period = currentPeriodMonth();
    const rows = data.items.map((it) => ({
      brand_id: data.brandId,
      client_id: data.clientId,
      channel: it.channel,
      period_month: period,
      quota: it.quota,
      requested: it.requested,
      overage: it.overage,
      justification: data.justification || null,
      status: "pending",
      requested_by: context.userId,
    }));
    const { error } = await context.supabase
      .from("plan_overage_requests" as never)
      .insert(rows as never);
    if (error) throw error;
    return { ok: true as const, count: rows.length };
  });

/* ---------- Listagem (gestor) ---------- */

export const listPlanOverageRequestsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        brandId: z.string().uuid(),
        clientId: z.string().uuid().optional(),
        status: z.enum(["pending", "approved", "rejected", "all"]).optional().default("all"),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<OverageRequestRow[]> => {
    let q = context.supabase
      .from("plan_overage_requests" as never)
      .select("*")
      .eq("brand_id", data.brandId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.clientId) q = q.eq("client_id", data.clientId);
    if (data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw error;
    const list = (rows ?? []) as unknown as OverageRequestRow[];
    if (!list.length) return [];

    const clientIds = Array.from(new Set(list.map((r) => r.client_id)));
    const userIds = Array.from(
      new Set(list.map((r) => r.requested_by).filter((v): v is string => !!v)),
    );
    const [{ data: clients }, { data: profiles }] = await Promise.all([
      context.supabase.from("clients").select("id, name").in("id", clientIds),
      userIds.length
        ? context.supabase.from("user_profiles").select("user_id, full_name").in("user_id", userIds)
        : Promise.resolve({ data: [] as Array<{ user_id: string; full_name: string | null }> }),
    ]);
    const cMap = new Map(
      ((clients ?? []) as Array<{ id: string; name: string | null }>).map((c) => [c.id, c.name]),
    );
    const uMap = new Map(
      ((profiles ?? []) as Array<{ user_id: string; full_name: string | null }>).map((p) => [
        p.user_id,
        p.full_name,
      ]),
    );
    return list.map((r) => ({
      ...r,
      client_name: cMap.get(r.client_id) ?? null,
      requester_name: r.requested_by ? (uMap.get(r.requested_by) ?? null) : null,
    }));
  });

/* ---------- Decisão (autorizar / recusar) ---------- */

export const decidePlanOverageFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        decision: z.enum(["approved", "rejected"]),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("plan_overage_requests" as never)
      .update({
        status: data.decision,
        decided_by: context.userId,
        decided_at: new Date().toISOString(),
      } as never)
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true as const };
  });
