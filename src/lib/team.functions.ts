import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ALL_PERMISSION_IDS, normalizePermissions, type PermissionId } from "@/lib/permissions";
import { assertBrandAdmin, resolveAuthorityRole } from "@/lib/access-guard";

const ROLES = ["owner", "manager", "user", "client"] as const;
/** Papéis atribuíveis a membros internos (Portal usa `client`). */
const ASSIGNABLE = ["owner", "manager", "user"] as const;

const BrandIdInput = z.object({ brandId: z.string().uuid() });

export const listBrandTeam = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => BrandIdInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [membersRes, invitesRes, clientsRes] = await Promise.all([
      supabase
        .from("brand_members")
        .select("brand_id, user_id, role, permissions, created_at")
        .eq("brand_id", data.brandId),
      supabase
        .from("brand_invites")
        .select(
          "id, email, role, permissions, token, invited_by, accepted_at, expires_at, created_at, revoked_at, temp_password_sent",
        )
        .eq("brand_id", data.brandId)
        .order("created_at", { ascending: false }),
      supabase.from("clients").select("id, name").eq("brand_id", data.brandId),
    ]);
    if (membersRes.error) throw membersRes.error;
    if (invitesRes.error) throw invitesRes.error;
    if (clientsRes.error) throw clientsRes.error;

    const clients = clientsRes.data ?? [];
    const clientMap = new Map(clients.map((c) => [c.id, c.name]));
    let portalTokens: Array<{
      id: string;
      token: string;
      label: string | null;
      client_id: string;
      client_name: string;
      expires_at: string | null;
      revoked_at: string | null;
      last_seen_at: string | null;
      created_at: string;
    }> = [];
    if (clients.length > 0) {
      const { data: tokens, error: tErr } = await supabase
        .from("portal_tokens")
        .select("id, token, label, client_id, expires_at, revoked_at, last_seen_at, created_at")
        .in(
          "client_id",
          clients.map((c) => c.id),
        )
        .order("created_at", { ascending: false });
      if (tErr) throw tErr;
      portalTokens = (tokens ?? []).map((t) => ({
        ...t,
        client_name: clientMap.get(t.client_id) ?? "—",
      }));
    }

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
      invites: ((invitesRes.data ?? []) as Array<Record<string, unknown>>).map((i) => ({
        ...i,
        permissions: normalizePermissions(i.permissions as never),
      })) as Array<{
        id: string;
        email: string;
        role: string;
        permissions: PermissionId[];
        token: string;
        invited_by: string | null;
        accepted_at: string | null;
        expires_at: string;
        created_at: string;
        revoked_at: string | null;
        temp_password_sent: boolean;
      }>,
      portalTokens,
    };
  });

const InviteInput = z.object({
  brandId: z.string().uuid(),
  emails: z.array(z.string().trim().toLowerCase().email()).min(1).max(20),
  role: z.enum(ASSIGNABLE).default("user"),
  permissions: z.array(z.enum(ALL_PERMISSION_IDS as [PermissionId, ...PermissionId[]])).default([]),
  expiresAt: z.string().datetime().optional(),
});

function randomToken(bytes = 24): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

function randomPassword(length = 16): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*?";
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[arr[i] % alphabet.length];
  return out;
}

