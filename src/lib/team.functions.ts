import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
	assertBrandAdmin,
	assertCanGrantBrandRole,
	assertCanManageBrandMember,
	resolveAuthorityRole,
} from "@/lib/access-guard";
import { assertConfirmLabel } from "@/lib/critical-actions";
import type { SupabaseLike } from "@/lib/email/resend-types";
import { normalizeModulePermissions } from "@/lib/module-permissions";
import {
	ALL_PERMISSION_IDS,
	normalizePermissions,
	type PermissionId,
} from "@/lib/permissions";
import { callRpc } from "@/lib/supabase-rpc";

const ROLES = ["owner", "admin", "manager", "user", "client"] as const;
/**
 * Papéis atribuíveis a membros internos (Portal usa `client`).
 * A autoridade real é da matriz canônica do banco (`can_invite_brand_role`):
 * OWNER só pode ser concedido por SUPER ADMIN.
 */
const ASSIGNABLE = ["owner", "admin", "manager", "user"] as const;

const BrandIdInput = z.object({ brandId: z.string().uuid() });

export const listBrandTeam = createServerFn({ method: "GET" })
	.middleware([requireSupabaseAuth])
	.inputValidator((input: unknown) => BrandIdInput.parse(input))
	.handler(async ({ data, context }) => {
		const { supabase } = context;
		const [membersRes, invitesRes, clientsRes] = await Promise.all([
			supabase
				.from("brand_members")
				.select(
					"brand_id, user_id, role, permissions, created_at, access_profile_id, module_permissions",
				)
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
				.select(
					"id, token, label, client_id, expires_at, revoked_at, last_seen_at, created_at",
				)
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
		let profiles: Array<{
			id: string;
			full_name: string | null;
			email: string | null;
			avatar_url: string | null;
			is_super_admin: boolean | null;
		}> = [];
		if (userIds.length > 0) {
			const { data: profs } = await supabase
				.from("user_profiles")
				.select("id, full_name, email, avatar_url, is_super_admin")
				.in("id", userIds);
			profiles = (profs ?? []) as typeof profiles;
		}
		const visibleMembers = members.filter((m) => {
			const profile = profiles.find((p) => p.id === m.user_id);
			return profile && profile.is_super_admin !== true;
		});
		return {
			members: visibleMembers.map((m) => {
				const p = profiles.find((x) => x.id === m.user_id);
				return {
					user_id: m.user_id,
					role: m.role as (typeof ROLES)[number],
					permissions: normalizePermissions(m.permissions),
					access_profile_id: m.access_profile_id ?? null,
					module_permissions: normalizeModulePermissions(m.module_permissions),
					created_at: m.created_at,
					full_name: p?.full_name ?? null,
					email: p?.email ?? null,
					avatar_url: p?.avatar_url ?? null,
				};
			}),
			invites: ((invitesRes.data ?? []) as Array<Record<string, unknown>>).map(
				(i) => ({
					...i,
					permissions: normalizePermissions(i.permissions as never),
				}),
			) as Array<{
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
	permissions: z
		.array(z.enum(ALL_PERMISSION_IDS as [PermissionId, ...PermissionId[]]))
		.default([]),
	expiresAt: z.string().datetime().optional(),
	/** Perfil de acesso aplicado quando o convite for aceito. */
	accessProfileId: z.string().uuid().nullable().optional(),
});

function randomToken(bytes = 24): string {
	const arr = new Uint8Array(bytes);
	crypto.getRandomValues(arr);
	return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sendInviteEmail(opts: {
	supabase: SupabaseLike;
	brandId: string;
	to: string;
	brandName: string;
	inviterName: string;
	acceptUrl: string;
	inviteRole?: string;
	actorUserId?: string | null;
}): Promise<{ sent: boolean; error?: string }> {
	// 1) Caminho canônico: template `team_invite` (da marca ou default do catálogo)
	//    renderizado com contexto REAL, sem transportar credenciais.
	const { sendEventEmail } = await import(
		"@/lib/message-templates/dispatch.server"
	);
	const viaTemplate = await sendEventEmail(opts.supabase as never, {
		eventKey: "team_invite",
		to: opts.to,
		actorUserId: opts.actorUserId ?? null,
		context: {
			brandId: opts.brandId,
			user: {
				fullName: opts.inviterName,
				email: opts.to,
				role: opts.inviteRole ?? null,
			},
			invite: {
				url: opts.acceptUrl,
				role: opts.inviteRole ?? null,
			},
		},
	});
	if (viaTemplate.sent) return { sent: true };

	// 2) Fallback mínimo sem senha ou qualquer outro segredo.
	const html = `
    <div style="font-family:ui-sans-serif,system-ui;line-height:1.5;color:#0a0a0a">
      <h2 style="margin:0 0 12px">Convite para ${opts.brandName}</h2>
      <p>${opts.inviterName} convidou você para colaborar na marca <strong>${opts.brandName}</strong> no Unitos.</p>
      <p><a href="${opts.acceptUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Aceitar convite</a></p>
      <p style="color:#71717a;font-size:12px">Se o botão não funcionar, copie o link: ${opts.acceptUrl}</p>
    </div>`;
	const { sendBrandEmail } = await import("@/lib/email/resend.server");
	const res = await sendBrandEmail(opts.supabase, opts.brandId, {
		to: opts.to,
		subject: `Convite para ${opts.brandName}`,
		html,
	});
	if (!res.sent)
		console.error(
			`[invite email] não enviado: ${res.error ?? viaTemplate.error}`,
		);
	return { sent: res.sent, ...(res.error ? { error: res.error } : {}) };
}

export const inviteBrandMembers = createServerFn({ method: "POST" })
	.middleware([requireSupabaseAuth])
	.inputValidator((input: unknown) => InviteInput.parse(input))
	.handler(async ({ data, context }) => {
		const { supabase, userId } = context;
		// Authorize: caller must be owner or manager of the brand
		// Autorização canônica: super_admin, ADMIN (owner) ou MANAGER do workspace.
		// `user_profiles.role='admin'` não concede autoridade global.
		try {
			await assertBrandAdmin(supabase, userId, data.brandId);
		} catch {
			throw new Error("forbidden");
		}

		const { data: brand } = await supabase
			.from("brands")
			.select("name, nome_fantasia")
			.eq("id", data.brandId)
			.single();
		const { data: inviterProfile } = await supabase
			.from("user_profiles")
			.select("full_name")
			.eq("id", userId)
			.maybeSingle();
		const inviterName = inviterProfile?.full_name || "Alguém do time";
		// Nome da agência SEMPRE da marca do convite (nunca placeholder/sample).
		const brandName = (brand?.nome_fantasia || brand?.name || "").trim();
		if (!brandName) throw new Error("brand_sem_nome");

		// Perfil de acesso do convite: validado contra o workspace, gravado por
		// `key` para ser reaplicado quando o convite for aceito.
		let inviteProfileKey: string | null = null;
		if (data.accessProfileId) {
			const { data: prof, error: pErr } = await supabase
				.from("access_profiles")
				.select("key")
				.eq("id", data.accessProfileId)
				.eq("brand_id", data.brandId)
				.maybeSingle();
			if (pErr) throw pErr;
			if (!prof) throw new Error("invalid_access_profile");
			inviteProfileKey = prof.key;
		}

		const { supabaseAdmin } = await import(
			"@/integrations/supabase/client.server"
		);

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

			// Autoridade canônica do papel concedido (espelha can_invite_brand_role).
			// Falha aqui é erro de autoridade, não silencioso rebaixamento para USER.
			try {
				await assertCanGrantBrandRole(
					supabase,
					userId,
					data.brandId,
					data.role,
					email,
				);
			} catch (e) {
				results.push({
					email,
					status: "error",
					error: e instanceof Error ? e.message : "role_authority_invalid",
				});
				continue;
			}

			// Conta nova recebe um link único do Supabase; nenhuma senha é criada,
			// persistida, devolvida ou enviada por e-mail.
			let provisioned = false;
			let createdUserId: string | null = null;
			const { tryInstallationAbsoluteUrl } = await import(
				"@/lib/installation-url.server"
			);
			const inviteUrl = await tryInstallationAbsoluteUrl(
				supabase,
				data.brandId,
				`/invite/${token}`,
			);
			if (!inviteUrl) {
				results.push({
					email,
					status: "error",
					error: "instalacao_url_desconhecida",
				});
				continue;
			}
			let acceptUrl = inviteUrl;
			try {
				const { data: existing } = await supabaseAdmin.auth.admin.listUsers({
					page: 1,
					perPage: 200,
				});
				const alreadyExists = existing?.users?.some(
					(u) => (u.email ?? "").toLowerCase() === email,
				);
				if (!alreadyExists) {
					const { data: generated, error: createErr } =
						await supabaseAdmin.auth.admin.generateLink({
							type: "invite",
							email,
							options: { redirectTo: inviteUrl },
						});
					if (createErr) {
						results.push({
							email,
							status: "error",
							error: `provision_${createErr.message}`,
						});
						continue;
					}
					if (generated.user?.id && generated.properties?.action_link) {
						createdUserId = generated.user.id;
						acceptUrl = generated.properties.action_link;
						const { ensureUserProfile } = await import(
							"@/lib/user-profile.server"
						);
						await ensureUserProfile(supabaseAdmin, {
							userId: generated.user.id,
							email,
							requiresPasswordChange: true,
						});
						provisioned = true;
					}
				}
			} catch (e) {
				console.error("[invite provision] failed", e);
				if (createdUserId)
					await supabaseAdmin.auth.admin.deleteUser(createdUserId);
				results.push({
					email,
					status: "error",
					error: e instanceof Error ? e.message : "profile_provision_failed",
				});
				continue;
			}

			const insertPayload = {
				brand_id: data.brandId,
				...(inviteProfileKey ? { access_profile_key: inviteProfileKey } : {}),
				email,
				role: data.role,
				permissions: data.permissions,
				token,
				invited_by: userId,
				temp_password_sent: false,
				...(data.expiresAt ? { expires_at: data.expiresAt } : {}),
			};
			const { error: inviteErr } = await supabase
				.from("brand_invites")
				.insert(insertPayload);
			if (inviteErr) {
				console.error("[brand_invites] insert failed", {
					email,
					error: inviteErr,
				});
				results.push({ email, status: "error", error: inviteErr.message });
				continue;
			}

			const emailRes = await sendInviteEmail({
				supabase: supabase as unknown as SupabaseLike,
				brandId: data.brandId,
				to: email,
				brandName,
				inviterName,
				acceptUrl,
				inviteRole: data.role,
				actorUserId: userId,
			});

			results.push({
				email,
				status: "invited",
				link: inviteUrl,

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
	permissions: z
		.array(z.enum(ALL_PERMISSION_IDS as [PermissionId, ...PermissionId[]]))
		.optional(),
});

export const updateBrandMember = createServerFn({ method: "POST" })
	.middleware([requireSupabaseAuth])
	.inputValidator((input: unknown) => UpdateMemberInput.parse(input))
	.handler(async ({ data, context }) => {
		// Autorização explícita no servidor (não confiar na UI nem só na RLS).
		await assertBrandAdmin(context.supabase, context.userId, data.brandId);
		// Matriz canônica única (owner ≠ admin): valida papel do ator, papel atual
		// do alvo e papel pretendido. Somente SUPER ADMIN concede/altera OWNER.
		await assertCanManageBrandMember(
			context.supabase,
			context.userId,
			data.brandId,
			data.userId,
			data.role ?? null,
		);
		const patch: {
			role?: (typeof ROLES)[number];
			permissions?: PermissionId[];
		} = {};
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

const RemoveMemberInput = z.object({
	brandId: z.string().uuid(),
	userId: z.string().uuid(),
	/** E-mail exato do membro, digitado na dupla confirmação. */
	confirmLabel: z.string().min(1),
});
export const removeBrandMember = createServerFn({ method: "POST" })
	.middleware([requireSupabaseAuth])
	.inputValidator((input: unknown) => RemoveMemberInput.parse(input))
	.handler(async ({ data, context }) => {
		await assertBrandAdmin(context.supabase, context.userId, data.brandId);
		await assertCanManageBrandMember(
			context.supabase,
			context.userId,
			data.brandId,
			data.userId,
		);
		const { data: target, error: targetError } = await context.supabase
			.from("user_profiles")
			.select("id,email,full_name")
			.eq("id", data.userId)
			.maybeSingle();
		if (targetError) throw targetError;
		const label =
			(target?.email as string | null) ??
			(target?.full_name as string | null) ??
			null;
		assertConfirmLabel(data.confirmLabel, label);
		const { logCriticalAction } = await import("@/lib/critical-audit.server");
		await logCriticalAction(context.supabase as never, {
			action: "member.remove",
			actorId: context.userId,
			targetId: data.userId,
			targetLabel: label,
			brandId: data.brandId,
		});
		const { error } = await context.supabase
			.from("brand_members")
			.delete()
			.eq("brand_id", data.brandId)
			.eq("user_id", data.userId);
		if (error) throw error;
		return { ok: true };
	});

const RevokeInviteInput = z.object({
	brandId: z.string().uuid(),
	inviteId: z.string().uuid(),
	/** E-mail exato do convite, digitado na dupla confirmação. */
	confirmLabel: z.string().min(1),
});
export const revokeBrandInvite = createServerFn({ method: "POST" })
	.middleware([requireSupabaseAuth])
	.inputValidator((input: unknown) => RevokeInviteInput.parse(input))
	.handler(async ({ data, context }) => {
		await assertBrandAdmin(context.supabase, context.userId, data.brandId);
		const { data: invite, error: inviteError } = await context.supabase
			.from("brand_invites")
			.select("id,email")
			.eq("id", data.inviteId)
			.eq("brand_id", data.brandId)
			.maybeSingle();
		if (inviteError) throw inviteError;
		if (!invite) throw new Error("Convite não encontrado.");
		assertConfirmLabel(data.confirmLabel, invite.email as string);
		const { logCriticalAction } = await import("@/lib/critical-audit.server");
		await logCriticalAction(context.supabase as never, {
			action: "invite.revoke",
			actorId: context.userId,
			targetId: data.inviteId,
			targetLabel: invite.email as string,
			brandId: data.brandId,
		});
		const { error } = await context.supabase
			.from("brand_invites")
			.update({
				revoked_at: new Date().toISOString(),
				revoked_by: context.userId,
			})
			.eq("id", data.inviteId)
			.eq("brand_id", data.brandId)
			.is("accepted_at", null);
		if (error) throw error;
		return { ok: true };
	});

const ResendInviteInput = z.object({
	brandId: z.string().uuid(),
	inviteId: z.string().uuid(),
	email: z.string().trim().toLowerCase().email().optional(),
});

/** Renova o link de um convite pendente e, opcionalmente, troca seu destinatário. */
export const resendBrandInvite = createServerFn({ method: "POST" })
	.middleware([requireSupabaseAuth])
	.inputValidator((input: unknown) => ResendInviteInput.parse(input))
	.handler(async ({ data, context }) => {
		const { supabase, userId } = context;
		await assertBrandAdmin(supabase, userId, data.brandId);

		const { data: invite, error: inviteError } = await supabase
			.from("brand_invites")
			.select("id,email,role,accepted_at,revoked_at,temp_password_sent")
			.eq("id", data.inviteId)
			.eq("brand_id", data.brandId)
			.maybeSingle();
		if (inviteError) throw inviteError;
		if (!invite) throw new Error("Convite não encontrado.");
		if (invite.accepted_at || invite.revoked_at) {
			throw new Error("Somente convites pendentes podem ser reenviados.");
		}

		const previousEmail = String(invite.email).trim().toLowerCase();
		const nextEmail = data.email ?? previousEmail;
		await assertCanGrantBrandRole(
			supabase,
			userId,
			data.brandId,
			invite.role as (typeof ASSIGNABLE)[number],
			nextEmail,
		);

		const { data: duplicate } = await supabase
			.from("brand_invites")
			.select("id")
			.eq("brand_id", data.brandId)
			.ilike("email", nextEmail)
			.is("accepted_at", null)
			.is("revoked_at", null)
			.neq("id", data.inviteId)
			.maybeSingle();
		if (duplicate)
			throw new Error("Já existe um convite pendente para este e-mail.");

		const { data: brand } = await supabase
			.from("brands")
			.select("name, nome_fantasia")
			.eq("id", data.brandId)
			.single();
		const { data: inviterProfile } = await supabase
			.from("user_profiles")
			.select("full_name")
			.eq("id", userId)
			.maybeSingle();
		const brandName = (brand?.nome_fantasia || brand?.name || "").trim();
		if (!brandName) throw new Error("brand_sem_nome");

		const token = randomToken();
		const expiresAt = new Date(Date.now() + 14 * 86_400_000).toISOString();
		const { supabaseAdmin } = await import(
			"@/integrations/supabase/client.server"
		);

		const { error: updateError } = await supabaseAdmin
			.from("brand_invites")
			.update({ email: nextEmail, token, expires_at: expiresAt })
			.eq("id", data.inviteId)
			.eq("brand_id", data.brandId)
			.is("accepted_at", null)
			.is("revoked_at", null);
		if (updateError) throw updateError;

		const { tryInstallationAbsoluteUrl } = await import(
			"@/lib/installation-url.server"
		);
		const link = await tryInstallationAbsoluteUrl(
			supabase,
			data.brandId,
			`/invite/${token}`,
		);
		if (!link)
			throw new Error("Não foi possível determinar a URL desta instalação.");
		const sent = await sendInviteEmail({
			supabase: supabase as unknown as SupabaseLike,
			brandId: data.brandId,
			to: nextEmail,
			brandName,
			inviterName: inviterProfile?.full_name || "Alguém do time",
			acceptUrl: link,
			inviteRole: String(invite.role),
			actorUserId: userId,
		});
		if (!sent.sent)
			throw new Error(sent.error || "Não foi possível enviar o convite.");
		const { logCriticalAction } = await import("@/lib/critical-audit.server");
		await logCriticalAction(supabase as never, {
			action:
				nextEmail === previousEmail ? "invite.resend" : "invite.email_update",
			actorId: userId,
			targetId: data.inviteId,
			targetLabel: nextEmail,
			brandId: data.brandId,
			impact: {
				emailChanged: nextEmail !== previousEmail,
				expiresAt,
			},
		});
		return { ok: true, email: nextEmail, expiresAt, token };
	});

const RevokePortalInput = z.object({
	brandId: z.string().uuid(),
	tokenId: z.string().uuid(),
});
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
		const { data: brandId, error } = await context.supabase.rpc(
			"accept_brand_invite",
			{
				_token: data.token,
			},
		);
		if (error) throw error;

		// Aplica o perfil de acesso escolhido no convite (permissões por módulo).
		// Best-effort: nunca impede a entrada do usuário no workspace.
		if (typeof brandId === "string" && brandId) {
			try {
				const { data: invite } = await context.supabase
					.from("brand_invites")
					.select("access_profile_key")
					.eq("token", data.token)
					.maybeSingle();
				const key = invite?.access_profile_key ?? null;
				if (key) {
					const { supabaseAdmin } = await import(
						"@/integrations/supabase/client.server"
					);
					const { data: prof } = await supabaseAdmin
						.from("access_profiles")
						.select("id")
						.eq("brand_id", brandId)
						.eq("key", key)
						.maybeSingle();
					if (prof?.id) {
						await supabaseAdmin
							.from("brand_members")
							.update({ access_profile_id: prof.id })
							.eq("brand_id", brandId)
							.eq("user_id", context.userId);
					}
				}
			} catch (e) {
				console.error("[accept invite] perfil de acesso não aplicado", e);
			}
		}
		return { brandId };
	});

const AddExistingInput = z.object({
	brandId: z.string().uuid(),
	email: z.string().trim().toLowerCase().email(),
	role: z.enum(ASSIGNABLE).default("user"),
	permissions: z
		.array(z.enum(ALL_PERMISSION_IDS as [PermissionId, ...PermissionId[]]))
		.default([]),
});

// ============================================================================
// Provisionamento manual de usuários com senha temporária e escopo por projeto
// ============================================================================

const AssignmentInput = z.object({
	brandId: z.string().uuid(),
	role: z.enum(ASSIGNABLE).default("user"),
	permissions: z
		.array(z.enum(ALL_PERMISSION_IDS as [PermissionId, ...PermissionId[]]))
		.default([]),
	clientIds: z.array(z.string().uuid()).default([]),
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
		const isSuper = Boolean(
			(adminFlag as { is_super_admin?: boolean } | null)?.is_super_admin,
		);
		// Somente SUPER ADMIN é autoridade de plataforma. ADMIN provisiona apenas
		// nos workspaces em que é membro (`user_profiles.role='admin'` não escala).
		const globalRole = await resolveAuthorityRole(supabase, userId, null);
		const isGlobalAuthority = isSuper || globalRole === "super_admin";

		let brandsQuery = supabase.from("brands").select("id, name").order("name");
		if (!isGlobalAuthority) {
			const { data: memberships, error: mErr } = await supabase
				.from("brand_members")
				.select("brand_id, role")
				.eq("user_id", userId)
				.eq("is_active", true)
				.in("role", ["owner", "admin", "manager"]);
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
		const clientsByBrand = new Map<
			string,
			Array<{ id: string; name: string }>
		>();
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

/**
 * Erros do RPC `link_existing_user_to_brand` chegam como mensagens do Postgres.
 * Traduzimos para causas reais e compreensíveis — sem fallback silencioso.
 */
function mapLinkError(message: string): string {
	if (/not_authenticated/.test(message))
		return "Sessão expirada. Entre novamente.";
	if (/forbidden/.test(message))
		return "Apenas Admin, Manager ou Super Admin podem vincular contas.";
	if (/role_authority_invalid/.test(message))
		return "Seu papel não permite conceder esse papel nesta marca.";
	if (/self_promotion_blocked/.test(message))
		return "Não é possível alterar o seu próprio papel.";
	return message;
}

export const addExistingUserToBrand = createServerFn({ method: "POST" })
	.middleware([requireSupabaseAuth])
	.inputValidator((input: unknown) => AddExistingInput.parse(input))
	.handler(async ({ data, context }) => {
		const { supabase, userId } = context;
		// Autorização canônica (super_admin, owner/ADMIN, manager do workspace).
		try {
			await assertBrandAdmin(supabase, userId, data.brandId);
		} catch {
			throw new Error("forbidden");
		}

		type LinkExistingUserRow = {
			status: "added" | "updated" | "already_member" | "not_found";
			email: string;
			user_id: string | null;
			full_name: string | null;
		};

		const { data: linkedRows, error: linkErr } = await callRpc<
			LinkExistingUserRow[] | LinkExistingUserRow | null
		>(supabase, "link_existing_user_to_brand", {
			_brand_id: data.brandId,
			_email: data.email,
			_role: data.role,
			_permissions: data.permissions,
		});
		if (linkErr) throw new Error(mapLinkError(linkErr.message));

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
			return {
				invite: null,
				brand: null as null | { name: string; color: string | null },
			};
		const { data: brand } = await context.supabase
			.from("brands")
			.select("name, color")
			.eq("id", invite.brand_id)
			.maybeSingle();
		return {
			invite: {
				...invite,
				permissions: normalizePermissions(invite.permissions),
			},
			brand: brand ?? null,
		};
	});
