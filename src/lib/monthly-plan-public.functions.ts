import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Rotas públicas da Pauta mensal — o cliente acessa via link com token e
 * aprova, rejeita ou pede ajustes (na pauta inteira ou item por item). Não há
 * sessão: o token é a credencial e é sempre validado (existência, revogação e
 * expiração) antes de qualquer leitura ou escrita. O cliente privilegiado é
 * carregado dentro do handler.
 */

export type PublicTopicClientStatus = "pending" | "approved" | "rejected" | "changes";

export type PublicPlanTopic = {
  id: string;
  topic_title: string;
  channel: string | null;
  content_format: string | null;
  angle: string | null;
  target_audience: string | null;
  rationale: string | null;
  client_status: PublicTopicClientStatus;
  client_comment: string | null;
  position: number;
};

export type PublicPlanResolve = {
  plan: {
    id: string;
    title: string;
    description: string | null;
    objectives: string | null;
    status: string;
    client_decision_at: string | null;
    client_feedback: string | null;
    client_decision_mode: string | null;
    created_at: string;
  };
  client: { id: string; name: string };
  topics: PublicPlanTopic[];
};

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

const TOPIC_SELECT =
  "id, topic_title, channel, content_format, angle, target_audience, rationale, client_status, client_comment, position";

const tokenIn = z.object({ token: z.string().min(8).max(80) });

export const resolveMonthlyPlanPublic = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => tokenIn.parse(i))
  .handler(async ({ data }): Promise<PublicPlanResolve> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sb = supabaseAdmin as unknown as SupabaseClient;
    const session = await requireToken(sb, data.token);

    const [{ data: plan }, { data: client }, { data: topics }] = await Promise.all([
      sb
        .from("monthly_plans")
        .select(
          "id, title, description, objectives, status, client_decision_at, client_feedback, client_decision_mode, created_at",
        )
        .eq("id", session.monthly_plan_id)
        .maybeSingle(),
      sb.from("clients").select("id, name").eq("id", session.client_id).maybeSingle(),
      sb
        .from("monthly_plan_topics")
        .select(TOPIC_SELECT)
        .eq("monthly_plan_id", session.monthly_plan_id)
        .eq("status", "approved")
        .order("position", { ascending: true }),
    ]);
    if (!plan) throw new Error("plan_not_found");

    return {
      plan: plan as PublicPlanResolve["plan"],
      client: (client ?? { id: session.client_id, name: "Cliente" }) as PublicPlanResolve["client"],
      topics: (topics ?? []) as unknown as PublicPlanTopic[],
    };
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

export type PublicPlanDecisionResult = {
  ok: true;
  status: string;
  approved: number;
  changes: number;
  rejected: number;
  cardsCreated: number;
};

export const decideMonthlyPlanPublic = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => decideIn.parse(i))
  .handler(async ({ data }): Promise<PublicPlanDecisionResult> => {
    if ((data.decision === "changes" || data.decision === "reject") && !data.feedback.trim()) {
      throw new Error("feedback_required");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { materializePlanToKanban } = await import("@/lib/monthly-plan-kanban.server");
    const sb = supabaseAdmin as unknown as SupabaseClient;
    const session = await requireToken(sb, data.token);

    const { data: planRow } = await sb
      .from("monthly_plans")
      .select("id, status, created_by")
      .eq("id", session.monthly_plan_id)
      .maybeSingle();
    if (!planRow) throw new Error("plan_not_found");
    const plan = planRow as unknown as { id: string; status: string; created_by: string | null };
    if (plan.status !== "pending_client") throw new Error("plan_not_pending");

    const { data: topicRows } = await sb
      .from("monthly_plan_topics")
      .select(
        "id, topic_title, channel, content_format, angle, target_audience, rationale, position",
      )
      .eq("monthly_plan_id", plan.id)
      .eq("status", "approved")
      .order("position", { ascending: true });
    const topics = (topicRows ?? []) as unknown as {
      id: string;
      topic_title: string;
      channel: string | null;
      content_format: string | null;
      angle: string | null;
      target_audience: string | null;
      rationale: string | null;
      position: number;
    }[];
    if (topics.length === 0) throw new Error("plan_has_no_topics");

    const now = new Date().toISOString();
    const perItem = new Map<string, { decision: "approved" | "rejected" | "changes"; comment: string }>();

    if (data.decision === "per_item") {
      const valid = new Set(topics.map((t) => t.id));
      for (const it of data.items ?? []) {
        if (!valid.has(it.topicId)) throw new Error("invalid_topic");
        if (it.decision !== "approved" && !it.comment.trim()) throw new Error("item_comment_required");
        perItem.set(it.topicId, { decision: it.decision, comment: it.comment.trim() });
      }
      if (perItem.size !== topics.length) throw new Error("items_incomplete");
    } else {
      const mapped =
        data.decision === "approve" ? "approved" : data.decision === "reject" ? "rejected" : "changes";
      for (const t of topics) perItem.set(t.id, { decision: mapped, comment: "" });
    }

    // Grava as decisões por tópico.
    await Promise.all(
      [...perItem.entries()].map(([topicId, v]) =>
        sb
          .from("monthly_plan_topics")
          .update({
            client_status: v.decision,
            client_comment: v.comment || null,
            client_decision_at: now,
          } as never)
          .eq("id", topicId)
          .eq("monthly_plan_id", plan.id),
      ),
    );

    const decisions = [...perItem.values()];
    const approvedIds = [...perItem.entries()]
      .filter(([, v]) => v.decision === "approved")
      .map(([id]) => id);
    const counts = {
      approved: approvedIds.length,
      changes: decisions.filter((d) => d.decision === "changes").length,
      rejected: decisions.filter((d) => d.decision === "rejected").length,
    };

    // Status do plano: ajustes > rejeição total > aprovação.
    let status: string;
    if (counts.changes > 0) status = "changes_requested";
    else if (counts.approved === 0) status = "client_rejected";
    else status = "client_approved";

    const { error: upErr } = await sb
      .from("monthly_plans")
      .update({
        status,
        client_decision_at: now,
        client_feedback: data.feedback.trim() || null,
        client_decision_mode: data.decision === "per_item" ? "per_item" : "bulk",
      } as never)
      .eq("id", plan.id)
      .eq("status", "pending_client");
    if (upErr) throw new Error("decision_failed");

    // Itens aprovados pelo cliente vão automaticamente para o Kanban.
    let cardsCreated = 0;
    if (counts.approved > 0) {
      const ready = topics.filter((t) => approvedIds.includes(t.id));
      try {
        const res = await materializePlanToKanban(sb, {
          planId: plan.id,
          brandId: session.brand_id,
          clientId: session.client_id,
          userId: plan.created_by,
          topics: ready,
          markPlanApproved: status === "client_approved",
        });

        cardsCreated = res.created;
      } catch {
        // Não bloqueia a decisão do cliente; a equipe pode reprocessar na tela da pauta.
        cardsCreated = 0;
      }
    }

    return { ok: true, status, ...counts, cardsCreated };
  });