async function sendInviteEmail(opts: {
  to: string;
  brandName: string;
  inviterName: string;
  acceptUrl: string;
  tempPassword?: string;
}): Promise<{ sent: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const lovableKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return { sent: false, error: "resend_not_configured" };
  const from = process.env.INVITE_FROM_EMAIL || "Unitos <onboarding@resend.dev>";
  const credsBlock = opts.tempPassword
    ? `
      <div style="margin:16px 0;padding:12px 14px;border:1px solid #e4e4e7;border-radius:8px;background:#fafafa">
        <div style="font-size:12px;color:#71717a;margin-bottom:4px">Senha temporária</div>
        <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:14px;font-weight:600;color:#0a0a0a">${opts.tempPassword}</div>
        <div style="font-size:11px;color:#a1a1aa;margin-top:8px">Você precisará escolher uma nova senha no primeiro acesso.</div>
      </div>`
    : "";
  const html = `
    <div style="font-family:ui-sans-serif,system-ui;line-height:1.5;color:#0a0a0a">
      <h2 style="margin:0 0 12px">Convite para ${opts.brandName}</h2>
      <p>${opts.inviterName} convidou você para colaborar na marca <strong>${opts.brandName}</strong> no Unitos.</p>
      ${credsBlock}
      <p><a href="${opts.acceptUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Aceitar convite</a></p>
      <p style="color:#71717a;font-size:12px">Se o botão não funcionar, copie o link: ${opts.acceptUrl}</p>
    </div>`;
  try {
    const useGateway = Boolean(lovableKey);
    const url = useGateway
      ? "https://connector-gateway.lovable.dev/resend/emails"
      : "https://api.resend.com/emails";
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
      body: JSON.stringify({
        from,
        to: [opts.to],
        subject: `Convite para ${opts.brandName}`,
        html,
      }),
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

    const { data: brand } = await supabase
      .from("brands")
      .select("name")
      .eq("id", data.brandId)
      .single();
    const { data: inviterProfile } = await supabase
      .from("user_profiles")
      .select("full_name")
      .eq("id", userId)
      .maybeSingle();
    const inviterName = inviterProfile?.full_name || "Alguém do time";
    const brandName = brand?.name || "sua marca";

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const results: Array<{
      email: string;
      status: "invited" | "linked" | "already_member" | "error";
      link?: string;
      error?: string;
      emailSent?: boolean;
      provisioned?: boolean;
    }> = [];

    for (const email of data.emails) {
      const token = randomToken();

      // 1. Check if an auth user already exists for this email; if not, provision one
      //    with a random temporary password and force a password change on first login.
      let provisioned = false;
      let tempPassword: string | undefined;
      try {
        const { data: existing } = await supabaseAdmin.auth.admin.listUsers({
          page: 1,
          perPage: 200,
        });
        const alreadyExists = existing?.users?.some((u) => (u.email ?? "").toLowerCase() === email);
        if (!alreadyExists) {
          tempPassword = randomPassword(16);
          const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
            email,
            password: tempPassword,
            email_confirm: true,
            user_metadata: { full_name: email.split("@")[0] },
          });
          if (createErr) {
            results.push({ email, status: "error", error: `provision_${createErr.message}` });
            continue;
          }
          if (created?.user?.id) {
            // Force password change on first login
            await supabaseAdmin
              .from("user_profiles")
              .update({ requires_password_change: true })
              .eq("id", created.user.id);
            provisioned = true;
          }
        }
      } catch (e) {
        console.error("[invite provision] failed", e);
      }

      const insertPayload = {
        brand_id: data.brandId,
        email,
        role: data.role,
        permissions: data.permissions,
        token,
        invited_by: userId,
        temp_password_sent: provisioned,
        ...(data.expiresAt ? { expires_at: data.expiresAt } : {}),
      };
      const { error: inviteErr } = await supabase.from("brand_invites").insert(insertPayload);
      if (inviteErr) {
        console.error("[brand_invites] insert failed", { email, error: inviteErr });
        results.push({ email, status: "error", error: inviteErr.message });
        continue;
      }
      const origin = process.env.APP_URL || "";
      const link = `${origin}/invite/${token}`;
      const emailRes = await sendInviteEmail({
        to: email,
        brandName,
        inviterName,
        acceptUrl: link,
        tempPassword,
      });
      results.push({
        email,
        status: "invited",
        link,
        emailSent: emailRes.sent,
        error: emailRes.error,
        provisioned,
      });
    }

    return { results };
  });

const UpdateMemberInput = z.object({
  brandId: z.string().uuid(),
  userId: z.string().uuid(),
  role: z.enum(ASSIGNABLE).optional(),
  permissions: z.array(z.enum(ALL_PERMISSION_IDS as [PermissionId, ...PermissionId[]])).optional(),
});

