import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Loader2, Copy, ChevronRight, ChevronLeft, Check, ShieldCheck, Users2, KeyRound } from "lucide-react";
import { listProvisionableBrands, provisionUser } from "@/lib/team.functions";
import { PERMISSION_GROUPS, type PermissionId } from "@/lib/permissions";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { cn } from "@/lib/utils";

type Role = "owner" | "manager" | "editor" | "designer" | "client";

type BrandDraft = {
  brandId: string;
  role: Role;
  permissions: PermissionId[];
  restrictClients: boolean;
  clientIds: string[];
};

export function CreateUserDialog({ open, onOpenChange, onDone }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const load = useServerFn(listProvisionableBrands);
  const provision = useServerFn(provisionUser);
  const { data: opts, isLoading } = useQuery({
    queryKey: ["provisionable-brands"],
    queryFn: () => load(),
    enabled: open,
    staleTime: 60_000,
  });

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [assignments, setAssignments] = useState<BrandDraft[]>([]);
  const [sendEmail, setSendEmail] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ email: string; tempPassword: string; emailSent: boolean } | null>(null);

  const brands = opts?.brands ?? [];

  const reset = () => {
    setStep(1); setFullName(""); setEmail(""); setAssignments([]); setSendEmail(true); setResult(null);
  };

  const close = () => { reset(); onOpenChange(false); };

  const toggleBrand = (brandId: string) => {
    setAssignments((prev) => {
      if (prev.some((a) => a.brandId === brandId)) return prev.filter((a) => a.brandId !== brandId);
      return [...prev, { brandId, role: "editor", permissions: [], restrictClients: false, clientIds: [] }];
    });
  };

  const updateAssignment = (brandId: string, patch: Partial<BrandDraft>) => {
    setAssignments((prev) => prev.map((a) => (a.brandId === brandId ? { ...a, ...patch } : a)));
  };

  const canGoStep2 = fullName.trim().length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const canGoStep3 = assignments.length > 0 && assignments.every((a) => !a.restrictClients || a.clientIds.length > 0);

  const submit = async () => {
    setBusy(true);
    try {
      const payload = {
        email: email.trim().toLowerCase(),
        fullName: fullName.trim(),
        sendEmail,
        assignments: assignments.map((a) => ({
          brandId: a.brandId,
          role: a.role,
          permissions: a.permissions,
          clientIds: a.restrictClients ? a.clientIds : [],
        })),
      };
      const res = await provision({ data: payload });
      setResult({ email: res.email, tempPassword: res.tempPassword, emailSent: res.emailStatus.sent });
      setStep(4);
      onDone();
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.startsWith("user_exists")) toast.error("Já existe conta com esse e-mail. Use 'Adicionar existente'.");
      else if (msg.startsWith("forbidden")) toast.error("Você não tem permissão em todos os workspaces selecionados.");
      else toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) close(); else onOpenChange(true); }}>
      <SheetContent side="right" className="w-full sm:max-w-[640px] flex flex-col p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b">
          <SheetTitle>Criar usuário</SheetTitle>
          <SheetDescription>
            Provisiona uma conta com senha temporária e libera acesso a workspaces e projetos.
          </SheetDescription>
          <div className="flex items-center gap-2 pt-3 text-xs">
            <StepPill n={1} label="Identidade" active={step >= 1} done={step > 1} />
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
            <StepPill n={2} label="Acesso" active={step >= 2} done={step > 2} />
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
            <StepPill n={3} label="Confirmar" active={step >= 3} done={step > 3} />
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="cu-name" className="text-xs">Nome completo</Label>
                <Input id="cu-name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Ex.: Maria Silva" autoFocus />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cu-email" className="text-xs">E-mail</Label>
                <Input id="cu-email" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="pessoa@empresa.com" />
              </div>
              <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
                <div className="flex gap-2"><KeyRound className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>Uma senha temporária de 16 caracteres será gerada. O usuário terá que trocá-la no primeiro acesso.</span>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              {isLoading ? (
                <div className="text-sm text-muted-foreground">Carregando workspaces…</div>
              ) : brands.length === 0 ? (
                <div className="text-sm text-muted-foreground">Você não é owner ou manager de nenhum workspace.</div>
              ) : (
                <>
                  <div className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                    <Users2 className="h-3.5 w-3.5" /> Workspaces disponíveis
                    {opts?.isSuperAdmin && <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-600">Super admin</Badge>}
                  </div>
                  <div className="space-y-2">
                    {brands.map((b) => {
                      const draft = assignments.find((a) => a.brandId === b.id);
                      const selected = Boolean(draft);
                      return (
                        <div key={b.id} className={cn("rounded-lg border transition", selected ? "border-primary/60 bg-primary/[0.03]" : "border-border")}>
                          <label className="flex items-center gap-3 px-3 py-2.5 cursor-pointer">
                            <Checkbox checked={selected} onCheckedChange={() => toggleBrand(b.id)} />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate">{b.name}</div>
                              <div className="text-[11px] text-muted-foreground">{b.clients.length} projeto(s)</div>
                            </div>
                          </label>
                          {draft && (
                            <div className="px-3 pb-3 pt-1 space-y-3 border-t border-border/60">
                              <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                  <Label className="text-[11px] text-muted-foreground">Papel</Label>
                                  <select
                                    value={draft.role}
                                    onChange={(e) => updateAssignment(b.id, { role: e.target.value as Role })}
                                    className="w-full h-8 rounded-md border border-input bg-transparent px-2 text-xs"
                                  >
                                    {(["owner","manager","editor","designer","client"] as const).map((r) => (
                                      <option key={r} value={r}>{r}</option>
                                    ))}
                                  </select>
                                </div>
                                <div className="flex items-end justify-end">
                                  <div className="flex items-center gap-2">
                                    <Switch
                                      id={`restrict-${b.id}`}
                                      checked={draft.restrictClients}
                                      onCheckedChange={(c) => updateAssignment(b.id, { restrictClients: c, clientIds: c ? draft.clientIds : [] })}
                                      disabled={b.clients.length === 0}
                                    />
                                    <Label htmlFor={`restrict-${b.id}`} className="text-xs cursor-pointer">Restringir a projetos</Label>
                                  </div>
                                </div>
                              </div>
                              {draft.restrictClients && b.clients.length > 0 && (
                                <div className="rounded-md border border-border bg-background max-h-40 overflow-y-auto">
                                  {b.clients.map((c) => {
                                    const on = draft.clientIds.includes(c.id);
                                    return (
                                      <label key={c.id} className="flex items-center gap-2 px-2.5 py-1.5 hover:bg-muted/40 cursor-pointer text-xs">
                                        <Checkbox
                                          checked={on}
                                          onCheckedChange={(v) => updateAssignment(b.id, {
                                            clientIds: v ? [...draft.clientIds, c.id] : draft.clientIds.filter((x) => x !== c.id),
                                          })}
                                        />
                                        <span className="truncate">{c.name}</span>
                                      </label>
                                    );
                                  })}
                                </div>
                              )}
                              <details className="text-xs">
                                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Permissões avançadas ({draft.permissions.length})</summary>
                                <div className="mt-2">
                                  <PermissionSelector value={draft.permissions} onChange={(p) => updateAssignment(b.id, { permissions: p })} />
                                </div>
                              </details>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {step === 3 && (
            <ConfirmStep
              fullName={fullName}
              email={email}
              assignments={assignments}
              brands={brands}
              sendEmail={sendEmail}
              onSendEmailChange={setSendEmail}
            />
          )}

          {step === 4 && result && (
            <SuccessStep result={result} onClose={close} />
          )}
        </div>

        {step !== 4 && (
          <SheetFooter className="px-6 py-4 border-t flex flex-row justify-between gap-2">
            <Button variant="ghost" onClick={close}>Cancelar</Button>
            <div className="flex gap-2">
              {step > 1 && (
                <Button variant="outline" onClick={() => setStep((s) => (s - 1) as 1|2|3)}>
                  <ChevronLeft className="h-4 w-4 mr-1.5" /> Voltar
                </Button>
              )}
              {step === 1 && (
                <Button disabled={!canGoStep2} onClick={() => setStep(2)}>Continuar <ChevronRight className="h-4 w-4 ml-1.5" /></Button>
              )}
              {step === 2 && (
                <Button disabled={!canGoStep3} onClick={() => setStep(3)}>Continuar <ChevronRight className="h-4 w-4 ml-1.5" /></Button>
              )}
              {step === 3 && (
                <Button disabled={busy} onClick={submit}>
                  {busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <ShieldCheck className="h-4 w-4 mr-1.5" />}
                  Criar usuário
                </Button>
              )}
            </div>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}

function StepPill({ n, label, active, done }: { n: number; label: string; active: boolean; done: boolean }) {
  return (
    <div className={cn("flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px]",
      done ? "bg-emerald-500/10 text-emerald-600" : active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
      <span className={cn("h-4 w-4 rounded-full inline-flex items-center justify-center text-[10px] font-medium",
        done ? "bg-emerald-500 text-white" : active ? "bg-primary text-primary-foreground" : "bg-background border border-border")}>
        {done ? <Check className="h-2.5 w-2.5" /> : n}
      </span>
      {label}
    </div>
  );
}

function ConfirmStep({ fullName, email, assignments, brands, sendEmail, onSendEmailChange }: {
  fullName: string;
  email: string;
  assignments: BrandDraft[];
  brands: Array<{ id: string; name: string; clients: Array<{ id: string; name: string }> }>;
  sendEmail: boolean;
  onSendEmailChange: (v: boolean) => void;
}) {
  const brandMap = useMemo(() => new Map(brands.map((b) => [b.id, b])), [brands]);
  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border p-3 space-y-1">
        <div className="text-xs text-muted-foreground uppercase tracking-wider">Usuário</div>
        <div className="text-sm font-medium">{fullName}</div>
        <div className="text-xs text-muted-foreground">{email}</div>
      </div>
      <div className="rounded-md border border-border p-3 space-y-2">
        <div className="text-xs text-muted-foreground uppercase tracking-wider">Acessos</div>
        {assignments.map((a) => {
          const b = brandMap.get(a.brandId);
          const clientNames = a.restrictClients
            ? b?.clients.filter((c) => a.clientIds.includes(c.id)).map((c) => c.name)
            : null;
          return (
            <div key={a.brandId} className="text-xs space-y-0.5 pb-2 border-b last:border-b-0 border-border/60">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{b?.name}</span>
                <Badge variant="secondary" className="text-[10px] capitalize">{a.role}</Badge>
                {a.permissions.length > 0 && <span className="text-muted-foreground">· {a.permissions.length} permissão(ões)</span>}
              </div>
              <div className="text-muted-foreground">
                {clientNames ? `Projetos: ${clientNames.join(", ")}` : "Todos os projetos deste workspace"}
              </div>
            </div>
          );
        })}
      </div>
      <label className="flex items-center gap-3 rounded-md border border-border p-3 cursor-pointer">
        <Switch checked={sendEmail} onCheckedChange={onSendEmailChange} />
        <div className="flex-1">
          <div className="text-sm font-medium">Enviar e-mail de boas-vindas</div>
          <div className="text-xs text-muted-foreground">
            Informa o acesso e inclui a senha temporária. O e-mail é apenas informativo — o acesso já fica ativo independente do envio.
          </div>
        </div>
      </label>
    </div>
  );
}

function SuccessStep({ result, onClose }: {
  result: { email: string; tempPassword: string; emailSent: boolean };
  onClose: () => void;
}) {
  const copy = () => {
    navigator.clipboard.writeText(result.tempPassword);
    toast.success("Senha copiada");
  };
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/[0.05] p-4">
        <div className="flex items-center gap-2 text-emerald-600 mb-2">
          <ShieldCheck className="h-5 w-5" />
          <span className="text-sm font-medium">Conta criada com sucesso</span>
        </div>
        <div className="text-xs text-muted-foreground">
          {result.emailSent
            ? "Enviamos as credenciais para o e-mail informado."
            : "E-mail não foi enviado (configuração do Resend ausente ou desativada). Copie a senha abaixo e compartilhe manualmente."}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">E-mail</Label>
        <Input readOnly value={result.email} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Senha temporária</Label>
        <div className="flex gap-2">
          <Input readOnly value={result.tempPassword} className="font-mono text-sm" />
          <Button variant="outline" size="icon" onClick={copy}><Copy className="h-4 w-4" /></Button>
        </div>
        <p className="text-[11px] text-muted-foreground">O usuário será obrigado a definir uma nova senha no primeiro login.</p>
      </div>
      <div className="flex justify-end pt-2">
        <Button onClick={onClose}>Concluir</Button>
      </div>
    </div>
  );
}

function PermissionSelector({ value, onChange }: { value: PermissionId[]; onChange: (v: PermissionId[]) => void }) {
  const isAdmin = value.includes("admin.full");
  const toggle = (id: PermissionId, on: boolean) => {
    const next = new Set(value);
    if (on) next.add(id); else next.delete(id);
    onChange(Array.from(next));
  };
  return (
    <Accordion type="multiple" className="w-full">
      {PERMISSION_GROUPS.map((g) => (
        <AccordionItem key={g.id} value={g.id}>
          <AccordionTrigger className="text-xs py-2">{g.label}</AccordionTrigger>
          <AccordionContent>
            <div className="space-y-1.5">
              {g.items.map((it) => (
                <label key={it.id} className="flex items-start gap-2 rounded-md p-1.5 hover:bg-muted/40 cursor-pointer">
                  <Checkbox
                    checked={value.includes(it.id) || (g.kind === "radio" && it.id === "admin.full" && isAdmin)}
                    disabled={g.kind === "checkbox" && isAdmin}
                    onCheckedChange={(c) => toggle(it.id, !!c)}
                    className="mt-0.5"
                  />
                  <div>
                    <div className="text-xs font-medium">{it.label}</div>
                    <div className="text-[11px] text-muted-foreground">{it.description}</div>
                  </div>
                </label>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}