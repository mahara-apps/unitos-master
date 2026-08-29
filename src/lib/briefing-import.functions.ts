import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Server functions da camada de importação de briefing.
 * Toda escrita passa por `briefing-import.server.ts`; o escopo por
 * brand/cliente é garantido pela RLS das tabelas (`client_in_scope`).
 */

const Scope = z.object({
  brandId: z.string().uuid(),
  clientId: z.string().uuid(),
});

const RunScope = Scope.extend({ runId: z.string().uuid() });

export const listBriefingImportRuns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Scope.extend({ limit: z.number().int().min(1).max(100).optional() }).parse(i))
  .handler(async ({ data, context }) => {
    const { listImportRuns } = await import("@/lib/briefing-import.server");
    return listImportRuns(context.supabase, {
      brandId: data.brandId,
      clientId: data.clientId,
      limit: data.limit,
    });
  });

export const getBriefingImportRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => RunScope.parse(i))
  .handler(async ({ data, context }) => {
    const { getImportRun, listImportChanges } = await import("@/lib/briefing-import.server");
    const run = await getImportRun(context.supabase, data);
    if (!run) return { run: null, changes: [] };
    const changes = await listImportChanges(context.supabase, data);
    return { run, changes };
  });

export const decideBriefingImportChanges = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    RunScope.extend({
      decisions: z
        .array(
          z.object({
            field: z.string().min(1).max(60),
            decision: z.enum(["accepted", "rejected"]),
          }),
        )
        .min(1),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { decideImportChanges } = await import("@/lib/briefing-import.server");
    return decideImportChanges(context.supabase, { ...data, userId: context.userId });
  });

export const applyBriefingImportRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    RunScope.extend({
      acceptFields: z.array(z.string().min(1).max(60)).optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { applyImportRun } = await import("@/lib/briefing-import.server");
    return applyImportRun(context.supabase, { ...data, userId: context.userId });
  });

export const retryBriefingImportRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => RunScope.parse(i))
  .handler(async ({ data, context }) => {
    const { retryImportRun } = await import("@/lib/briefing-import.server");
    return retryImportRun(context.supabase, data);
  });
