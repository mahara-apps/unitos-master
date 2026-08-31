/**
 * Agenda de publicação no Portal do Cliente (login e token).
 * O cliente vê as datas propostas e pode reservar ou pedir alteração.
 * Aprovar reserva a data — nunca publica.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ProposedScheduleItem, ScheduleActionResult } from "@/lib/schedule-approval.server";

const tokenIn = z.object({ token: z.string().min(8) });
const scopeIn = z.object({ clientId: z.string().uuid() });
const windowIn = { from: z.string(), to: z.string() };
const decisionIn = {
  postIds: z.array(z.string().uuid()).min(1).max(200),
  decision: z.enum(["approve", "changes"]),
  comment: z.string().trim().max(1000).optional().default(""),
};

export const listPortalSessionScheduleFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => scopeIn.extend(windowIn).parse(i))
  .handler(async ({ context, data }): Promise<ProposedScheduleItem[]> => {
    const { resolveSessionScope, scopedAdmin } = await import("@/lib/portal-scope.server");
    const { listScheduleForClient } = await import("@/lib/schedule-approval.server");
    const scope = await resolveSessionScope(context.supabase, data.clientId);
    return listScheduleForClient(await scopedAdmin(), { ...scope, from: data.from, to: data.to });
  });

export const decidePortalSessionScheduleFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => scopeIn.extend(decisionIn).parse(i))
  .handler(async ({ context, data }): Promise<ScheduleActionResult> => {
    const { resolveSessionScope, scopedAdmin } = await import("@/lib/portal-scope.server");
    const { clientDecideSchedule } = await import("@/lib/schedule-approval.server");
    const scope = await resolveSessionScope(context.supabase, data.clientId);
    return clientDecideSchedule(await scopedAdmin(), {
      ...scope,
      postIds: data.postIds,
      decision: data.decision,
      comment: data.comment,
    });
  });

export const listPortalScheduleFn = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => tokenIn.extend(windowIn).parse(i))
  .handler(async ({ data }): Promise<ProposedScheduleItem[]> => {
    const { resolveTokenScope, scopedAdmin } = await import("@/lib/portal-scope.server");
    const { listScheduleForClient } = await import("@/lib/schedule-approval.server");
    const scope = await resolveTokenScope(data.token);
    return listScheduleForClient(await scopedAdmin(), { ...scope, from: data.from, to: data.to });
  });

export const decidePortalScheduleFn = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => tokenIn.extend(decisionIn).parse(i))
  .handler(async ({ data }): Promise<ScheduleActionResult> => {
    const { resolveTokenScope, scopedAdmin } = await import("@/lib/portal-scope.server");
    const { clientDecideSchedule } = await import("@/lib/schedule-approval.server");
    const scope = await resolveTokenScope(data.token);
    return clientDecideSchedule(await scopedAdmin(), {
      ...scope,
      postIds: data.postIds,
      decision: data.decision,
      comment: data.comment,
    });
  });
