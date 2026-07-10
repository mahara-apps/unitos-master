import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ALL_PERMISSION_IDS, normalizePermissions, type PermissionId } from "@/lib/permissions";

const ROLES = ["owner", "manager", "editor", "designer", "client"] as const;

const BrandIdInput = z.object({ brandId: z.string().uuid() });

export const listBrandTeam = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => BrandIdInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [membersRes, invitesRes] = await Promise.all([
      supabase
        .from("brand_members")
        .select("brand_id, user_id, role, permissions, created_at")
        .eq("brand_id", data.brandId),
      supabase
        .from("brand_invites")
        .select("id, email, role, permissions, token, invited_by, accepted_at, expires_at, created_at")
        .eq("brand_id", data.brandId)
        .order("created_at", { ascending: false }),
    ]);
    if (membersRes.error) throw membersRes.error;
    if (invitesRes.error) throw invitesRes.error;
    const members = membersRes.data ?? [];
    const userIds = members.map((m) => m.user_id);
    let profiles: Array<{ id: string; full_name: string | null; avatar_url: string | null }> = [];
    if (userIds.length > 0) {
      const { data: profs } = await supabase
        .from("user_profiles")
        .select("id, full_name, avatar_url")
        .in("id", userIds);
      profiles = (profs ?? []) as typeof profiles;
    }
    return {
      members: members.map((m) => {
        const p = profiles.find((x) => x.id === m.user_id);
        return {
          user_id: m.user_id,
          role: m.role as (typeof ROLES)[number],
          permissions: normalizePermissions(m.permissions),
          created_at: m.created_at,
          full_name: p?.full_name ?? null,
          email: null as string | null,
          avatar_url: p?.avatar_url ?? null,
        };
      }),
      invites: (invitesRes.data ?? []).map((i) => ({
        ...i,
        permissions: normalizePermissions(i.permissions),
      })),
    };
  });

const InviteInput = z.object({
  brandId: z.string().uuid(),
  emails: z.array(z.string().trim().toLowerCase().email()).min(1).max(20),
  role: z.enum(ROLES).default("editor"),
  permissions: z.array(z.enum(ALL_PERMISSION_IDS as [PermissionId, ...PermissionId[]])).default([]),
});

function randomToken(bytes = 24): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sendInviteEmail(opts: {
  to: string;
  brandName: string;
  inviterName: string;
  acceptUrl: string;
}): Promise<{ sent: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const lovableKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return { sent: false, error: "resend_not_configured" };
  const from = process.env.INVITE_FROM_EMAIL || "NexusFlow <onboarding@resend.dev>";
  const html = `
    <div style="font-family:ui-sans-serif,system-ui;line-height:1.5;color:#0a0a0a">
      <h2 style="margin:0 0 12px">Convite para ${opts.brandName}</h2>
      <p>${opts.inviterName} convidou você para colaborar na marca <strong>${opts.brandName}</strong> no NexusFlow.</p>
      <p><a href="${opts.acceptUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Aceitar convite</a></p>
      <p style="color:#71717a;font-size:12px">Se o botão não funcionar, copie o link: ${opts.acceptUrl}</p>
    </div>`;
  try {
    const useGateway = Boolean(lovableKey);
    const url = useGateway ? "https://connector-gateway.lovable.dev/resend/emails" : "https://api.resend.com/emails";
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (useGateway) {
      headers["Authorization"] = `Bearer ${lovableKey}`;
      headers["X-Connection-Api-Key"] = apiKey;
    } else {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ from, to: [opts.to], subject: `Convite para ${opts.brandName}`, html }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`[invite email] ${res.status} ${body}`);
      return { sent: false, error: `provider_${res.status}` };
    }
    return { sent: true };
  } catch (e) {
    console.error("[invite email] fetch failed", e);
    return { sent: false, error: "network" };
  }
}