export const updateBrandMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdateMemberInput.parse(input))
  .handler(async ({ data, context }) => {
    // Autorização explícita no servidor (não confiar na UI nem só na RLS).
    const myRole = await assertBrandAdmin(context.supabase, context.userId, data.brandId);
    const targetRole = await resolveAuthorityRole(context.supabase, data.userId, data.brandId);
    // MANAGER não gerencia ADMIN nem promove a owner (anti-escalonamento).
    if (myRole === "manager" && (targetRole === "admin" || data.role === "owner")) {
      throw new Error("Forbidden: gerente não pode alterar donos da agência");
    }
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
    const myRole = await assertBrandAdmin(context.supabase, context.userId, data.brandId);
    const targetRole = await resolveAuthorityRole(context.supabase, data.userId, data.brandId);
    if (myRole === "manager" && targetRole === "admin") {
      throw new Error("Forbidden: gerente não pode remover donos da agência");
    }
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
      .update({ revoked_at: new Date().toISOString(), revoked_by: context.userId })
      .eq("id", data.inviteId)
      .eq("brand_id", data.brandId)
      .is("accepted_at", null);
    if (error) throw error;
    return { ok: true };
  });

const RevokePortalInput = z.object({ brandId: z.string().uuid(), tokenId: z.string().uuid() });
/**
 * @deprecated Fase 2 — use `revokePortalTokenFn` (src/lib/customer-dashboard.functions.ts),
 * que opera por cliente e cobre os modos `revoke` / `revokeAndCreate`.
 * Mantida apenas por compatibilidade; nenhuma tela do app a utiliza.
 */
export const revokePortalTokenFromTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RevokePortalInput.parse(input))
  .handler(async ({ data, context }) => {
    // Ensure the token belongs to a client of this brand
    const { data: token, error: tErr } = await context.supabase
      .from("portal_tokens")
      .select("id, client_id, clients:clients(brand_id)")
      .eq("id", data.tokenId)
      .maybeSingle();
    if (tErr) throw tErr;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const brandOfToken = (token as any)?.clients?.brand_id;
    if (!token || brandOfToken !== data.brandId) throw new Error("forbidden");
    const { error } = await context.supabase
      .from("portal_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.tokenId);
    if (error) throw error;
    return { ok: true };
  });

const AcceptInput = z.object({ token: z.string().min(10) });
export const acceptBrandInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => AcceptInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: brandId, error } = await context.supabase.rpc("accept_brand_invite", {
      _token: data.token,
    });
    if (error) throw error;
    return { brandId };
  });

const AddExistingInput = z.object({
  brandId: z.string().uuid(),
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(ASSIGNABLE).default("user"),
  permissions: z.array(z.enum(ALL_PERMISSION_IDS as [PermissionId, ...PermissionId[]])).default([]),
});

// ============================================================================
// Provisionamento manual de usuários com senha temporária e escopo por projeto
// ============================================================================

const AssignmentInput = z.object({
  brandId: z.string().uuid(),
  role: z.enum(ASSIGNABLE).default("user"),
  permissions: z.array(z.enum(ALL_PERMISSION_IDS as [PermissionId, ...PermissionId[]])).default([]),
  clientIds: z.array(z.string().uuid()).default([]),
});

const ProvisionUserInput = z.object({
  email: z.string().trim().toLowerCase().email(),
  fullName: z.string().trim().min(1).max(120),
  assignments: z.array(AssignmentInput).min(1).max(20),
  sendEmail: z.boolean().default(true),
});

