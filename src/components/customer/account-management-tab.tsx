import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Check,
  ChevronRight,
  CircleCheck,
  Clock,
  FolderPlus,
  Info,
  Lock,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useAccessRole } from "@/hooks/use-access-role";
import {
  getClientAccountFn,
  updateClientAccountFn,
  moveClientJourneyStageFn,
  JOURNEY_STAGES,
  JOURNEY_STAGE_LABEL,
  CONTRACT_STATUS_LABEL,
  type JourneyStage,
  type ClientAccount,
} from "@/lib/client-journey.functions";
import { listBrandTeam } from "@/lib/team.functions";
import { listTemplatesFn } from "@/lib/project-templates.functions";
import { PortalLinkCard } from "@/components/customer/portal-link-card";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const DATE_FMT = new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" });

export function AccountManagementTab({
  brandId,
  clientId,
}: {
  brandId: string;
  clientId: string;
}) {
  const qc = useQueryClient();
  const fetchAccount = useServerFn(getClientAccountFn);
  const fetchTeam = useServerFn(listBrandTeam);
  const fetchTemplates = useServerFn(listTemplatesFn);
  const updateAccount = useServerFn(updateClientAccountFn);
  const moveStage = useServerFn(moveClientJourneyStageFn);
  const { role } = useAccessRole();
  const canEdit = role === "admin";

  const accountQ = useQuery({
    queryKey: ["client-journey", clientId],
    queryFn: () => fetchAccount({ data: { brandId, clientId } }),
    staleTime: 30_000,
  });
  const teamQ = useQuery({
    queryKey: ["brand-team", brandId],
    queryFn: () => fetchTeam({ data: { brandId } }),
    staleTime: 60_000,
    enabled: canEdit,
  });
  const templatesQ = useQuery({
    queryKey: ["project-templates", brandId],
    queryFn: () => fetchTemplates({ data: { brandId } }),
    staleTime: 60_000,
  });

  const updateMut = useMutation({
    mutationFn: updateAccount,
    onSuccess: () => {
      toast.success("Informações atualizadas.");
      qc.invalidateQueries({ queryKey: ["client-journey", clientId] });
      qc.invalidateQueries({ queryKey: ["clients", brandId] });
    },
    onError: (e: Error) => toast.error("Falha ao salvar", { description: e.message }),
  });

  const moveMut = useMutation({
    mutationFn: moveStage,
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["client-journey", clientId] });
      qc.invalidateQueries({ queryKey: ["clients", brandId] });
      if (res?.projectId) {
        toast.success("Estágio atualizado e projeto criado.", {
          description: res.projectName ?? undefined,
        });
      } else {
        toast.success("Estágio atualizado.");
      }
    },
    onError: (e: Error) => toast.error("Não foi possível mover o estágio", { description: e.message }),
  });

  const [moveDialog, setMoveDialog] = useState<{ open: boolean; stage: JourneyStage | null }>({
    open: false,
    stage: null,
  });

  if (accountQ.isLoading || !accountQ.data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  const { account, timeline, stageMappings } = accountQ.data;
  const currentStage = account.journey_stage as JourneyStage;
  const currentIdx = JOURNEY_STAGES.indexOf(currentStage);
  const mappingByStage = new Map(stageMappings.map((m) => [m.stage, m]));

  const openMove = (stage: JourneyStage) => {
    if (!canEdit) {
      toast.error("Sem permissão", { description: "Apenas admin pode mover a jornada." });
      return;
    }
    setMoveDialog({ open: true, stage });
  };

  return (
    <div className="space-y-6">
      {!canEdit && (
        <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5" />
          Você tem acesso somente leitura à gestão desta conta.
        </div>
      )}

      <AccountInfoCard
        account={account}
        canEdit={canEdit}
        team={teamQ.data?.members ?? []}
        onSubmit={(patch) => updateMut.mutate({ data: { brandId, clientId, patch } })}
        isSaving={updateMut.isPending}
      />

      <PortalLinkCard clientId={clientId} clientName={account.name ?? null} />

      <JourneyPipeline
        currentIdx={currentIdx}
        mappingByStage={mappingByStage}
        onSelect={openMove}
        canEdit={canEdit}
      />

      <JourneyHistory timeline={timeline} />

      <MoveDialog
        open={moveDialog.open}
        onOpenChange={(o) => setMoveDialog((s) => ({ ...s, open: o }))}
        currentStage={currentStage}
        toStage={moveDialog.stage}
        mapping={moveDialog.stage ? mappingByStage.get(moveDialog.stage) ?? null : null}
        templates={templatesQ.data ?? []}
        isSubmitting={moveMut.isPending}
        onConfirm={(payload) => {
          if (!moveDialog.stage) return;
          moveMut.mutate(
            {
              data: {
                brandId,
                clientId,
                toStage: moveDialog.stage,
                note: payload.note || undefined,
                createProject: payload.createProject,
                projectTemplateId: payload.projectTemplateId ?? undefined,
              },
            },
            {
              onSuccess: () => setMoveDialog({ open: false, stage: null }),
            },
          );
        }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Info card                                                                 */
/* -------------------------------------------------------------------------- */

type AccountForm = {
  monthly_contract_value: string;
  margin_percent: string;
  contract_start_date: string;
  contract_renewal_date: string;
  contract_status: string;
  internal_notes: string;
  owner_user_id: string;
};

function AccountInfoCard({
  account,
  canEdit,
  team,
  onSubmit,
  isSaving,
}: {
  account: ClientAccount;
  canEdit: boolean;
  team: Array<{ user_id: string; full_name: string | null }>;
  onSubmit: (patch: Record<string, unknown>) => void;
  isSaving: boolean;
}) {
  const [form, setForm] = useState<AccountForm>(() => toForm(account));
  useEffect(() => setForm(toForm(account)), [account]);

  const mrr = account.monthly_contract_value ?? 0;
  const daysToRenewal = account.contract_renewal_date
    ? Math.round(
        (new Date(account.contract_renewal_date).getTime() - Date.now()) / 86_400_000,
      )
    : null;
  const tenureMonths = account.contract_start_date
    ? Math.max(
        0,
        Math.round(
          (Date.now() - new Date(account.contract_start_date).getTime()) /
            (30 * 86_400_000),
        ),
      )
    : null;

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(toForm(account)), [form, account]);

  const submit = () => {
    onSubmit({
      monthly_contract_value: form.monthly_contract_value
        ? Number(form.monthly_contract_value.replace(",", "."))
        : null,
      margin_percent: form.margin_percent
        ? Number(form.margin_percent.replace(",", "."))
        : null,
      contract_start_date: form.contract_start_date || null,
      contract_renewal_date: form.contract_renewal_date || null,
      contract_status: form.contract_status,
      internal_notes: form.internal_notes || null,
      owner_user_id: form.owner_user_id || null,
    });
  };

  return (
    <div className="rounded-xl border border-border/60 bg-card">
      <div className="border-b border-border/60 px-4 py-3">
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          Gestão da conta
        </div>
        <div className="mt-0.5 text-sm font-medium">Informações comerciais</div>
      </div>
      <div className="grid grid-cols-3 divide-x divide-border/60 border-b border-border/60 text-center">
        <KpiCell label="MRR do cliente" value={BRL.format(mrr)} />
        <KpiCell
          label="Tempo de casa"
          value={tenureMonths == null ? "—" : `${tenureMonths} ${tenureMonths === 1 ? "mês" : "meses"}`}
        />
        <KpiCell
          label="Renovação"
          value={
            daysToRenewal == null
              ? "—"
              : daysToRenewal < 0
                ? `Vencida há ${Math.abs(daysToRenewal)}d`
                : `${daysToRenewal} dias`
          }
          tone={daysToRenewal != null && daysToRenewal < 30 ? "warn" : "default"}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2">
        <Field label="Valor mensal do contrato">
          <Input
            inputMode="decimal"
            placeholder="0,00"
            disabled={!canEdit}
            value={form.monthly_contract_value}
            onChange={(e) =>
              setForm((s) => ({ ...s, monthly_contract_value: e.target.value }))
            }
          />
        </Field>
        <Field label="Margem (%)">
          <Input
            inputMode="decimal"
            placeholder="0,00"
            disabled={!canEdit}
            value={form.margin_percent}
            onChange={(e) => setForm((s) => ({ ...s, margin_percent: e.target.value }))}
          />
        </Field>
        <Field label="Data de início">
          <Input
            type="date"
            disabled={!canEdit}
            value={form.contract_start_date}
            onChange={(e) =>
              setForm((s) => ({ ...s, contract_start_date: e.target.value }))
            }
          />
        </Field>
        <Field label="Renovação prevista">
          <Input
            type="date"
            disabled={!canEdit}
            value={form.contract_renewal_date}
            onChange={(e) =>
              setForm((s) => ({ ...s, contract_renewal_date: e.target.value }))
            }
          />
        </Field>
        <Field label="Status contratual">
          <Select
            value={form.contract_status}
            onValueChange={(v) => setForm((s) => ({ ...s, contract_status: v }))}
            disabled={!canEdit}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(CONTRACT_STATUS_LABEL).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Responsável pela conta">
          <Select
            value={form.owner_user_id || "__none"}
            onValueChange={(v) =>
              setForm((s) => ({ ...s, owner_user_id: v === "__none" ? "" : v }))
            }
            disabled={!canEdit}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecionar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">Sem responsável</SelectItem>
              {team.map((m) => (
                <SelectItem key={m.user_id} value={m.user_id}>
                  {m.full_name || m.user_id.slice(0, 8)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <div className="md:col-span-2">
          <Field label="Notas internas">
            <Textarea
              rows={4}
              disabled={!canEdit}
              value={form.internal_notes}
              onChange={(e) => setForm((s) => ({ ...s, internal_notes: e.target.value }))}
              placeholder="Contexto do contrato, particularidades, histórico comercial…"
            />
          </Field>
        </div>
      </div>
      {canEdit && (
        <div className="flex justify-end gap-2 border-t border-border/60 px-4 py-3">
          <Button
            variant="ghost"
            size="sm"
            disabled={!dirty || isSaving}
            onClick={() => setForm(toForm(account))}
          >
            Descartar
          </Button>
          <Button size="sm" disabled={!dirty || isSaving} onClick={submit}>
            {isSaving ? "Salvando…" : "Salvar alterações"}
          </Button>
        </div>
      )}
    </div>
  );
}

function toForm(a: ClientAccount): AccountForm {
  return {
    monthly_contract_value:
      a.monthly_contract_value != null ? String(a.monthly_contract_value) : "",
    margin_percent: a.margin_percent != null ? String(a.margin_percent) : "",
    contract_start_date: a.contract_start_date ?? "",
    contract_renewal_date: a.contract_renewal_date ?? "",
    contract_status: a.contract_status ?? "ativo",
    internal_notes: a.internal_notes ?? "",
    owner_user_id: a.owner_user_id ?? "",
  };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function KpiCell({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "warn";
}) {
  return (
    <div className="px-4 py-3">
      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 font-mono text-xl font-semibold tabular-nums",
          tone === "warn" && "text-amber-500",
        )}
      >
        {value}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Pipeline                                                                  */
/* -------------------------------------------------------------------------- */

function JourneyPipeline({
  currentIdx,
  mappingByStage,
  onSelect,
  canEdit,
}: {
  currentIdx: number;
  mappingByStage: Map<string, { project_template_name: string | null }>;
  onSelect: (stage: JourneyStage) => void;
  canEdit: boolean;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            Jornada do cliente
          </div>
          <div className="mt-0.5 text-sm font-medium">
            {JOURNEY_STAGE_LABEL[JOURNEY_STAGES[currentIdx] ?? "onboarding"]}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-stretch gap-2 md:flex-nowrap">
        {JOURNEY_STAGES.map((stage, i) => {
          const done = i < currentIdx;
          const active = i === currentIdx;
          const map = mappingByStage.get(stage);
          return (
            <button
              key={stage}
              type="button"
              onClick={() => onSelect(stage)}
              disabled={!canEdit}
              className={cn(
                "group flex-1 min-w-[8.5rem] rounded-lg border px-3 py-2.5 text-left transition",
                active
                  ? "border-primary/60 bg-primary/10"
                  : done
                    ? "border-emerald-500/40 bg-emerald-500/5"
                    : "border-border/60 bg-background hover:border-border",
                !canEdit && "cursor-not-allowed opacity-70",
              )}
            >
              <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                {done ? (
                  <Check className="h-3 w-3 text-emerald-500" />
                ) : active ? (
                  <Sparkles className="h-3 w-3 text-primary" />
                ) : (
                  <span className="inline-block h-3 w-3 rounded-full border border-border/60" />
                )}
                Etapa {i + 1}
              </div>
              <div className="mt-1 text-sm font-medium">{JOURNEY_STAGE_LABEL[stage]}</div>
              {map?.project_template_name && (
                <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                  <FolderPlus className="h-3 w-3" />
                  <span className="truncate">{map.project_template_name}</span>
                </div>
              )}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Info className="h-3 w-3" />
        {canEdit
          ? "Clique em uma etapa para mover o cliente. Etapas com template criam um projeto automaticamente."
          : "Somente admins podem mover o cliente entre etapas."}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  History                                                                   */
/* -------------------------------------------------------------------------- */

function JourneyHistory({
  timeline,
}: {
  timeline: Array<{
    id: string;
    from_stage: string | null;
    to_stage: string;
    note: string | null;
    moved_by_name: string | null;
    project_id: string | null;
    project_name: string | null;
    created_at: string;
  }>;
}) {
  return (
    <ProfileSection
      title="Histórico da jornada"
      subtitle={
        timeline.length === 0
          ? "Sem movimentações registradas"
          : `${timeline.length} evento(s) registrados`
      }
      icon={<HistoryIcon className="h-4 w-4" />}
      bodyClassName={timeline.length === 0 ? undefined : "px-0 py-0"}
    >
      {timeline.length === 0 ? (
        <ProfileEmpty
          icon={<HistoryIcon className="h-4 w-4" />}
          title="Nenhuma movimentação ainda"
          hint="Quando você mover o cliente entre etapas, os eventos aparecerão aqui."
        />
      ) : (
        <ol className="divide-y divide-border/40">
          {timeline.map((ev) => {
            const from = ev.from_stage
              ? JOURNEY_STAGE_LABEL[ev.from_stage as JourneyStage] ?? ev.from_stage
              : null;
            const to =
              JOURNEY_STAGE_LABEL[ev.to_stage as JourneyStage] ?? ev.to_stage;
            return (
              <li key={ev.id} className="flex items-start gap-3 px-5 py-3 text-sm">
                <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {from && (
                      <>
                        <Badge variant="outline" className="text-[10px] font-medium">
                          {from}
                        </Badge>
                        <ChevronRight className="h-3 w-3 text-muted-foreground" />
                      </>
                    )}
                    <Badge tone="blue" className="text-[10px]">
                      {to}
                    </Badge>
                    {ev.project_name && (
                      <span className="ml-1 inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
                        <FolderPlus className="h-3 w-3" />
                        {ev.project_name}
                      </span>
                    )}
                  </div>
                  {ev.note && (
                    <div className="mt-1 text-xs text-muted-foreground">{ev.note}</div>
                  )}
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {DATE_FMT.format(new Date(ev.created_at))}
                    {ev.moved_by_name && <span>· por {ev.moved_by_name}</span>}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </ProfileSection>
  );

}

/* -------------------------------------------------------------------------- */
/*  Move dialog                                                               */
/* -------------------------------------------------------------------------- */

function MoveDialog({
  open,
  onOpenChange,
  currentStage,
  toStage,
  mapping,
  templates,
  isSubmitting,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  currentStage: JourneyStage;
  toStage: JourneyStage | null;
  mapping: { project_template_id: string | null; project_template_name: string | null } | null;
  templates: Array<{ id: string; name: string }>;
  isSubmitting: boolean;
  onConfirm: (payload: {
    note: string;
    createProject: boolean;
    projectTemplateId: string | null;
  }) => void;
}) {
  const [note, setNote] = useState("");
  const [createProject, setCreateProject] = useState(true);
  const [tplId, setTplId] = useState<string>("");

  useEffect(() => {
    if (open) {
      setNote("");
      setCreateProject(true);
      setTplId(mapping?.project_template_id ?? "");
    }
  }, [open, mapping]);

  if (!toStage) return null;
  const isBackward = JOURNEY_STAGES.indexOf(toStage) < JOURNEY_STAGES.indexOf(currentStage);
  const same = toStage === currentStage;
  const templateName =
    templates.find((t) => t.id === tplId)?.name ?? mapping?.project_template_name ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mover para {JOURNEY_STAGE_LABEL[toStage]}</DialogTitle>
          <DialogDescription>
            {same
              ? "Este cliente já está nesta etapa."
              : isBackward
                ? `Você está retornando o cliente de ${JOURNEY_STAGE_LABEL[currentStage]} para uma etapa anterior.`
                : `Avançar de ${JOURNEY_STAGE_LABEL[currentStage]} para ${JOURNEY_STAGE_LABEL[toStage]}.`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Nota (opcional)">
            <Textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Contexto da movimentação"
            />
          </Field>
          <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={createProject}
                onChange={(e) => setCreateProject(e.target.checked)}
              />
              <span>
                <span className="font-medium">
                  Criar projeto de {JOURNEY_STAGE_LABEL[toStage]} automaticamente
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {templateName
                    ? `Usará o template "${templateName}", já mapeado para esta etapa.`
                    : "Selecione um template abaixo para gerar o projeto padrão."}
                </span>
              </span>
            </label>
            {createProject && (
              <div className="mt-3">
                <Select value={tplId || "__none"} onValueChange={(v) => setTplId(v === "__none" ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar template" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Não criar projeto</SelectItem>
                    {templates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button
            disabled={isSubmitting || same}
            onClick={() =>
              onConfirm({
                note,
                createProject: createProject && !!tplId,
                projectTemplateId: createProject && tplId ? tplId : null,
              })
            }
          >
            {isSubmitting ? "Movendo…" : `Mover para ${JOURNEY_STAGE_LABEL[toStage]}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}