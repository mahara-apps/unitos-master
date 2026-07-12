import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type BriefingTokenRow = {
  id: string;
  brand_id: string;
  client_id: string;
  token: string;
  label: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  submitted_at: string | null;
  submission: unknown;
  created_at: string;
};

const Scope = z.object({ brandId: z.string().uuid() });

function randomToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const listBriefingTokens = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Scope.parse(i))
  .handler(async ({ data, context }): Promise<Array<BriefingTokenRow & { client_name: string }>> => {
    const { data: rows, error } = await context.supabase
      .from("client_briefing_tokens" as never)
      .select("id, brand_id, client_id, token, label, expires_at, revoked_at, submitted_at, submission, created_at, clients!inner(name)")
      .eq("brand_id", data.brandId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return ((rows ?? []) as unknown as Array<BriefingTokenRow & { clients: { name: string } }>).map((r) => ({
      ...r,
      client_name: r.clients?.name ?? "—",
    }));
  });

export const createBriefingToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      brandId: z.string().uuid(),
      clientId: z.string().uuid(),
      label: z.string().max(120).optional(),
      expiresAt: z.string().datetime().nullable().optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const token = randomToken();
    const { data: row, error } = await context.supabase
      .from("client_briefing_tokens" as never)
      .insert({
        brand_id: data.brandId,
        client_id: data.clientId,
        token,
        label: data.label ?? null,
        expires_at: data.expiresAt ?? null,
        created_by: context.userId,
      } as never)
      .select("*")
      .single();
    if (error) throw error;
    return row as unknown as BriefingTokenRow;
  });

export const revokeBriefingToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ brandId: z.string().uuid(), tokenId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("client_briefing_tokens" as never)
      .update({ revoked_at: new Date().toISOString() } as never)
      .eq("id", data.tokenId)
      .eq("brand_id", data.brandId);
    if (error) throw error;
    return { ok: true };
  });

/* -------------------- Public (unauthenticated) ------------------- */

export type PublicBriefingInfo = {
  ok: true;
  clientName: string;
  brandName: string;
  alreadySubmitted: boolean;
};

export type PublicBriefingError = {
  ok: false;
  reason: "not_found" | "revoked" | "expired";
};

export const getPublicBriefing = createServerFn({ method: "GET" })
  .inputValidator((i: unknown) => z.object({ token: z.string().min(10).max(200) }).parse(i))
  .handler(async ({ data }): Promise<PublicBriefingInfo | PublicBriefingError> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("client_briefing_tokens" as never)
      .select("id, revoked_at, expires_at, submitted_at, client_id, brand_id, clients(name), brands(name)")
      .eq("token", data.token)
      .maybeSingle();
    if (!row) return { ok: false, reason: "not_found" };
    const r = row as unknown as {
      revoked_at: string | null;
      expires_at: string | null;
      submitted_at: string | null;
      clients: { name: string } | null;
      brands: { name: string } | null;
    };
    if (r.revoked_at) return { ok: false, reason: "revoked" };
    if (r.expires_at && new Date(r.expires_at).getTime() < Date.now())
      return { ok: false, reason: "expired" };
    return {
      ok: true,
      clientName: r.clients?.name ?? "your brand",
      brandName: r.brands?.name ?? "the agency",
      alreadySubmitted: !!r.submitted_at,
    };
  });

const SubmissionSchema = z.object({
  token: z.string().min(10).max(200),
  description: z.string().trim().min(20).max(5000),
  audience: z.string().trim().min(10).max(2000),
  pain_points: z.string().trim().max(2000).optional().default(""),
  tone_tags: z.array(z.string().trim().min(1).max(40)).min(1).max(12),
});

export const submitPublicBriefing = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => SubmissionSchema.parse(i))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("client_briefing_tokens" as never)
      .select("id, brand_id, client_id, revoked_at, expires_at, submitted_at")
      .eq("token", data.token)
      .maybeSingle();
    if (!row) throw new Error("token_not_found");
    const r = row as unknown as {
      id: string;
      brand_id: string;
      client_id: string;
      revoked_at: string | null;
      expires_at: string | null;
      submitted_at: string | null;
    };
    if (r.revoked_at) throw new Error("token_revoked");
    if (r.expires_at && new Date(r.expires_at).getTime() < Date.now())
      throw new Error("token_expired");

    const patch = {
      description: data.description,
      audience: data.audience,
      pain_points: data.pain_points || undefined,
      tone_tags: data.tone_tags,
    };

    const { data: current } = await supabaseAdmin
      .from("clients")
      .select("brand_hub, name")
      .eq("id", r.client_id)
      .maybeSingle();
    const prev = ((current as { brand_hub?: Record<string, unknown> } | null)?.brand_hub ?? {}) as Record<string, unknown>;
    await supabaseAdmin
      .from("clients")
      .update({ brand_hub: { ...prev, ...patch } } as never)
      .eq("id", r.client_id);

    await supabaseAdmin
      .from("client_briefing_tokens" as never)
      .update({
        submitted_at: new Date().toISOString(),
        submission: patch,
      } as never)
      .eq("id", r.id);

    // Notify all brand members
    const { data: members } = await supabaseAdmin
      .from("brand_members")
      .select("user_id")
      .eq("brand_id", r.brand_id);
    const clientName = (current as { name?: string } | null)?.name ?? "cliente";
    const rows = (members ?? []).map((m: { user_id: string }) => ({
      brand_id: r.brand_id,
      user_id: m.user_id,
      kind: "briefing_submitted",
      title: `Briefing recebido: ${clientName}`,
      body: `${clientName} enviou o briefing público. Revise no Brand Intelligence Hub.`,
      href: `/customers/${r.client_id}`,
      payload: { client_id: r.client_id, token_id: r.id },
    }));
    if (rows.length) await supabaseAdmin.from("notifications").insert(rows as never);

    return { ok: true };
  });