async function sendCredentialsEmail(opts: {
  to: string;
  fullName: string;
  tempPassword: string;
  loginUrl: string;
  workspaces: Array<{ name: string; clients: string[] }>;
}): Promise<{ sent: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const lovableKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return { sent: false, error: "resend_not_configured" };
  const from = process.env.INVITE_FROM_EMAIL || "Unitos <onboarding@resend.dev>";
  const workspacesHtml = opts.workspaces
    .map(
      (w) => `
      <div style="margin-bottom:8px">
        <div style="font-size:13px;font-weight:600;color:#0a0a0a">${w.name}</div>
        <div style="font-size:12px;color:#71717a">${
          w.clients.length === 0 ? "Todos os projetos" : `Projetos: ${w.clients.join(", ")}`
        }</div>
      </div>`,
    )
    .join("");
  const html = `
    <div style="font-family:ui-sans-serif,system-ui;line-height:1.5;color:#0a0a0a">
      <h2 style="margin:0 0 12px">Sua conta no Unitos está pronta</h2>
      <p>Olá ${opts.fullName || opts.to}, uma conta foi criada para você no Unitos.</p>
      <div style="margin:16px 0;padding:12px 14px;border:1px solid #e4e4e7;border-radius:8px;background:#fafafa">
        <div style="font-size:12px;color:#71717a;margin-bottom:4px">E-mail</div>
        <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:14px;font-weight:600;color:#0a0a0a">${opts.to}</div>
        <div style="font-size:12px;color:#71717a;margin:10px 0 4px">Senha temporária</div>
        <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:14px;font-weight:600;color:#0a0a0a">${opts.tempPassword}</div>
        <div style="font-size:11px;color:#a1a1aa;margin-top:8px">Você será solicitado a definir uma nova senha no primeiro acesso.</div>
      </div>
      <div style="margin:16px 0">
        <div style="font-size:12px;color:#71717a;margin-bottom:6px;text-transform:uppercase;letter-spacing:.06em">Acessos liberados</div>
        ${workspacesHtml}
      </div>
      <p><a href="${opts.loginUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Acessar Unitos</a></p>
      <p style="color:#71717a;font-size:12px">Este e-mail é apenas informativo — o acesso já está ativo, você pode entrar imediatamente.</p>
    </div>`;
  try {
    const useGateway = Boolean(lovableKey);
    const url = useGateway
      ? "https://connector-gateway.lovable.dev/resend/emails"
      : "https://api.resend.com/emails";
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
      body: JSON.stringify({
        from,
        to: [opts.to],
        subject: "Sua conta no Unitos está pronta",
        html,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`[credentials email] ${res.status} ${body}`);
      return { sent: false, error: `provider_${res.status}` };
    }
    return { sent: true };
  } catch (e) {
    console.error("[credentials email] fetch failed", e);
    return { sent: false, error: "network" };
  }
}

