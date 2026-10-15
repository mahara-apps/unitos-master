import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AiCredentialAuditRow = {
  id: string;
  provider: string;
  target: "key" | "panel";
  op: string;
  masked_last4: string | null;
  connected_before: boolean | null;
  connected_after: boolean | null;
  actor_id: string | null;
  actor_name: string | null;
  source: string;
  created_at: string;
};

/** Histórico de chaves de IA do workspace. Leitura limitada por RLS (Owner/Admin/Super Admin). */
export const listAiCredentialAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ brandId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<AiCredentialAuditRow[]> => {
    const { data: rows, error } = await (context.supabase as never as {
      from: (t: string) => any;
    })
      .from("ai_credential_audit")
      .select("id, provider, target, op, masked_last4, connected_before, connected_after, actor_id, source, created_at")
      .eq("brand_id", data.brandId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    const list = (rows ?? []) as Omit<AiCredentialAuditRow, "actor_name">[];
    const ids = [...new Set(list.map((r) => r.actor_id).filter(Boolean))] as string[];
    const names = new Map<string, string>();
    if (ids.length) {
      const { data: profiles } = await context.supabase
        .from("user_profiles")
        .select("id, full_name, email")
        .in("id", ids);
      for (const p of (profiles ?? []) as Array<{ id: string; full_name?: string | null; email?: string | null }>)
        names.set(p.id, p.full_name || p.email || p.id.slice(0, 8));
    }
    return list.map((r) => ({ ...r, actor_name: r.actor_id ? (names.get(r.actor_id) ?? null) : null }));
  });
