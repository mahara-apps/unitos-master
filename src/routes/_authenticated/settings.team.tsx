import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  listBrandTeam,
  inviteBrandMembers,
  updateBrandMember,
  removeBrandMember,
  revokeBrandInvite,
  revokePortalTokenFromTeam,
} from "@/lib/team.functions";
import { PERMISSION_GROUPS, type PermissionId } from "@/lib/permissions";
import { useActiveContext } from "@/hooks/use-active-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, UserPlus, Copy, X, Loader2, CalendarIcon, Link2, ShieldOff, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { usePageHeader } from "@/hooks/use-page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SettingsStatCard } from "@/components/settings/settings-stat-card";
import { Users, Mail as MailIcon, Link as LinkIcon, Crown } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings/team")({
  component: TeamSettingsPage,
});

function initials(name?: string | null, email?: string | null) {
  const src = (name || email || "?").trim();
  return src.split(/\s+/).slice(0, 2).map((s) => s[0]?.toUpperCase() ?? "").join("") || "?";
}

function TeamSettingsPage() {
  const { brandId } = useActiveContext();
  const qc = useQueryClient();
  const load = useServerFn(listBrandTeam);
  const { data, isLoading } = useQuery({
    queryKey: ["brand-team", brandId],
    queryFn: () => load({ data: { brandId: brandId! } }),
    enabled: !!brandId,
  });

  const [open, setOpen] = useState(false);

  usePageHeader(
    {
      title: "Equipe",
      subtitle: "Membros, permissões e convites da marca",
      actions: brandId ? (
        <Button size="sm" onClick={() => setOpen(true)}>
          <UserPlus className="h-4 w-4 mr-2" />
          Convidar
        </Button>
      ) : undefined,
    },
    [brandId],
  );

  if (!brandId) {
    return (
      <div className="w-full px-4 py-6 sm:px-6 lg:px-8">
        <p className="text-sm text-muted-foreground">Selecione uma marca no menu lateral para gerenciar a equipe.</p>
      </div>
    );
  }

  const members = data?.members ?? [];
  const invitesAll = data?.invites ?? [];
  const pendingInvites = invitesAll.filter((i) => !i.accepted_at && !i.revoked_at);
  const portalTokens = (data?.portalTokens ?? []).filter((t) => !t.revoked_at);
  const owners = members.filter((m) => m.role === "owner").length;

  return (
    <div className="w-full space-y-4 px-4 py-6 sm:px-6 lg:px-8">
      <Dialog open={open} onOpenChange={setOpen}>
        <InviteDialog
          brandId={brandId}
          onDone={() => {
            setOpen(false);
            qc.invalidateQueries({ queryKey: ["brand-team", brandId] });
          }}
        />
      </Dialog>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SettingsStatCard label="Membros" value={members.length} icon={<Users className="h-3.5 w-3.5" />} tone="sky" />
        <SettingsStatCard label="Convites pendentes" value={pendingInvites.length} icon={<MailIcon className="h-3.5 w-3.5" />} tone={pendingInvites.length > 0 ? "amber" : "neutral"} />
        <SettingsStatCard label="Portais ativos" value={portalTokens.length} icon={<LinkIcon className="h-3.5 w-3.5" />} tone="violet" />
        <SettingsStatCard label="Owners" value={owners} icon={<Crown className="h-3.5 w-3.5" />} tone="emerald" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Membros da equipe</CardTitle>
          <CardDescription>Usuários com acesso a esta marca e suas permissões.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="grid grid-cols-[minmax(0,1fr)_140px_1fr_60px] items-center gap-4 border-y border-border/60 bg-muted/30 px-4 py-2 text-[11px] uppercase tracking-wider text-muted-foreground">
            <div>Membro</div>
            <div>Papel</div>
            <div>Permissões</div>
            <div />
          </div>
          {isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Carregando…</div>
          ) : members.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Nenhum membro nesta marca.</div>
          ) : (
            <ul>
              {members.map((m) => (
                <MemberRow key={m.user_id} brandId={brandId} member={m} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Convites pendentes</CardTitle>
          <CardDescription>Convites ainda não aceitos ou expirados.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {invitesAll.filter((i) => !i.accepted_at).length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">Nenhum convite pendente.</div>
          ) : (
            <ul>
              {invitesAll.filter((i) => !i.accepted_at).map((i) => (
                <InviteRow key={i.id} brandId={brandId} invite={i} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Acessos do portal do cliente</CardTitle>
          <CardDescription>Links white-label de portal por conta.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {(data?.portalTokens ?? []).length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">Nenhum link de portal ativo.</div>
          ) : (
            <ul>
              {data!.portalTokens.map((t) => (
                <PortalTokenRow key={t.id} brandId={brandId} token={t} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MemberRow({ brandId, member }: {
  brandId: string;
  member: { user_id: string; role: string; permissions: PermissionId[]; full_name: string | null; email: string | null };
}) {
  const qc = useQueryClient();
  const update = useServerFn(updateBrandMember);
  const remove = useServerFn(removeBrandMember);
  const [editOpen, setEditOpen] = useState(false);
  const removeMut = useMutation({
    mutationFn: () => remove({ data: { brandId, userId: member.user_id } }),
    onSuccess: () => { toast.success("Membro removido"); qc.invalidateQueries({ queryKey: ["brand-team", brandId] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_140px_1fr_60px] items-center gap-4 px-4 py-3 border-b border-border last:border-b-0">
      <div className="flex items-center gap-3 min-w-0">
        <Avatar className="h-8 w-8"><AvatarFallback className="text-[11px]">{initials(member.full_name, member.email)}</AvatarFallback></Avatar>
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">{member.full_name || "—"}</div>
          <div className="text-xs text-muted-foreground truncate">{member.email ?? "sem email"}</div>
        </div>
      </div>
      <div><Badge variant="secondary" className="capitalize">{member.role}</Badge></div>
      <div className="flex flex-wrap gap-1">
        {member.permissions.length === 0 ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : member.permissions.map((p) => (
          <span key={p} className="text-[11px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{p}</span>
        ))}
      </div>
      <div className="text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost"><MoreHorizontal className="h-4 w-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setEditOpen(true)}>Editar permissões</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive"
              disabled={member.role === "owner" || removeMut.isPending}
              onClick={() => removeMut.mutate()}
            >Remover</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <EditPermissionsDialog
            initialRole={member.role}
            initialPerms={member.permissions}
            onSave={async (role, perms) => {
              await update({ data: { brandId, userId: member.user_id, role: role as never, permissions: perms } });
              toast.success("Permissões atualizadas");
              qc.invalidateQueries({ queryKey: ["brand-team", brandId] });
              setEditOpen(false);
            }}
          />
        </Dialog>
      </div>
    </li>
  );
}

function InviteRow({ brandId, invite }: {
  brandId: string;
  invite: {
    id: string; email: string; role: string; token: string; expires_at: string;
    permissions: PermissionId[]; revoked_at?: string | null; temp_password_sent?: boolean;
  };
}) {
  const qc = useQueryClient();
  const revoke = useServerFn(revokeBrandInvite);
  const link = typeof window !== "undefined" ? `${window.location.origin}/invite/${invite.token}` : "";
  const revokeMut = useMutation({
    mutationFn: () => revoke({ data: { brandId, inviteId: invite.id } }),
    onSuccess: () => { toast.success("Convite revogado"); qc.invalidateQueries({ queryKey: ["brand-team", brandId] }); },
  });
  const isExpired = new Date(invite.expires_at).getTime() < Date.now();
  const isRevoked = Boolean(invite.revoked_at);
  return (
    <li className="flex items-center justify-between gap-4 px-4 py-3 border-b border-border last:border-b-0">
      <div className="min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium truncate">{invite.email}</span>
          {isRevoked && <Badge variant="destructive" className="text-[10px]">Revogado</Badge>}
          {!isRevoked && isExpired && <Badge variant="outline" className="text-[10px]">Expirado</Badge>}
          {invite.temp_password_sent && !isRevoked && (
            <Badge variant="secondary" className="text-[10px]">Senha temporária enviada</Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground">Papel: <span className="capitalize">{invite.role}</span> · Expira em {new Date(invite.expires_at).toLocaleDateString()}</div>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" disabled={isRevoked} onClick={() => { navigator.clipboard.writeText(link); toast.success("Link copiado"); }}>
          <Copy className="h-3.5 w-3.5 mr-1.5" />Copiar link
        </Button>
        <Button size="icon" variant="ghost" onClick={() => revokeMut.mutate()} disabled={revokeMut.isPending || isRevoked} title="Revogar convite">
          <X className="h-4 w-4" />
        </Button>
      </div>
    </li>
  );
}

function PortalTokenRow({ brandId, token }: {
  brandId: string;
  token: {
    id: string; token: string; label: string | null; client_name: string;
    expires_at: string | null; revoked_at: string | null;
    last_seen_at?: string | null; created_at: string;
  };
}) {
  const qc = useQueryClient();
  const revoke = useServerFn(revokePortalTokenFromTeam);
  const link = typeof window !== "undefined" ? `${window.location.origin}/portal/${token.token}` : "";
  const isRevoked = Boolean(token.revoked_at);
  const isExpired = token.expires_at ? new Date(token.expires_at).getTime() < Date.now() : false;
  const daysLeft = token.expires_at ? Math.ceil((new Date(token.expires_at).getTime() - Date.now()) / 86_400_000) : null;
  const soon = !isRevoked && !isExpired && daysLeft !== null && daysLeft <= 3;
  const revokeMut = useMutation({
    mutationFn: () => revoke({ data: { brandId, tokenId: token.id } }),
    onSuccess: () => { toast.success("Acesso revogado"); qc.invalidateQueries({ queryKey: ["brand-team", brandId] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <li className="flex items-center justify-between gap-4 px-4 py-3 border-b border-border last:border-b-0">
      <div className="min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <Link2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium truncate">{token.label || "Portal do cliente"}</span>
          <span className="text-xs text-muted-foreground truncate">· {token.client_name}</span>
          {isRevoked && <Badge variant="destructive" className="text-[10px]">Revogado</Badge>}
          {!isRevoked && isExpired && <Badge variant="outline" className="text-[10px]">Expirado</Badge>}
          {soon && <Badge variant="outline" className="border-amber-500/40 text-amber-600 text-[10px]">Expira em {daysLeft}d</Badge>}
        </div>
        <div className="text-xs text-muted-foreground">
          {token.expires_at ? `Expira em ${new Date(token.expires_at).toLocaleDateString()}` : "Sem expiração"}
          {token.last_seen_at && ` · último acesso ${new Date(token.last_seen_at).toLocaleString()}`}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <a href={link} target="_blank" rel="noreferrer">
          <Button size="sm" variant="outline" disabled={isRevoked} title="Abrir portal">
            <ExternalLink className="h-3.5 w-3.5 mr-1.5" />Abrir
          </Button>
        </a>
        <Button size="sm" variant="outline" disabled={isRevoked} onClick={() => { navigator.clipboard.writeText(link); toast.success("Link copiado"); }}>
          <Copy className="h-3.5 w-3.5 mr-1.5" />Copiar link
        </Button>
        <Button size="icon" variant="ghost" onClick={() => revokeMut.mutate()} disabled={revokeMut.isPending || isRevoked} title="Revogar acesso">
          <ShieldOff className="h-4 w-4" />
        </Button>
      </div>
    </li>
  );
}

function PermissionSelector({
  value, onChange,
}: { value: PermissionId[]; onChange: (v: PermissionId[]) => void }) {
  const isAdmin = value.includes("admin.full");
  const toggle = (id: PermissionId, on: boolean) => {
    const next = new Set(value);
    if (on) next.add(id); else next.delete(id);
    onChange(Array.from(next));
  };
  return (
    <Accordion type="multiple" defaultValue={["admin", "pipelines"]} className="w-full">
      {PERMISSION_GROUPS.map((g) => (
        <AccordionItem key={g.id} value={g.id}>
          <AccordionTrigger className="text-sm">
            <div className="flex flex-col items-start">
              <span>{g.label}</span>
              <span className="text-xs text-muted-foreground font-normal">{g.description}</span>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            {g.kind === "radio" ? (
              <RadioGroup
                value={isAdmin ? "admin.full" : ""}
                onValueChange={(v) => toggle("admin.full", v === "admin.full")}
                className="space-y-2"
              >
                {g.items.map((it) => (
                  <label key={it.id} className="flex items-start gap-3 rounded-md p-2 hover:bg-muted/50 cursor-pointer">
                    <RadioGroupItem value={it.id} id={it.id} className="mt-0.5" />
                    <div>
                      <div className="text-sm font-medium">{it.label}</div>
                      <div className="text-xs text-muted-foreground">{it.description}</div>
                    </div>
                  </label>
                ))}
              </RadioGroup>
            ) : (
              <div className="space-y-2">
                {g.items.map((it) => (
                  <label key={it.id} className="flex items-start gap-3 rounded-md p-2 hover:bg-muted/50 cursor-pointer">
                    <Checkbox
                      id={it.id}
                      checked={value.includes(it.id)}
                      disabled={isAdmin}
                      onCheckedChange={(c) => toggle(it.id, !!c)}
                      className="mt-0.5"
                    />
                    <div>
                      <div className="text-sm font-medium">{it.label}</div>
                      <div className="text-xs text-muted-foreground">{it.description}</div>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}

function EditPermissionsDialog({
  initialRole, initialPerms, onSave,
}: {
  initialRole: string; initialPerms: PermissionId[];
  onSave: (role: string, perms: PermissionId[]) => Promise<void>;
}) {
  const [role, setRole] = useState(initialRole);
  const [perms, setPerms] = useState<PermissionId[]>(initialPerms);
  const [saving, setSaving] = useState(false);
  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>Editar permissões</DialogTitle>
        <DialogDescription>Atualize papel e permissões granulares deste membro.</DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Papel</Label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            {["owner", "manager", "editor", "designer", "client"].map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
        <PermissionSelector value={perms} onChange={setPerms} />
      </div>
      <DialogFooter>
        <Button
          onClick={async () => { setSaving(true); try { await onSave(role, perms); } finally { setSaving(false); } }}
          disabled={saving}
        >
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Salvar
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function InviteDialog({ brandId, onDone }: { brandId: string; onDone: () => void }) {
  const invite = useServerFn(inviteBrandMembers);
  const [emails, setEmails] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [role, setRole] = useState<"owner"|"manager"|"editor"|"designer"|"client">("editor");
  const [perms, setPerms] = useState<PermissionId[]>([]);
  const [busy, setBusy] = useState(false);
  const [expiresAt, setExpiresAt] = useState<Date | undefined>(() => {
    const d = new Date(); d.setDate(d.getDate() + 7); return d;
  });

  const addEmail = (raw: string) => {
    const e = raw.trim().toLowerCase();
    if (!e) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) { toast.error("E-mail inválido"); return; }
    if (emails.includes(e)) return;
    setEmails([...emails, e]);
    setDraft("");
  };

  const submit = async () => {
    const all = draft ? [...emails, draft.trim().toLowerCase()] : emails;
    const unique = Array.from(new Set(all.filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))));
    if (unique.length === 0) { toast.error("Adicione ao menos um e-mail válido"); return; }
    setBusy(true);
    try {
      const { results } = await invite({
        data: {
          brandId, emails: unique, role, permissions: perms,
          expiresAt: expiresAt ? expiresAt.toISOString() : undefined,
        },
      });
      const linked = results.filter(r => r.status === "linked").length;
      const invited = results.filter(r => r.status === "invited").length;
      const already = results.filter(r => r.status === "already_member").length;
      const failed = results.filter(r => r.status === "error");
      const notSent = results.filter(r => r.status === "invited" && r.emailSent === false).length;
      toast.success(`${invited} convite(s), ${linked} vinculado(s), ${already} já membro(s)${notSent ? ` — ${notSent} sem envio de e-mail (link copiável na lista)` : ""}`);
      if (failed.length) toast.error(`${failed.length} falha(s): ${failed.map(f => f.error).join(", ")}`);
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>Convidar para a marca</DialogTitle>
        <DialogDescription>Envie convites e defina permissões granulares.</DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs">E-mails</Label>
          <div className="flex flex-wrap gap-1.5 rounded-md border border-input p-2 min-h-[42px]">
            {emails.map((e) => (
              <Badge key={e} variant="secondary" className="gap-1">
                {e}
                <button onClick={() => setEmails(emails.filter((x) => x !== e))} className="opacity-60 hover:opacity-100"><X className="h-3 w-3" /></button>
              </Badge>
            ))}
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addEmail(draft); }
                if (e.key === "Backspace" && !draft && emails.length) setEmails(emails.slice(0, -1));
              }}
              onBlur={() => draft && addEmail(draft)}
              placeholder={emails.length ? "" : "email@empresa.com — pressione Enter"}
              className="flex-1 min-w-[160px] bg-transparent text-sm outline-none"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Papel</Label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as typeof role)}
            className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            {(["owner","manager","editor","designer","client"] as const).map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Expira em</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("w-full justify-start text-left font-normal h-9", !expiresAt && "text-muted-foreground")}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {expiresAt ? format(expiresAt, "dd/MM/yyyy") : "Selecionar data"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={expiresAt}
                onSelect={setExpiresAt}
                disabled={(d) => d.getTime() < Date.now() - 24*60*60*1000}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
          <p className="text-[11px] text-muted-foreground">
            Após esta data o convite não poderá mais ser aceito. Padrão: 7 dias.
          </p>
        </div>
        <div>
          <Label className="text-xs mb-1.5 block">Permissões</Label>
          <PermissionSelector value={perms} onChange={setPerms} />
        </div>
      </div>
      <DialogFooter>
        <Button onClick={submit} disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Enviar
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}