export const provisionUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ProvisionUserInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Autorização: super admin OU owner/manager em TODAS as marcas alvo
    const { data: adminFlag } = await supabase
      .from("user_profiles")
      .select("is_super_admin")
      .eq("id", userId)
      .maybeSingle();
    const isSuper = Boolean((adminFlag as { is_super_admin?: boolean } | null)?.is_super_admin);

    const brandIds = Array.from(new Set(data.assignments.map((a) => a.brandId)));
    if (!isSuper) {
      const { data: myRoles, error: rolesErr } = await supabase
        .from("brand_members")
        .select("brand_id, role")
        .in("brand_id", brandIds)
        .eq("user_id", userId);
      if (rolesErr) throw rolesErr;
      const allowed = new Set(
        (myRoles ?? [])
          .filter((r) => r.role === "owner" || r.role === "manager")
          .map((r) => r.brand_id),
      );
      const missing = brandIds.filter((b) => !allowed.has(b));
      if (missing.length > 0) {
        throw new Error(
          "forbidden: você precisa ser owner ou manager de todos os workspaces selecionados",
        );
      }
    }

    // Validar clientIds pertencem à marca correta
    const allClientIds = data.assignments.flatMap((a) => a.clientIds);
    if (allClientIds.length > 0) {
      const { data: clientRows, error: cErr } = await supabase
        .from("clients")
        .select("id, brand_id, name")
        .in("id", allClientIds);
      if (cErr) throw cErr;
      const clientBrand = new Map((clientRows ?? []).map((c) => [c.id, c.brand_id]));
      for (const a of data.assignments) {
        for (const cid of a.clientIds) {
          if (clientBrand.get(cid) !== a.brandId) {
            throw new Error(
              `invalid_client: projeto ${cid} não pertence ao workspace ${a.brandId}`,
            );
          }
        }
      }
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Verifica se já existe usuário com esse e-mail
    const email = data.email;
    let existingId: string | null = null;
    for (let page = 1; page <= 20 && !existingId; page++) {
      const { data: list, error: lErr } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage: 200,
      });
      if (lErr) throw lErr;
      const users = list?.users ?? [];
      const hit = users.find((u) => (u.email ?? "").toLowerCase() === email);
      if (hit) existingId = hit.id;
      if (users.length < 200) break;
    }
    if (existingId) {
      throw new Error("user_exists: já existe conta com este e-mail. Use 'Adicionar existente'.");
    }

    const tempPassword = randomPassword(16);
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: data.fullName },
    });
    if (createErr || !created?.user?.id) {
      throw new Error(`provision_failed: ${createErr?.message ?? "sem id de usuário"}`);
    }
    const newUserId = created.user.id;

    // Marca reset obrigatório + garante nome no perfil
    await supabaseAdmin
      .from("user_profiles")
      .update({ requires_password_change: true, full_name: data.fullName } as never)
      .eq("id", newUserId);

    // Atribui workspaces e projetos
    const workspaceInfo: Array<{ name: string; clients: string[] }> = [];
    for (const assignment of data.assignments) {
      const { error: bmErr } = await supabaseAdmin.from("brand_members").upsert(
        {
          brand_id: assignment.brandId,
          user_id: newUserId,
          role: assignment.role,
          permissions: assignment.permissions,
        },
        { onConflict: "brand_id,user_id" },
      );
      if (bmErr) throw bmErr;

      if (assignment.clientIds.length > 0) {
        const rows = assignment.clientIds.map((cid) => ({
          brand_id: assignment.brandId,
          client_id: cid,
          user_id: newUserId,
          role: assignment.role,
          created_by: userId,
        }));
        const { error: cmErr } = await (
          supabaseAdmin.from as never as (t: string) => {
            upsert: (v: unknown, o: { onConflict: string }) => Promise<{ error: unknown }>;
          }
        )("client_members").upsert(rows, { onConflict: "client_id,user_id" });
        if (cmErr) throw cmErr as Error;
      }

      const { data: brand } = await supabase
        .from("brands")
        .select("name")
        .eq("id", assignment.brandId)
        .maybeSingle();
      let clientNames: string[] = [];
      if (assignment.clientIds.length > 0) {
        const { data: cRows } = await supabase
          .from("clients")
          .select("id, name")
          .in("id", assignment.clientIds);
        clientNames = (cRows ?? []).map((c) => c.name as string);
      }
      workspaceInfo.push({ name: brand?.name ?? "Workspace", clients: clientNames });
    }

    let emailStatus: { sent: boolean; error?: string } = { sent: false, error: "skipped" };
    if (data.sendEmail) {
      const origin = process.env.APP_URL || "";
      emailStatus = await sendCredentialsEmail({
        to: email,
        fullName: data.fullName,
        tempPassword,
        loginUrl: `${origin}/auth`,
        workspaces: workspaceInfo,
      });
    }

    return {
      userId: newUserId,
      email,
      tempPassword,
      emailStatus,
    };
  });

// Lista workspaces onde o usuário atual pode provisionar novos usuários
export const listProvisionableBrands = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: adminFlag } = await supabase
      .from("user_profiles")
      .select("is_super_admin")
      .eq("id", userId)
      .maybeSingle();
    const isSuper = Boolean((adminFlag as { is_super_admin?: boolean } | null)?.is_super_admin);

    let brandsQuery = supabase.from("brands").select("id, name").order("name");
    if (!isSuper) {
      const { data: memberships, error: mErr } = await supabase
        .from("brand_members")
        .select("brand_id, role")
        .eq("user_id", userId)
        .in("role", ["owner", "manager"]);
      if (mErr) throw mErr;
      const ids = (memberships ?? []).map((m) => m.brand_id);
      if (ids.length === 0)
        return {
          brands: [] as Array<{
            id: string;
            name: string;
            clients: Array<{ id: string; name: string }>;
          }>,
          isSuperAdmin: false,
        };
      brandsQuery = brandsQuery.in("id", ids);
    }
    const { data: brands, error: bErr } = await brandsQuery;
    if (bErr) throw bErr;
    const brandIds = (brands ?? []).map((b) => b.id);
    const { data: clients } = brandIds.length
      ? await supabase
          .from("clients")
          .select("id, name, brand_id")
          .in("brand_id", brandIds)
          .order("name")
      : { data: [] };
    const clientsByBrand = new Map<string, Array<{ id: string; name: string }>>();
    for (const c of clients ?? []) {
      const arr = clientsByBrand.get(c.brand_id) ?? [];
      arr.push({ id: c.id, name: c.name as string });
      clientsByBrand.set(c.brand_id, arr);
    }
    return {
      isSuperAdmin: isSuper,
      brands: (brands ?? []).map((b) => ({
        id: b.id,
        name: b.name as string,
        clients: clientsByBrand.get(b.id) ?? [],
      })),
    };
  });

