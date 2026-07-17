import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, Copy, Check, KeyRound, MailCheck } from "lucide-react";
import { addPerson, listProvisionableBrands } from "@/lib/team.functions";

type Role = "owner" | "manager" | "editor" | "designer" | "client";

export function AddPersonDialog({
  open, onOpenChange, brandId, onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  brandId: string;
  onDone: () => void;
}) {
  const runAdd = useServerFn(addPerson);
  const loadBrands = useServerFn(listProvisionableBrands);
  const { data: opts } = useQuery({
    queryKey: ["provisionable-brands"],
    queryFn: () => loadBrands(),
    enabled: open,
    staleTime: 60_000,
  });

  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<Role>("editor");
  const [restrict, setRestrict] = useState(false);
  const [clientIds, setClientIds] = useState<string[]>([]);
  const [sendEmail, setSendEmail] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    mode: "linked" | "provisioned";
    email: string;
    tempPassword: string | null;
    emailSent: boolean;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const brand = opts?.brands?.find((b) => b.id === brandId);
  const clients = brand?.clients ?? [];

  const reset = () => {
    setEmail(""); setFullName(""); setRole("editor");
    setRestrict(false); setClientIds([]); setSendEmail(true);
    setResult(null); setCopied(false);
  };

  const close = () => { reset(); onOpenChange(false); };

  const submit = async () => {
    const clean = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
      toast.error("E-mail inválido"); return;
    }
    setBusy(true);
    try {
      const res = await runAdd({
        data: {
          brandId,
          email: clean,
          fullName: fullName.trim(),
          role,
          permissions: [],
          clientIds: restrict ? clientIds : [],
          sendEmail,
        },
      });
      if (res.mode === "provisioned") {
        setResult({
          mode: "provisioned",
          email: res.email,
          tempPassword: res.tempPassword,
          emailSent: Boolean(res.emailStatus?.sent),
        });
        toast.success(`Conta criada para ${res.fullName || res.email}`);
      } else {
        toast.success(
          res.status === "added" ? `${res.fullName || res.email} vinculado à marca`
          : res.status === "updated" ? `${res.fullName || res.email} atualizado para ${role}`
          : `${res.fullName || res.email} já era membro com esse papel`,
        );
        onDone();
        close();
      }
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.startsWith("name_required")) {
        toast.error("Informe o nome completo para criar a conta");
      } else if (msg.startsWith("forbidden")) {
        toast.error("Apenas owners e managers podem adicionar pessoas");
      } else {
        toast.error(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  const copyPass = async () => {
    if (!result?.tempPassword) return;
    await navigator.clipboard.writeText(result.tempPassword);
    setCopied(true);
    toast.success("Senha copiada");
    setTimeout(() => setCopied(false), 1500);
  };

  const finish = () => { onDone(); close(); };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) close(); else onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        {result?.mode === "provisioned" ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-primary" />
                Conta criada
              </DialogTitle>
              <DialogDescription>
                A senha temporária abaixo é exibida apenas uma vez. Compartilhe com {result.email} de forma segura.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="rounded-md border bg-muted/40 p-3">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">E-mail</div>
                <div className="text-sm font-medium">{result.email}</div>
              </div>
              <div className="rounded-md border bg-muted/40 p-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Senha temporária</div>
                  <Button size="sm" variant="ghost" className="h-6 px-2" onClick={copyPass}>
                    {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  </Button>
                </div>
                <div className="font-mono text-sm font-semibold select-all break-all">{result.tempPassword}</div>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <MailCheck className="h-3.5 w-3.5" />
                {result.emailSent ? "E-mail informativo enviado ao usuário" : "E-mail não enviado — copie a senha e envie manualmente"}
              </div>
            </div>
            <DialogFooter>
              <Button onClick={finish}>Concluir</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Adicionar pessoa</DialogTitle>
              <DialogDescription>
                Se a conta já existe, será vinculada a esta marca. Se não, será criada com senha temporária.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="ap-email" className="text-xs">E-mail</Label>
                <Input
                  id="ap-email" type="email" autoComplete="off"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="pessoa@empresa.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ap-name" className="text-xs">
                  Nome completo <span className="text-muted-foreground">(obrigatório se a conta for nova)</span>
                </Label>
                <Input
                  id="ap-name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Ex.: Maria Silva"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Papel</Label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as Role)}
                  className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                >
                  {(["owner","manager","editor","designer","client"] as const).map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              {clients.length > 0 && (
                <div className="rounded-md border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium">Restringir a projetos</div>
                      <div className="text-xs text-muted-foreground">Sem restrição, vê todos os projetos da marca.</div>
                    </div>
                    <Switch checked={restrict} onCheckedChange={setRestrict} />
                  </div>
                  {restrict && (
                    <div className="max-h-40 overflow-auto pt-1 space-y-1.5">
                      {clients.map((c) => {
                        const checked = clientIds.includes(c.id);
                        return (
                          <label key={c.id} className="flex items-center gap-2 text-sm px-1 py-1 rounded hover:bg-muted/50 cursor-pointer">
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(v) => {
                                setClientIds((prev) => v ? [...prev, c.id] : prev.filter((x) => x !== c.id));
                              }}
                            />
                            <span className="truncate">{c.name}</span>
                          </label>
                        );
                      })}
                      {restrict && clientIds.length === 0 && (
                        <div className="text-[11px] text-amber-600 dark:text-amber-500 pt-1">
                          Selecione ao menos um projeto ou desative a restrição.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <div className="text-sm font-medium">Enviar e-mail informativo</div>
                  <div className="text-xs text-muted-foreground">Apenas para contas recém-criadas.</div>
                </div>
                <Switch checked={sendEmail} onCheckedChange={setSendEmail} />
              </div>

              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <Badge variant="outline" className="font-normal">Auto-detectado</Badge>
                Vincula se existe, cria se não existe.
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={close} disabled={busy}>Cancelar</Button>
              <Button
                onClick={submit}
                disabled={busy || (restrict && clientIds.length === 0)}
              >
                {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Adicionar
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}