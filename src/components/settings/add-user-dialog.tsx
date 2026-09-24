import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Mail, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { invitableRoles, ROLE_LABEL } from "@/components/settings/team-shared";
import { Button } from "@/components/ui/button";
import { EmailTagsInput } from "@/components/ui/email-tags-input";
import {
	EXPANDED_MODAL_TABS_BODY,
	ExpandedModal,
} from "@/components/ui/expanded-modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAccessRole } from "@/hooks/use-access-role";
import { listAccessProfiles } from "@/lib/access-profiles.functions";
import { inviteBrandMembers } from "@/lib/team.functions";
import type { BrandRole } from "@/lib/team-admin.functions";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Adiciona colaboradores por convite de uso único. A pessoa define a própria
 * senha; nenhuma credencial temporária é criada ou exposta.
 */
export function AddUserDialog({
	open,
	onOpenChange,
	brandId,
	onDone,
}: {
	open: boolean;
	onOpenChange: (v: boolean) => void;
	brandId: string;
	onDone?: () => void;
}) {
	const qc = useQueryClient();
	const { authorityRole } = useAccessRole();
	const roleOptions = invitableRoles(authorityRole);
	const loadProfiles = useServerFn(listAccessProfiles);
	const invite = useServerFn(inviteBrandMembers);

	const profilesQ = useQuery({
		queryKey: ["access-profiles", brandId],
		queryFn: () => loadProfiles({ data: { brandId } }),
		enabled: open && !!brandId,
	});
	const profiles = profilesQ.data?.profiles ?? [];

	const [inviteEmails, setInviteEmails] = useState<string[]>([]);
	const [role, setRole] = useState<BrandRole>("user");
	const [profileId, setProfileId] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		if (open) return;
		setInviteEmails([]);
		setRole("user");
		setProfileId(null);
	}, [open]);

	useEffect(() => {
		if (profileId || profiles.length === 0) return;
		const preset = profiles.find((p) => p.key === "atendimento") ?? profiles[0];
		if (preset) setProfileId(preset.id);
	}, [profiles, profileId]);

	const refresh = () => {
		qc.invalidateQueries({ queryKey: ["brand-team", brandId] });
		qc.invalidateQueries({ queryKey: ["team-members", brandId] });
		onDone?.();
	};

	const submitInvite = async () => {
		if (inviteEmails.length === 0)
			return toast.error("Adicione ao menos um e-mail.");
		setBusy(true);
		try {
			await invite({
				data: {
					brandId,
					emails: inviteEmails,
					role,
					accessProfileId: profileId,
				},
			});
			toast.success(
				inviteEmails.length > 1 ? "Convites enviados." : "Convite enviado.",
			);
			refresh();
			onOpenChange(false);
		} catch (e) {
			toast.error(
				e instanceof Error ? e.message : "Não foi possível convidar.",
			);
		} finally {
			setBusy(false);
		}
	};

	const roleFields = (
		<>
			<div className="grid gap-2 sm:grid-cols-2">
				<div className="grid gap-2">
					<Label>Papel no workspace</Label>
					<Select value={role} onValueChange={(v) => setRole(v as BrandRole)}>
						<SelectTrigger className="h-9">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{roleOptions.map((r) => (
								<SelectItem key={r} value={r}>
									{ROLE_LABEL[r]}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="grid gap-2">
					<Label>Perfil de acesso inicial</Label>
					<Select
						value={profileId ?? "none"}
						onValueChange={(v) => setProfileId(v === "none" ? null : v)}
						disabled={profilesQ.isLoading}
					>
						<SelectTrigger className="h-9">
							<SelectValue placeholder="Selecione" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="none">Sem perfil (definir depois)</SelectItem>
							{profiles.map((p) => (
								<SelectItem key={p.id} value={p.id}>
									{p.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>
			<p className="text-xs text-muted-foreground">
				O perfil define o que a pessoa pode fazer em cada módulo. Depois é
				possível ajustar módulo por módulo em Permissões. Papéis{" "}
				<strong>Admin</strong> e <strong>Manager</strong> já têm acesso total,
				independentemente do perfil.
			</p>
		</>
	);

	return (
		<ExpandedModal
			open={open}
			onOpenChange={onOpenChange}
			size="sm"
			bodyClassName={EXPANDED_MODAL_TABS_BODY}
			title={
				<span className="flex items-center gap-2">
					<UserPlus className="h-4 w-4 text-primary" /> Adicionar usuário
				</span>
			}
			description="Envie um link seguro para cada pessoa criar a própria senha."
		>
			<Tabs value="invite" className="flex flex-1 flex-col overflow-hidden">
				<div className="border-b border-border/60 px-6 pt-4">
					<TabsList className="grid w-full grid-cols-1">
						<TabsTrigger value="invite" className="gap-2">
							<Mail className="h-3.5 w-3.5" /> Convidar por e-mail
						</TabsTrigger>
					</TabsList>
				</div>

				<TabsContent
					value="invite"
					className="flex-1 space-y-4 overflow-y-auto px-6 py-5 data-[state=inactive]:hidden"
				>
					<div className="grid gap-2">
						<Label htmlFor="add-user-emails">E-mails</Label>
						<EmailTagsInput
							id="add-user-emails"
							value={inviteEmails}
							onChange={setInviteEmails}
							placeholder="pessoa@agencia.com.br"
							hint="Enter, vírgula ou espaço para adicionar. Você pode convidar várias pessoas de uma vez."
							disabled={busy}
						/>
					</div>
					{roleFields}
					<div className="flex justify-end gap-2">
						<Button variant="outline" onClick={() => onOpenChange(false)}>
							Cancelar
						</Button>
						<Button
							onClick={submitInvite}
							disabled={busy || inviteEmails.length === 0}
						>
							{busy ? (
								<Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
							) : null}
							Enviar convite{inviteEmails.length > 1 ? "s" : ""}
						</Button>
					</div>
				</TabsContent>
			</Tabs>
		</ExpandedModal>
	);
}
