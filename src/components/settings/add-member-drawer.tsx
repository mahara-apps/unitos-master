import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, X, Mail, Link2, UserPlus, ChevronDown } from "lucide-react";
import { inviteBrandMembers, addExistingUserToBrand } from "@/lib/team.functions";
import {
  PERMISSION_GROUPS,
  ROLE_DEFAULT_PERMISSIONS,
  type PermissionId,
} from "@/lib/permissions";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

type Role = "owner" | "manager" | "editor" | "designer";
const ROLES: Role[] = ["owner", "manager", "editor", "designer"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ROLE_LABEL: Record<Role, string> = {
  owner: "Owner — acesso total",
  manager: "Manager — gerencia pipelines, automações e IA",
  editor: "Editor — opera pipelines e vê logs",
  designer: "Designer — opera pipelines",
};

export function AddMemberDrawer({
  open, onOpenChange, brandId, onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  brandId: string;
  onDone: () => void;
}) {
  const [tab, setTab] = useState<"invite" | "link">("invite");

  const close = () => onOpenChange(false);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-[520px]"
      >
        <SheetHeader className="border-b border-border/60 px-6 py-5">
          <SheetTitle className="flex items-center gap-2 text-lg">
            <UserPlus className="h-4 w-4 text-primary" />
            Adicionar membro
          </SheetTitle>
          <SheetDescription>
            Convide alguém por e-mail ou vincule uma conta que já existe no Unitos.
          </SheetDescription>
        </SheetHeader>

        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as "invite" | "link")}
          className="flex flex-1 flex-col overflow-hidden"
        >
          <div className="border-b border-border/60 px-6 pt-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="invite" className="gap-2">
                <Mail className="h-3.5 w-3.5" /> Convidar por e-mail
              </TabsTrigger>
              <TabsTrigger value="link" className="gap-2">
                <Link2 className="h-3.5 w-3.5" /> Vincular conta existente
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="invite" className="flex-1 overflow-y-auto px-6 py-6 data-[state=inactive]:hidden">
            <InvitePanel brandId={brandId} onDone={onDone} onClose={close} />
          </TabsContent>
          <TabsContent value="link" className="flex-1 overflow-y-auto px-6 py-6 data-[state=inactive]:hidden">
            <LinkPanel brandId={brandId} onDone={onDone} onClose={close} />
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Aba 1 — Convidar por e-mail (multi-e-mail, dispara inviteBrandMembers)
// ---------------------------------------------------------------------------
function InvitePanel({
  brandId, onDone, onClose,
}: { brandId: string; onDone: () => void; onClose: () => void }) {
  const invite = useServerFn(inviteBrandMembers);
  const [emails, setEmails] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [role, setRole] = useState<Role>("editor");
  const [busy, setBusy] = useState(false);
  const [customPerms, setCustomPerms] = useState<PermissionId[] | null>(null);
  const effectivePerms = customPerms ?? ROLE_DEFAULT_PERMISSIONS[role];

  const commit = (raw: string) => {
    const clean = raw.trim().toLowerCase();
    if (!clean) return;
    if (!EMAIL_RE.test(clean)) { toast.error(`E-mail inválido: ${clean}`); return; }
    if (emails.includes(clean)) return;
    setEmails((prev) => [...prev, clean]);
    setDraft("");
  };

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === "," || e.key === " ") {
      e.preventDefault();
      commit(draft);
    } else if (e.key === "Backspace" && !draft && emails.length > 0) {
      setEmails((prev) => prev.slice(0, -1));
    }
  };

  const submit = async () => {
    if (draft.trim()) commit(draft);
    const list = draft.trim() && EMAIL_RE.test(draft.trim().toLowerCase())
      ? Array.from(new Set([...emails, draft.trim().toLowerCase()]))
      : emails;
    if (list.length === 0) { toast.error("Adicione ao menos um e-mail"); return; }

    setBusy(true);
    try {
      const res = await invite({
        data: { brandId, emails: list, role, permissions: effectivePerms },
      });
      const okCount = (res.results ?? []).filter((r) => r.status !== "error").length;
      const failCount = (res.results ?? []).filter((r) => r.status === "error").length;
      if (okCount > 0) toast.success(`${okCount} convite${okCount > 1 ? "s" : ""} enviado${okCount > 1 ? "s" : ""}`);
      if (failCount > 0) toast.error(`${failCount} falha${failCount > 1 ? "s" : ""} — verifique os e-mails`);
      onDone();
      onClose();
    } catch (e) {
      const msg = (e as Error).message;
      toast.error(msg.startsWith("forbidden") ? "Apenas owners e managers podem convidar" : msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="invite-emails" className="text-xs">E-mails</Label>
        <div className="min-h-[42px] rounded-md border border-input bg-transparent px-2 py-1.5 flex flex-wrap gap-1.5">
          {emails.map((e) => (
            <Badge key={e} variant="secondary" className="gap-1 pr-1 font-normal">
              {e}
              <button
                type="button"
                aria-label={`Remover ${e}`}
                onClick={() => setEmails((prev) => prev.filter((x) => x !== e))}
                className="rounded-sm hover:bg-muted p-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          <Input
            id="invite-emails"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKey}
            onBlur={() => draft && commit(draft)}
            placeholder={emails.length === 0 ? "pessoa@empresa.com" : ""}
            className="h-7 flex-1 min-w-[180px] border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
            autoComplete="off"
          />
        </div>
        <p className="text-[11px] text-muted-foreground">
          Enter, vírgula ou espaço para adicionar. O convite cria a conta automaticamente se ela não existir.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Papel</Label>
        <select
          value={role}
          onChange={(e) => { setRole(e.target.value as Role); setCustomPerms(null); }}
          className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
        >
          {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </select>
        <p className="text-[11px] text-muted-foreground">
          Aplica automaticamente permissões padrão de Pipelines, Automations e IA Agents.
        </p>
      </div>

      <CustomPermissionsSection
        role={role}
        value={effectivePerms}
        isCustom={customPerms !== null}
        onChange={(next: PermissionId[]) => setCustomPerms(next)}
        onReset={() => setCustomPerms(null)}
      />

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onClose} disabled={busy}>Cancelar</Button>
        <Button onClick={submit} disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Enviar convite{emails.length > 1 ? "s" : ""}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Aba 2 — Vincular conta existente (sem e-mail, atribuição direta)
// ---------------------------------------------------------------------------
function LinkPanel({
  brandId, onDone, onClose,
}: { brandId: string; onDone: () => void; onClose: () => void }) {
  const link = useServerFn(addExistingUserToBrand);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("editor");
  const [busy, setBusy] = useState(false);
  const [customPerms, setCustomPerms] = useState<PermissionId[] | null>(null);
  const effectivePerms = customPerms ?? ROLE_DEFAULT_PERMISSIONS[role];

  const submit = async () => {
    const clean = email.trim().toLowerCase();
    if (!EMAIL_RE.test(clean)) { toast.error("E-mail inválido"); return; }
    setBusy(true);
    try {
      const res = await link({
        data: { brandId, email: clean, role, permissions: effectivePerms },
      });
      if (res.status === "not_found") {
        toast.error("Nenhum usuário com esse e-mail. Use a aba Convidar para criar a conta.");
        return;
      }
      toast.success(
        res.status === "added" ? "Membro vinculado à marca"
        : res.status === "updated" ? `Membro atualizado para ${role}`
        : `Já era membro com o papel ${role}`,
      );
      onDone();
      onClose();
    } catch (e) {
      const msg = (e as Error).message;
      toast.error(msg.startsWith("forbidden") ? "Apenas owners e managers podem vincular contas" : msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="link-email" className="text-xs">E-mail do usuário</Label>
        <Input
          id="link-email"
          type="email"
          autoComplete="off"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="pessoa@empresa.com"
        />
        <p className="text-[11px] text-muted-foreground">
          Deve ser uma conta já cadastrada no Unitos. Se não existir, use a aba Convidar.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Papel</Label>
        <select
          value={role}
          onChange={(e) => { setRole(e.target.value as Role); setCustomPerms(null); }}
          className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
        >
          {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </select>
      </div>

      <CustomPermissionsSection
        role={role}
        value={effectivePerms}
        isCustom={customPerms !== null}
        onChange={(next: PermissionId[]) => setCustomPerms(next)}
        onReset={() => setCustomPerms(null)}
      />

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onClose} disabled={busy}>Cancelar</Button>
        <Button onClick={submit} disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Vincular à marca
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Personalização opcional das permissões granulares
// (Pipelines, Automations, IA Agents) — recolhida por padrão.
// ---------------------------------------------------------------------------
function CustomPermissionsSection({
  role,
  value,
  isCustom,
  onChange,
  onReset,
}: {
  role: Role;
  value: PermissionId[];
  isCustom: boolean;
  onChange: (next: PermissionId[]) => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const isAdmin = value.includes("admin.full");

  const toggle = (id: PermissionId, on: boolean) => {
    const base = isCustom ? value : ROLE_DEFAULT_PERMISSIONS[role];
    const next = new Set(base);
    if (on) next.add(id); else next.delete(id);
    onChange(Array.from(next));
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-md border border-border/60 bg-muted/20">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
        >
          <div className="min-w-0">
            <div className="text-sm font-medium">Personalizar permissões (opcional)</div>
            <div className="text-[11px] text-muted-foreground">
              {isCustom
                ? "Sobrescrevendo o padrão do papel selecionado."
                : `Padrão do papel ${role} será aplicado automaticamente.`}
            </div>
          </div>
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t border-border/60 px-3 py-3">
        {isCustom && (
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[11px] text-amber-600">Permissões customizadas ativas.</span>
            <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={onReset}>
              Restaurar padrão do papel
            </Button>
          </div>
        )}
        <div className="space-y-4">
          {PERMISSION_GROUPS.filter((g) => g.id !== "admin").map((g) => (
            <div key={g.id} className="space-y-1.5">
              <div className="text-xs font-medium">{g.label}</div>
              <div className="text-[11px] text-muted-foreground">{g.description}</div>
              <div className="mt-1 space-y-1.5">
                {g.items.map((it) => (
                  <label
                    key={it.id}
                    className={cn(
                      "flex items-start gap-2.5 rounded-md p-1.5 cursor-pointer hover:bg-muted/40",
                      isAdmin && "opacity-60",
                    )}
                  >
                    <Checkbox
                      checked={value.includes(it.id)}
                      disabled={isAdmin}
                      onCheckedChange={(c) => toggle(it.id, !!c)}
                      className="mt-0.5"
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-medium">{it.label}</div>
                      <div className="text-[11px] text-muted-foreground">{it.description}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          ))}
          {isAdmin && (
            <p className="text-[11px] text-muted-foreground">
              Owner tem acesso total — permissões granulares ficam desativadas.
            </p>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}