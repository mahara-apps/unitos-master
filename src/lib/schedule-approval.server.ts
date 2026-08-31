/**
 * Aprovação da AGENDA de publicação (distinta da aprovação de conteúdo).
 *
 * Fluxo: proposed → client_pending (aprovada internamente) → reserved (cliente
 * aprovou) | client_changes (cliente pediu outra data).
 *
 * Aprovar agenda RESERVA a data — nunca publica e nunca agenda na fila real.
 * A publicação continua sendo responsabilidade do fluxo de agendamento.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type ScheduleStatus =
  | "none"
  | "proposed"
  | "internal_approved"
  | "client_pending"
  | "client_changes"
  | "reserved";

export type ScheduleActionResult = { updated: number; skipped: number };

const INTERNAL_APPROVABLE: ScheduleStatus[] = ["proposed", "client_changes"];

/** Aprovação interna: valida a proposta e a envia para o cliente decidir. */
export async function internalApproveSchedule(
  sb: SupabaseClient,
  args: { brandId: string; clientId: string; postIds: string[]; userId: string },
): Promise<ScheduleActionResult> {
  if (args.postIds.length === 0) return { updated: 0, skipped: 0 };
  const { data, error } = await sb
    .from("posts")
    .update({
      schedule_status: "client_pending",
      schedule_approved_at: new Date().toISOString(),
      schedule_approved_by: args.userId,
    } as never)
    .in("id", args.postIds)
    .eq("brand_id", args.brandId)
    .eq("client_id", args.clientId)
    .not("proposed_at", "is", null)
    .in("schedule_status", INTERNAL_APPROVABLE)
    .select("id");
  if (error) throw new Error(error.message);
  const updated = (data ?? []).length;
  return { updated, skipped: args.postIds.length - updated };
}

/** Edição do slot proposto: volta ao início do fluxo de aprovação. */
export async function updateProposedSlot(
  sb: SupabaseClient,
  args: { brandId: string; clientId: string; postId: string; proposedAt: string },
): Promise<void> {
  const { error } = await sb
    .from("posts")
    .update({
      proposed_at: args.proposedAt,
      schedule_status: "proposed",
      schedule_approved_at: null,
      schedule_approved_by: null,
      schedule_client_decision_at: null,
      schedule_client_comment: null,
    } as never)
    .eq("id", args.postId)
    .eq("brand_id", args.brandId)
    .eq("client_id", args.clientId);
  if (error) throw new Error(error.message);
}

/** Remove a proposta de agenda (a peça continua existindo, sem data). */
export async function clearProposedSlot(
  sb: SupabaseClient,
  args: { brandId: string; clientId: string; postId: string },
): Promise<void> {
  const { error } = await sb
    .from("posts")
    .update({
      proposed_at: null,
      schedule_status: "none",
      schedule_approved_at: null,
      schedule_approved_by: null,
      schedule_client_decision_at: null,
      schedule_client_comment: null,
    } as never)
    .eq("id", args.postId)
    .eq("brand_id", args.brandId)
    .eq("client_id", args.clientId);
  if (error) throw new Error(error.message);
}

/** Decisão do cliente (portal): reserva a data ou pede alteração. */
export async function clientDecideSchedule(
  sb: SupabaseClient,
  args: {
    brandId: string;
    clientId: string;
    postIds: string[];
    decision: "approve" | "changes";
    comment?: string;
  },
): Promise<ScheduleActionResult> {
  if (args.postIds.length === 0) return { updated: 0, skipped: 0 };
  const { data, error } = await sb
    .from("posts")
    .update({
      schedule_status: args.decision === "approve" ? "reserved" : "client_changes",
      schedule_client_decision_at: new Date().toISOString(),
      schedule_client_comment: (args.comment ?? "").trim().slice(0, 1000) || null,
    } as never)
    .in("id", args.postIds)
    .eq("brand_id", args.brandId)
    .eq("client_id", args.clientId)
    .not("proposed_at", "is", null)
    .in("schedule_status", ["client_pending", "internal_approved"])
    .select("id");
  if (error) throw new Error(error.message);
  const updated = (data ?? []).length;
  return { updated, skipped: args.postIds.length - updated };
}

export type ProposedScheduleItem = {
  postId: string;
  title: string;
  proposedAt: string;
  scheduleStatus: ScheduleStatus;
  format: string | null;
  channels: string[];
  rationale: string | null;
  clientComment: string | null;
};

/** Agenda proposta/reservada de um cliente numa janela — leitura para o portal. */
export async function listScheduleForClient(
  sb: SupabaseClient,
  args: { brandId: string; clientId: string; from: string; to: string },
): Promise<ProposedScheduleItem[]> {
  const { data, error } = await sb
    .from("posts")
    .select(
      "id,title,format,channels,proposed_at,schedule_status,schedule_client_comment,internal_briefing",
    )
    .eq("brand_id", args.brandId)
    .eq("client_id", args.clientId)
    .is("deleted_at", null)
    .not("proposed_at", "is", null)
    .gte("proposed_at", args.from)
    .lte("proposed_at", args.to)
    .in("schedule_status", ["client_pending", "internal_approved", "client_changes", "reserved"])
    .order("proposed_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => {
    const row = r as unknown as Record<string, unknown>;
    return {
      postId: row["id"] as string,
      title: (row["title"] as string | null) ?? "Publicação",
      proposedAt: row["proposed_at"] as string,
      scheduleStatus: ((row["schedule_status"] as string | null) ?? "none") as ScheduleStatus,
      format: (row["format"] as string | null) ?? null,
      channels: ((row["channels"] as string[] | null) ?? []) as string[],
      rationale: (row["internal_briefing"] as string | null) ?? null,
      clientComment: (row["schedule_client_comment"] as string | null) ?? null,
    };
  });
}
