/**
 * Ações internas sobre a AGENDA proposta (calendário da operação).
 * RLS aplica-se como o usuário autenticado — nenhuma escrita privilegiada aqui.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  internalApproveSchedule,
  updateProposedSlot,
  clearProposedSlot,
  type ScheduleActionResult,
} from "@/lib/schedule-approval.server";

const scope = z.object({ brandId: z.string().uuid(), clientId: z.string().uuid() });

export const approveScheduleFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    scope.extend({ postIds: z.array(z.string().uuid()).min(1).max(200) }).parse(i),
  )
  .handler(
    ({ data, context }): Promise<ScheduleActionResult> =>
      internalApproveSchedule(context.supabase, {
        brandId: data.brandId,
        clientId: data.clientId,
        postIds: data.postIds,
        userId: context.userId,
      }),
  );

export const updateScheduleSlotFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    scope.extend({ postId: z.string().uuid(), proposedAt: z.string().datetime() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await updateProposedSlot(context.supabase, {
      brandId: data.brandId,
      clientId: data.clientId,
      postId: data.postId,
      proposedAt: data.proposedAt,
    });
    return { ok: true as const };
  });

export const clearScheduleSlotFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => scope.extend({ postId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await clearProposedSlot(context.supabase, {
      brandId: data.brandId,
      clientId: data.clientId,
      postId: data.postId,
    });
    return { ok: true as const };
  });
