import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveAuthorityRole, resolveBrandMemberRole } from "@/lib/access-guard";
import { memberAccessDenial, TEMP_PASSWORD_MIN } from "@/lib/member-access";
import type { SupabaseLike } from "@/lib/email/resend-types";

const Base = z.object({ brandId: z.string().uuid(), userId: z.string().uuid() });

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

async function authorize(supabase: never, actorId: string, brandId: string, targetId: string) {
  const authority = await resolveAuthorityRole(supabase, actorId, brandId);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: member } = await supabaseAdmin
    .from("brand_members").select("user_id").eq("brand_id", brandId).eq("user_id", targetId).maybeSingle();
  if (!member) throw new Error("Esta pessoa não faz parte deste workspace.");
  const targetRole = await resolveBrandMemberRole(supabase, targetId, brandId);
  const { data: profile } = await supabaseAdmin
    .from("user_profiles").select("email, full_name, is_super_admin").eq("id", targetId).maybeSingle();
  const denial = memberAccessDenial({
    actorAuthority: authority, actorId, targetId, targetRole,
    targetIsSuperAdmin: Boolean(profile?.is_super_admin),
  });
  if (denial) throw new Error(denial);
  const { data: authUser, error } = await supabaseAdmin.auth.admin.getUserById(targetId);
  if (error || !authUser?.user?.email) throw new Error("E-mail da pessoa não encontrado.");
  return { supabaseAdmin, email: authUser.user.email, lastSignInAt: authUser.user.last_sign_in_at ?? null, name: profile?.full_name ?? null };
}

async function brandName(supabase: { from: (t: string) => unknown }, brandId: string) {
  const { data } = await (supabase as never as { from: (t: string) => { select: (s: string) => { eq: (a: string, b: string) => { maybeSingle: () => Promise<{ data: { name?: string; nome_fantasia?: string } | null }> } } } })
    .from("brands").select("name, nome_fantasia").eq("id", brandId).maybeSingle();
  return (data?.nome_fantasia || data?.name || "Unitos").trim();
}

async function send(supabase: unknown, brandId: string, to: string, subject: string, body: string) {
  const { sendBrandEmail } = await import("@/lib/email/resend.server");
  const html = `<div style="font-family:ui-sans-serif,system-ui;line-height:1.5;color:#0a0a0a">${body}</div>`;
  const res = await sendBrandEmail(supabase as SupabaseLike, brandId, { to, subject, html });
  if (!res.sent) throw new Error(res.error || "Não foi possível enviar o e-mail.");
}

function passwordBlock(pw: string) {
  return `<div style="margin:16px 0;padding:12px 14px;border:1px solid #e4e4e7;border-radius:8px;background:#fafafa">
    <div style="font-size:12px;color:#71717a">Senha provisória</div>
    <div style="font-family:ui-monospace,Menlo,monospace;font-size:14px;font-weight:600">${esc(pw)}</div>
    <div style="font-size:11px;color:#a1a1aa;margin-top:8px">Você precisará escolher uma nova senha no primeiro acesso.</div></div>`;
}

/** Reenvia o acesso: link de redefinição de senha por e-mail. */
export const resendMemberAccessFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Base.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const t = await authorize(supabase as never, userId, data.brandId, data.userId);
    const { tryInstallationAbsoluteUrl } = await import("@/lib/installation-url.server");
    const loginUrl = await tryInstallationAbsoluteUrl(supabase as never, data.brandId, "/login");
    if (!loginUrl) throw new Error("Não foi possível determinar o endereço desta instalação.");
    const resetBase = await tryInstallationAbsoluteUrl(supabase as never, data.brandId, "/reset-password");
    const { data: link, error } = await t.supabaseAdmin.auth.admin.generateLink({
      type: "recovery", email: t.email, options: { redirectTo: resetBase ?? loginUrl },
    });
    if (error || !link?.properties?.action_link) throw new Error("Não foi possível gerar o link de acesso.");
    const name = await brandName(supabase as never, data.brandId);
    await send(supabase, data.brandId, t.email, `Seu acesso ao ${name}`,
      `<h2 style="margin:0 0 12px">Seu acesso ao ${esc(name)}</h2>
       <p>Use o botão abaixo para definir sua senha e entrar.</p>
       <p><a href="${esc(link.properties.action_link)}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Definir senha e entrar</a></p>
       <p style="color:#71717a;font-size:12px">Endereço de acesso: ${esc(loginUrl)}</p>`);
    const { logCriticalAction } = await import("@/lib/critical-audit.server");
    await logCriticalAction(supabase as never, {
      action: "member.reset_password", actorId: userId, targetId: data.userId, targetLabel: t.email,
      brandId: data.brandId, impact: { mode: "resend_access_email" },
    });
    return { ok: true, email: t.email };
  });

/** Define senha provisória; a pessoa troca no próximo login. */
export const setTemporaryPasswordFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    Base.extend({ password: z.string().min(TEMP_PASSWORD_MIN).max(72), sendEmail: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const t = await authorize(supabase as never, userId, data.brandId, data.userId);
    const { error } = await t.supabaseAdmin.auth.admin.updateUserById(data.userId, { password: data.password });
    if (error) throw new Error("Não foi possível definir a senha: " + error.message);
    const { error: pErr } = await t.supabaseAdmin.from("user_profiles")
      .update({ requires_password_change: true }).eq("id", data.userId);
    if (pErr) throw new Error("Senha definida, mas não foi possível exigir a troca no próximo login.");
    let emailed = false;
    if (data.sendEmail) {
      const { tryInstallationAbsoluteUrl } = await import("@/lib/installation-url.server");
      const loginUrl = await tryInstallationAbsoluteUrl(supabase as never, data.brandId, "/login");
      const name = await brandName(supabase as never, data.brandId);
      await send(supabase, data.brandId, t.email, `Sua senha provisória do ${name}`,
        `<h2 style="margin:0 0 12px">Senha provisória</h2>
         <p>Um administrador definiu uma senha provisória para você entrar no ${esc(name)} com o e-mail <strong>${esc(t.email)}</strong>.</p>
         ${passwordBlock(data.password)}
         ${loginUrl ? `<p><a href="${esc(loginUrl)}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Entrar</a></p>` : ""}`);
      emailed = true;
    }
    const { logCriticalAction } = await import("@/lib/critical-audit.server");
    await logCriticalAction(supabase as never, {
      action: "member.reset_password", actorId: userId, targetId: data.userId, targetLabel: t.email,
      brandId: data.brandId, impact: { mode: "temporary_password", emailed },
    });
    return { ok: true, emailed };
  });
