import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { callRpc } from "@/lib/supabase-rpc";

const BootstrapInput = z.object({
	activationCode: z.string().trim().min(24).max(256),
	fullName: z.string().trim().min(3).max(120),
	workspaceName: z.string().trim().min(2).max(80),
	email: z.string().trim().toLowerCase().email(),
	password: z.string().min(8).max(128),
});

/** O cadastro público fica fechado; o serviço valida o código de uso único. */
export const completeInstallationBootstrap = createServerFn({ method: "POST" })
	.inputValidator((input: unknown) => BootstrapInput.parse(input))
	.handler(async ({ data }) => {
		const { supabaseAdmin } = await import(
			"@/integrations/supabase/client.server"
		);
		const { data: created, error: createError } =
			await supabaseAdmin.auth.admin.createUser({
				email: data.email,
				password: data.password,
				email_confirm: true,
				user_metadata: { full_name: data.fullName },
			});
		const userId = created.user?.id ?? null;
		if (createError || !userId) {
			throw new Error(
				"Não foi possível concluir a ativação. Confira o código e tente novamente.",
			);
		}

		try {
			const { error } = await callRpc(
				supabaseAdmin,
				"complete_installation_bootstrap_service",
				{
					_user_id: userId,
					_secret: data.activationCode,
					_full_name: data.fullName,
					_workspace_name: data.workspaceName,
				},
			);
			if (error) throw error;
			return { ok: true } as const;
		} catch (error) {
			await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => null);
			console.error("[installation-bootstrap] activation failed", {
				error: error instanceof Error ? error.message : "unknown",
			});
			throw new Error(
				"Não foi possível concluir a ativação. Confira o código e tente novamente.",
			);
		}
	});