export const addExistingUserToBrand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => AddExistingInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Authorize: caller must be owner or manager
    const { data: my, error: memErr } = await supabase
      .from("brand_members")
      .select("role")
      .eq("brand_id", data.brandId)
      .eq("user_id", userId)
      .maybeSingle();
    if (memErr) throw memErr;
    if (!my || (my.role !== "owner" && my.role !== "manager")) {
      throw new Error("forbidden");
    }

    type LinkExistingUserRow = {
      status: "added" | "updated" | "already_member" | "not_found";
      email: string;
      user_id: string | null;
      full_name: string | null;
    };

    const rpc = supabase.rpc as unknown as (
      fn: "link_existing_user_to_brand",
      args: {
        _brand_id: string;
        _email: string;
        _role: (typeof ROLES)[number];
        _permissions: PermissionId[];
      },
    ) => Promise<{ data: LinkExistingUserRow[] | LinkExistingUserRow | null; error: Error | null }>;

    const { data: linkedRows, error: linkErr } = await rpc("link_existing_user_to_brand", {
      _brand_id: data.brandId,
      _email: data.email,
      _role: data.role,
      _permissions: data.permissions,
    });
    if (linkErr) throw linkErr;

    const linked = Array.isArray(linkedRows) ? linkedRows[0] : linkedRows;
    if (!linked || linked.status === "not_found") {
      return { status: "not_found" as const, email: data.email };
    }

    return {
      status: linked.status,
      email: linked.email,
      userId: linked.user_id,
      fullName: linked.full_name,
    };
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
    if (!invite)
      return { invite: null, brand: null as null | { name: string; color: string | null } };
    const { data: brand } = await context.supabase
      .from("brands")
      .select("name, color")
      .eq("id", invite.brand_id)
      .maybeSingle();
    return {
      invite: { ...invite, permissions: normalizePermissions(invite.permissions) },
      brand: brand ?? null,
    };
  });

// ============================================================================
// Fluxo unificado: adicionar pessoa (vincula se existe, provisiona se não)
// ============================================================================

const AddPersonInput = z.object({
  brandId: z.string().uuid(),
  email: z.string().trim().toLowerCase().email(),
  fullName: z.string().trim().max(120).optional().default(""),
  role: z.enum(ASSIGNABLE).default("user"),
  permissions: z.array(z.enum(ALL_PERMISSION_IDS as [PermissionId, ...PermissionId[]])).default([]),
  clientIds: z.array(z.string().uuid()).default([]),
  sendEmail: z.boolean().default(true),
});

