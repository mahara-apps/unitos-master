import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Rotas públicas da Pauta mensal — o cliente acessa via link com token e
 * aprova ou pede ajustes. Nenhuma sessão é necessária; o token é a credencial.
 */

export type PublicPlanTopic = {
  id: string;
  topic_title: string;
  channel: string | null;
  content_format: string | null;
  angle: string | null;
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
    created_at: string;
  };
  client: { id: string; name: string };
  topics: PublicPlanTopic[];
};

function getPublic(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("supabase_env_missing");
  const isOpaque = key.startsWith("sb_publishable_") || key.startsWith("sb_secret_");
  return createClient(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (isOpaque && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

const tokenIn = z.object({ token: z.string().min(8) });

async function requireToken(sb: SupabaseClient, token: string) {
  const { data, error } = await sb
    .from("monthly_plan_tokens")
    .select("id, monthly_plan_id, client_id, expires_at, revoked_at")
    .eq("token", token)
    .maybeSingle();
  if (error) throw new Error("token_lookup_failed");
  if (!data) throw new Error("invalid_token");
  const row = data as {
    id: string;
    monthly_plan_id: string;
    client_id: string;
    expires_at: string | null;
    revoked_at: string | null;
  };
  if (row.revoked_at) throw new Error("token_revoked");
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
    throw new Error("token_expired");
  }
  return row;
}

export const resolveMonthlyPlanPublic = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => tokenIn.parse(i))
  .handler(async ({ data }): Promise<PublicPlanResolve> => {
    const sb = getPublic();
    const session = await requireToken(sb, data.token);

    const [{ data: plan }, { data: client }, { data: topics }] = await Promise.all([
      sb
        .from("monthly_plans")
        .select(
          "id, title, description, objectives, status, client_decision_at, client_feedback, created_at",
        )
        .eq("id", session.monthly_plan_id)
        .maybeSingle(),
      sb.from("clients").select("id, name").eq("id", session.client_id).maybeSingle(),
      sb
        .from("monthly_plan_topics")
        .select("id, topic_title, channel, content_format, angle, position")
        .eq("monthly_plan_id", session.monthly_plan_id)
        .eq("status", "approved")
        .order("position", { ascending: true }),
    ]);
    if (!plan) throw new Error("plan_not_found");

    return {
      plan: plan as PublicPlanResolve["plan"],
      client: (client ?? { id: session.client_id, name: "Cliente" }) as PublicPlanResolve["client"],
      topics: (topics ?? []) as PublicPlanTopic[],
    };
  });

export const decideMonthlyPlanPublic = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z
      .object({
        token: z.string().min(8),
        decision: z.enum(["approve", "changes"]),
        feedback: z.string().trim().max(2000).optional().default(""),
      })
      .parse(i),
  )
  .handler(async ({ data }): Promise<{ ok: true; status: string }> => {
    if (data.decision === "changes" && !data.feedback.trim()) {
      throw new Error("feedback_required");
    }
    const sb = getPublic();
    const session = await requireToken(sb, data.token);

    const status = data.decision === "approve" ? "client_approved" : "changes_requested";
    const { error } = await sb
      .from("monthly_plans")
      .update({
        status,
        client_decision_at: new Date().toISOString(),
        client_feedback: data.feedback.trim() || null,
      })
      .eq("id", session.monthly_plan_id)
      .eq("status", "pending_client");
    if (error) throw new Error("decision_failed");
    return { ok: true, status };
  });