export const inviteBrandMembers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InviteInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Authorize: caller must be owner or manager of the brand
    const { data: myMembership, error: memErr } = await supabase
      .from("brand_members")
      .select("role")
      .eq("brand_id", data.brandId)
      .eq("user_id", userId)
      .maybeSingle();
    if (memErr) throw memErr;
    if (!myMembership || (myMembership.role !== "owner" && myMembership.role !== "manager")) {
      throw new Error("forbidden");
    }

    const { data: brand } = await supabase.from("brands").select("name").eq("id", data.brandId).single();
    const { data: inviterProfile } = await supabase
      .from("user_profiles").select("full_name").eq("id", userId).maybeSingle();
    const inviterName = inviterProfile?.full_name || "Alguém do time";
    const brandName = brand?.name || "sua marca";

    const results: Array<{ email: string; status: "invited" | "linked" | "already_member" | "error"; link?: string; error?: string; emailSent?: boolean }> = [];

    for (const email of data.emails) {
      const token = randomToken();
      const { error: inviteErr } = await supabase.from("brand_invites").insert({
        brand_id: data.brandId,
        email,
        role: data.role,
        permissions: data.permissions,
        token,
        invited_by: userId,
      });
      if (inviteErr) {
        results.push({ email, status: "error", error: inviteErr.message });
        continue;
      }
      const origin = process.env.APP_URL || "";
      const link = `${origin}/invite/${token}`;
      const emailRes = await sendInviteEmail({ to: email, brandName, inviterName, acceptUrl: link });
      results.push({ email, status: "invited", link, emailSent: emailRes.sent, error: emailRes.error });
    }

    return { results };
  });

const UpdateMemberInput = z.object({
  brandId: z.string().uuid(),
  userId: z.string().uuid(),
  role: z.enum(ROLES).optional(),
  permissions: z.array(z.enum(ALL_PERMISSION_IDS as [PermissionId, ...PermissionId[]])).optional(),
});

export const updateBrandMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdateMemberInput.parse(input))
  .handler(async ({ data, context }) => {
    const patch: { role?: (typeof ROLES)[number]; permissions?: PermissionId[] } = {};
    if (data.role) patch.role = data.role;
    if (data.permissions) patch.permissions = data.permissions;
    const { error } = await context.supabase
      .from("brand_members")
      .update(patch)
      .eq("brand_id", data.brandId)
      .eq("user_id", data.userId);
    if (error) throw error;
    return { ok: true };
  });

const RemoveMemberInput = z.object({ brandId: z.string().uuid(), userId: z.string().uuid() });
export const removeBrandMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RemoveMemberInput.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("brand_members")
      .delete()
      .eq("brand_id", data.brandId)
      .eq("user_id", data.userId);
    if (error) throw error;
    return { ok: true };
  });

const RevokeInviteInput = z.object({ brandId: z.string().uuid(), inviteId: z.string().uuid() });
export const revokeBrandInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RevokeInviteInput.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("brand_invites")
      .delete()
      .eq("id", data.inviteId)
      .eq("brand_id", data.brandId);
    if (error) throw error;
    return { ok: true };
  });

const AcceptInput = z.object({ token: z.string().min(10) });
export const acceptBrandInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => AcceptInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: brandId, error } = await context.supabase.rpc("accept_brand_invite", { _token: data.token });
    if (error) throw error;
    return { brandId };
  });

const PreviewInput = z.object({ token: z.string().min(10) });
export const previewInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => PreviewInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: invite } = await context.supabase
      .from("brand_invites")
      .select("email, role, permissions, accepted_at, expires_at, brand_id")
      .eq("token", data.token)
      .maybeSingle();
    if (!invite) return { invite: null, brand: null as null | { name: string; color: string | null } };
    const { data: brand } = await context.supabase
      .from("brands").select("name, color").eq("id", invite.brand_id).maybeSingle();
    return {
      invite: { ...invite, permissions: normalizePermissions(invite.permissions) },
      brand: brand ?? null,
    };
  });