export const addPerson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => AddPersonInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Autorização: super admin OU owner/manager desta marca
    const { data: adminFlag } = await supabase
      .from("user_profiles")
      .select("is_super_admin")
      .eq("id", userId)
      .maybeSingle();
    const isSuper = Boolean((adminFlag as { is_super_admin?: boolean } | null)?.is_super_admin);
    if (!isSuper) {
      const { data: my } = await supabase
        .from("brand_members")
        .select("role")
        .eq("brand_id", data.brandId)
        .eq("user_id", userId)
        .maybeSingle();
      if (!my || (my.role !== "owner" && my.role !== "manager")) {
        throw new Error("forbidden: apenas owners e managers podem adicionar pessoas");
      }
    }

    // Validar clientIds pertencem à marca
    if (data.clientIds.length > 0) {
      const { data: cRows, error: cErr } = await supabase
        .from("clients")
        .select("id, brand_id")
        .in("id", data.clientIds);
      if (cErr) throw cErr;
      for (const c of cRows ?? []) {
        if (c.brand_id !== data.brandId) {
          throw new Error("invalid_client: projeto não pertence a este workspace");
        }
      }
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Procura usuário existente
    let existingId: string | null = null;
    for (let page = 1; page <= 20 && !existingId; page++) {
      const { data: list, error: lErr } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage: 200,
      });
      if (lErr) throw lErr;
      const users = list?.users ?? [];
      const hit = users.find((u) => (u.email ?? "").toLowerCase() === data.email);
      if (hit) existingId = hit.id;
      if (users.length < 200) break;
    }

    let tempPassword: string | null = null;
    let mode: "linked" | "provisioned" = "linked";
    let targetId: string;
    let fullName = data.fullName;

    if (existingId) {
      targetId = existingId;
      const { data: prof } = await supabase
        .from("user_profiles")
        .select("full_name")
        .eq("id", existingId)
        .maybeSingle();
      fullName = fullName || (prof?.full_name ?? "");
    } else {
      if (!data.fullName || data.fullName.length < 1) {
        throw new Error("name_required: informe o nome completo para criar a conta");
      }
      tempPassword = randomPassword(16);
      const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email: data.email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { full_name: data.fullName },
      });
      if (createErr || !created?.user?.id) {
        throw new Error(`provision_failed: ${createErr?.message ?? "sem id de usuário"}`);
      }
      targetId = created.user.id;
      mode = "provisioned";
      await supabaseAdmin
        .from("user_profiles")
        .update({ requires_password_change: true, full_name: data.fullName } as never)
        .eq("id", targetId);
    }

    // Vincula ao workspace (upsert brand_members)
    const { data: existingMember } = await supabase
      .from("brand_members")
      .select("role, permissions")
      .eq("brand_id", data.brandId)
      .eq("user_id", targetId)
      .maybeSingle();

    const { error: upErr } = await supabaseAdmin
      .from("brand_members")
      .upsert(
        {
          brand_id: data.brandId,
          user_id: targetId,
          role: data.role,
          permissions: data.permissions,
        },
        { onConflict: "brand_id,user_id" },
      );
    if (upErr) throw upErr;

    // Restrições por projeto (opcional)
    if (data.clientIds.length > 0) {
      const rows = data.clientIds.map((cid) => ({
        brand_id: data.brandId,
        client_id: cid,
        user_id: targetId,
        role: data.role,
        created_by: userId,
      }));
      const { error: cmErr } = await (
        supabaseAdmin.from as never as (t: string) => {
          upsert: (v: unknown, o: { onConflict: string }) => Promise<{ error: unknown }>;
        }
      )("client_members").upsert(rows, { onConflict: "client_id,user_id" });
      if (cmErr) throw cmErr as Error;
    }

    // Status para o toast
    let linkStatus: "added" | "updated" | "already_member" = "added";
    if (mode === "linked" && existingMember) {
      const samePerms =
        Array.isArray(existingMember.permissions) &&
        existingMember.permissions.length === data.permissions.length &&
        (existingMember.permissions as string[]).every((p) =>
          (data.permissions as string[]).includes(p),
        );
      linkStatus = existingMember.role === data.role && samePerms ? "already_member" : "updated";
    }

    // E-mail de credenciais (apenas para conta nova)
    let emailStatus: { sent: boolean; error?: string } = { sent: false, error: "skipped" };
    if (mode === "provisioned" && data.sendEmail && tempPassword) {
      const { data: brand } = await supabase
        .from("brands")
        .select("name")
        .eq("id", data.brandId)
        .maybeSingle();
      let clientNames: string[] = [];
      if (data.clientIds.length > 0) {
        const { data: cRows } = await supabase
          .from("clients")
          .select("name")
          .in("id", data.clientIds);
        clientNames = (cRows ?? []).map((c) => c.name as string);
      }
      const origin = process.env.APP_URL || "";
      emailStatus = await sendCredentialsEmail({
        to: data.email,
        fullName,
        tempPassword,
        loginUrl: `${origin}/auth`,
        workspaces: [{ name: brand?.name ?? "Workspace", clients: clientNames }],
      });
    }

    return {
      mode,
      status: linkStatus,
      email: data.email,
      fullName,
      userId: targetId,
      tempPassword,
      emailStatus,
    };
  });
