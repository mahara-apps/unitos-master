import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PublicPlanDecisionResult, PublicPlanResolve } from "@/lib/monthly-plan-client.types";

export type {
  PublicPlanDecisionResult,
  PublicPlanResolve,
  PublicPlanTopic,
  PublicTopicClientStatus,
} from "@/lib/monthly-plan-client.types";

/**
 * Link público da Pauta mensal (`/pauta/$planId?token=…`) — mantido como
 * convite/fallback compatível. O token é a credencial e é sempre validado
 * (existência, revogação, expiração) antes de qualquer leitura ou escrita.
 *
 * Regras de aprovação e escrita vivem em `monthly-plan-decision.server.ts`,
 * as mesmas usadas pelo portal autenticado — não há lógica duplicada aqui.
 */

async function requireToken(sb: SupabaseClient, token: string) {
  const { data, error } = await sb
    .from("monthly_plan_tokens")
    .select("id, monthly_plan_id, client_id, brand_id, expires_at, revoked_at")
    .eq("token", token)
    .maybeSingle();
  if (error) throw new Error("token_lookup_failed");
  if (!data) throw new Error("invalid_token");
  const row = data as {
    id: string;
    monthly_plan_id: string;
    client_id: string;
    brand_id: string;
    expires_at: string | null;
    revoked_at: string | null;
  };
  if (row.revoked_at) throw new Error("token_revoked");
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
    throw new Error("token_expired");
  }
  return row;
}

const tokenIn = z.object({ token: z.string().min(8).max(80) });

export const resolveMonthlyPlanPublic = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => tokenIn.parse(i))
  .handler(async ({ data }): Promise<PublicPlanResolve> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadPlanForClient } = await import("@/lib/monthly-plan-decision.server");
    const sb = supabaseAdmin as unknown as SupabaseClient;
    const session = await requireToken(sb, data.token);
    return loadPlanForClient(sb, session.monthly_plan_id, session.client_id);
  });

const decideIn = z.object({
  token: z.string().min(8).max(80),
  decision: z.enum(["approve", "reject", "changes", "per_item"]),
  feedback: z.string().trim().max(2000).optional().default(""),
  items: z
    .array(
      z.object({
        topicId: z.string().uuid(),
        decision: z.enum(["approved", "rejected", "changes"]),
        comment: z.string().trim().max(1000).optional().default(""),
      }),
    )
    .max(200)
    .optional(),
});

export const decideMonthlyPlanPublic = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => decideIn.parse(i))
  .handler(async ({ data }): Promise<PublicPlanDecisionResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { decidePlanAsClient } = await import("@/lib/monthly-plan-decision.server");
    const sb = supabaseAdmin as unknown as SupabaseClient;
    const session = await requireToken(sb, data.token);
    return decidePlanAsClient(sb, {
      planId: session.monthly_plan_id,
      clientId: session.client_id,
      brandId: session.brand_id,
      decision: data.decision,
      feedback: data.feedback,
      items: data.items,
    });
  });
