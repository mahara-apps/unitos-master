import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Garante que exista um projeto ativo vinculado à pauta.
 * Chamado na aprovação interna da pauta. Idempotente.
 */
export async function ensurePlanProject(
  sb: SupabaseClient,
  args: {
    planId: string;
    brandId: string;
    clientId: string | null;
    title: string | null;
    userId: string | null;
  },
): Promise<{ projectId: string; created: boolean }> {
  const { data: existing } = await sb
    .from("projects")
    .select("id")
    .eq("monthly_plan_id", args.planId)
    .maybeSingle();
  const found = existing as unknown as { id: string } | null;
  if (found?.id) {
    await sb
      .from("monthly_plans")
      .update({ project_id: found.id } as never)
      .eq("id", args.planId)
      .is("project_id", null);
    return { projectId: found.id, created: false };
  }

  const now = new Date();
  const startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
  const dueDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0))
    .toISOString()
    .slice(0, 10);

  const baseTitle = (args.title ?? "").trim();
  const name = (baseTitle ? `Pauta — ${baseTitle}` : "Pauta mensal").slice(0, 120);

  const { data: created, error } = await sb
    .from("projects")
    .insert({
      brand_id: args.brandId,
      client_id: args.clientId,
      name,
      description: "Projeto criado automaticamente a partir da aprovação interna da pauta.",
      status: "active",
      color: "#8b5cf6",
      owner_id: args.userId,
      start_date: startDate,
      due_at: dueDate,
      monthly_plan_id: args.planId,
    } as never)
    .select("id")
    .single();
  if (error) throw error;
  const projectId = (created as unknown as { id: string }).id;

  await sb
    .from("monthly_plans")
    .update({ project_id: projectId } as never)
    .eq("id", args.planId);

  return { projectId, created: true };
}
