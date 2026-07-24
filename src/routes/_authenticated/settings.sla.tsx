import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Timer, Trash2, Plus, Save, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import { DashboardPageShell, DashboardPanelSurface } from "@/components/ui/dashboard-primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { usePageHeader } from "@/hooks/use-page-header";
import { useActiveContext } from "@/hooks/use-active-context";
import {
  listSlaRulesFn,
  upsertSlaRuleFn,
  deleteSlaRuleFn,
  listStageSlasFn,
  updateStageSlaFn,
  listBrandProjectsForSlaFn,
  listBrandAgentsForSlaFn,
  ROLE_OPTIONS,
  type SlaRuleRow,
  type SlaScope,
  type StageSlaRow,
} from "@/lib/sla.functions";

export const Route = createFileRoute("/_authenticated/settings/sla")({
  component: SlaSettingsPage,
});

function formatHours(h: number) {
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  const r = h % 24;
  return r === 0 ? `${d}d` : `${d}d ${r}h`;
}

function SlaSettingsPage() {
  const { brandId } = useActiveContext();
  usePageHeader({
    title: "SLA",
    subtitle: "Metas de resposta e conclusão para colunas, projetos, equipe e agentes.",
  });

  if (!brandId) {
    return (
      <DashboardPageShell>
        <DashboardPanelSurface className="p-6 text-sm text-muted-foreground">
          Selecione uma marca ativa para configurar SLAs.
        </DashboardPanelSurface>
      </DashboardPageShell>
    );
  }

  return (
    <DashboardPageShell>
      <Tabs defaultValue="stages" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="stages">Colunas (Kanban)</TabsTrigger>
          <TabsTrigger value="projects">Projetos</TabsTrigger>
          <TabsTrigger value="team">Equipe</TabsTrigger>
          <TabsTrigger value="agents">Agentes de IA</TabsTrigger>
        </TabsList>

        <TabsContent value="stages">
          <StagesPanel brandId={brandId} />
        </TabsContent>
        <TabsContent value="projects">
          <RulesPanel brandId={brandId} scope="project" heading="SLA por projeto" allowProjectPicker={false} />
        </TabsContent>
        <TabsContent value="team">
          <RulesPanel brandId={brandId} scope="user_role" heading="SLA por papel de equipe" allowProjectPicker={true} />
        </TabsContent>
        <TabsContent value="agents">
          <RulesPanel brandId={brandId} scope="agent" heading="SLA por agente de IA" allowProjectPicker={true} />
        </TabsContent>
      </Tabs>
    </DashboardPageShell>
  );
}

/* ----------------------- Kanban stages panel ----------------------- */

function StagesPanel({ brandId }: { brandId: string }) {
  const qc = useQueryClient();
  const list = useServerFn(listStageSlasFn);
  const update = useServerFn(updateStageSlaFn);

  const q = useQuery({
    queryKey: ["sla-stages", brandId],
    queryFn: () => list({ data: { brandId } }),
  });

  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const mutation = useMutation({
    mutationFn: (payload: { stageId: string; slaHours: number | null }) =>
      update({ data: payload }),
    onSuccess: () => {
      toast.success("SLA da coluna atualizado.");
      qc.invalidateQueries({ queryKey: ["sla-stages", brandId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const grouped = useMemo(() => {
    const map = new Map<string, { name: string; stages: StageSlaRow[] }>();
    for (const s of q.data ?? []) {
      if (!map.has(s.pipeline_id)) map.set(s.pipeline_id, { name: s.pipeline_name, stages: [] });
      map.get(s.pipeline_id)!.stages.push(s);
    }
    return [...map.values()];
  }, [q.data]);

  return (
    <DashboardPanelSurface className="p-5 space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">SLA por coluna do Kanban</h2>
          <p className="text-xs text-muted-foreground">
            Tempo máximo (em horas) que um card pode permanecer em cada coluna antes de ser marcado como atrasado.
            Cards com 80% do tempo consumido aparecem como <span className="text-amber-600 dark:text-amber-400">próximos de vencer</span>.
          </p>
        </div>
      </header>

      {q.isLoading ? (
        <div className="text-sm text-muted-foreground">Carregando…</div>
      ) : grouped.length === 0 ? (
        <div className="text-sm text-muted-foreground">Nenhum pipeline configurado.</div>
      ) : (
        <div className="space-y-6">
          {grouped.map((g) => (
            <div key={g.name} className="space-y-2">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{g.name}</div>
              <div className="rounded-lg border border-border/60">
                {g.stages.map((s, i) => {
                  const draft = drafts[s.id] ?? (s.sla_hours == null ? "" : String(s.sla_hours));
                  return (
                    <div
                      key={s.id}
                      className={`flex items-center justify-between gap-3 px-4 py-3 ${
                        i > 0 ? "border-t border-border/50" : ""
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Timer className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm">{s.name}</span>
                        {s.sla_hours != null ? (
                          <span className="text-[11px] text-muted-foreground">· {formatHours(s.sla_hours)}</span>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2">
                        <SlaPresetPicker
                          onPick={(h) => {
                            setDrafts((d) => ({ ...d, [s.id]: String(h) }));
                            mutation.mutate({ stageId: s.id, slaHours: h });
                          }}
                        />
                        <Input
                          className="h-8 w-24"
                          type="number"
                          min={0}
                          placeholder="—"
                          value={draft}
                          onChange={(e) => setDrafts((d) => ({ ...d, [s.id]: e.target.value }))}
                        />
                        <span className="text-xs text-muted-foreground">horas</span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            mutation.mutate({
                              stageId: s.id,
                              slaHours: draft.trim() === "" ? null : Math.max(0, Number(draft)),
                            })
                          }
                        >
                          <Save className="h-3.5 w-3.5 mr-1" /> Salvar
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-start gap-2 rounded-md border border-border/50 bg-muted/20 p-3 text-[11px] text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Presets: 12h, 24h, 48h, 72h, 5d, 7d. Deixe em branco para desativar o SLA da coluna.
        </span>
      </div>
    </DashboardPanelSurface>
  );
}

const SLA_PRESETS: Array<{ label: string; hours: number }> = [
  { label: "12h", hours: 12 },
  { label: "24h", hours: 24 },
  { label: "48h", hours: 48 },
  { label: "72h", hours: 72 },
  { label: "5d", hours: 120 },
  { label: "7d", hours: 168 },
];

function SlaPresetPicker({ onPick }: { onPick: (hours: number) => void }) {
  return (
    <TooltipProvider delayDuration={150}>
      <div className="hidden gap-1 md:flex">
        {SLA_PRESETS.map((p) => (
          <Tooltip key={p.hours}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => onPick(p.hours)}
                className="rounded-md border border-border/60 bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
              >
                {p.label}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">Definir SLA como {p.label}</TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  );
}

/* ----------------------- Generic rules panel ----------------------- */

function RulesPanel({
  brandId,
  scope,
  heading,
  allowProjectPicker,
}: {
  brandId: string;
  scope: SlaScope;
  heading: string;
  allowProjectPicker: boolean;
}) {
  const qc = useQueryClient();
  const listRules = useServerFn(listSlaRulesFn);
  const upsert = useServerFn(upsertSlaRuleFn);
  const del = useServerFn(deleteSlaRuleFn);
  const listProjects = useServerFn(listBrandProjectsForSlaFn);
  const listAgents = useServerFn(listBrandAgentsForSlaFn);

  const rulesQ = useQuery({
    queryKey: ["sla-rules", brandId],
    queryFn: () => listRules({ data: { brandId } }),
  });
  const projectsQ = useQuery({
    queryKey: ["sla-projects", brandId],
    queryFn: () => listProjects({ data: { brandId } }),
  });
  const agentsQ = useQuery({
    queryKey: ["sla-agents"],
    queryFn: () => listAgents({ data: {} }),
    enabled: scope === "agent",
  });

  const rules = (rulesQ.data ?? []).filter((r) => r.scope === scope);
  const projectName = (id: string | null) =>
    id ? projectsQ.data?.find((p) => p.id === id)?.name ?? "Projeto removido" : "Global";

  const scopeRefLabel = (ref: string | null) => {
    if (!ref) return "—";
    if (scope === "user_role") return ROLE_OPTIONS.find((r) => r.id === ref)?.label ?? ref;
    if (scope === "agent") return agentsQ.data?.find((a) => a.agent_id === ref)?.agent_name ?? ref;
    return ref;
  };

  const [form, setForm] = useState<{
    scopeRef: string;
    projectId: string;
    targetHours: number;
  }>({
    scopeRef: scope === "project" ? "" : scope === "user_role" ? "manager" : "",
    projectId: "",
    targetHours: 24,
  });

  const upsertM = useMutation({
    mutationFn: () =>
      upsert({
        data: {
          brandId,
          scope,
          scopeRef:
            scope === "project"
              ? null
              : form.scopeRef.trim() === ""
                ? null
                : form.scopeRef,
          projectId:
            scope === "project"
              ? form.projectId || null
              : allowProjectPicker && form.projectId
                ? form.projectId
                : null,
          targetHours: Number(form.targetHours),
          isActive: true,
        },
      }),
    onSuccess: () => {
      toast.success("Regra de SLA salva.");
      qc.invalidateQueries({ queryKey: ["sla-rules", brandId] });
      setForm((f) => ({ ...f, projectId: "" }));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delM = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Regra removida.");
      qc.invalidateQueries({ queryKey: ["sla-rules", brandId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleM = useMutation({
    mutationFn: (r: SlaRuleRow) =>
      upsert({
        data: {
          brandId,
          scope: r.scope,
          scopeRef: r.scope_ref,
          projectId: r.project_id,
          targetHours: r.target_hours,
          isActive: !r.is_active,
        },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sla-rules", brandId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <DashboardPanelSurface className="p-5 space-y-6">
      <header className="space-y-1">
        <h2 className="text-base font-semibold">{heading}</h2>
        <p className="text-xs text-muted-foreground">
          Defina metas globais para toda a marca ou específicas por projeto. Regras específicas prevalecem sobre a global.
        </p>
      </header>

      {/* Form */}
      <div className="grid gap-3 rounded-lg border border-border/60 bg-muted/20 p-4 md:grid-cols-[1fr_1fr_140px_auto]">
        {scope === "project" ? (
          <div className="space-y-1.5">
            <Label className="text-xs">Projeto (vazio = padrão da marca)</Label>
            <Select
              value={form.projectId || "__global__"}
              onValueChange={(v) => setForm((f) => ({ ...f, projectId: v === "__global__" ? "" : v }))}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Global" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__global__">Global (todos os projetos)</SelectItem>
                {projectsQ.data?.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label className="text-xs">{scope === "user_role" ? "Papel" : "Agente"}</Label>
            <Select value={form.scopeRef} onValueChange={(v) => setForm((f) => ({ ...f, scopeRef: v }))}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Selecionar" />
              </SelectTrigger>
              <SelectContent>
                {(scope === "user_role" ? ROLE_OPTIONS : (agentsQ.data ?? []).map((a) => ({ id: a.agent_id, label: a.agent_name }))).map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {allowProjectPicker && scope !== "project" ? (
          <div className="space-y-1.5">
            <Label className="text-xs">Escopo do projeto</Label>
            <Select
              value={form.projectId || "__global__"}
              onValueChange={(v) => setForm((f) => ({ ...f, projectId: v === "__global__" ? "" : v }))}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Global" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__global__">Global (toda a marca)</SelectItem>
                {projectsQ.data?.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div />
        )}

        <div className="space-y-1.5">
          <Label className="text-xs">Meta (horas)</Label>
          <Input
            type="number"
            min={1}
            className="h-9"
            value={form.targetHours}
            onChange={(e) => setForm((f) => ({ ...f, targetHours: Number(e.target.value) }))}
          />
        </div>
        <div className="flex items-end">
          <Button
            onClick={() => upsertM.mutate()}
            disabled={upsertM.isPending || (scope !== "project" && !form.scopeRef)}
            className="h-9"
          >
            <Plus className="h-3.5 w-3.5 mr-1" /> Salvar regra
          </Button>
        </div>
      </div>

      {/* List */}
      <div className="rounded-lg border border-border/60">
        <div className="grid grid-cols-[1fr_1fr_120px_100px_60px] gap-2 border-b border-border/60 bg-muted/30 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <div>{scope === "project" ? "Projeto" : scope === "user_role" ? "Papel" : "Agente"}</div>
          <div>{scope === "project" ? "—" : "Projeto"}</div>
          <div>Meta</div>
          <div>Ativo</div>
          <div className="text-right">Ações</div>
        </div>
        {rulesQ.isLoading ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">Carregando…</div>
        ) : rules.length === 0 ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">Nenhuma regra configurada ainda.</div>
        ) : (
          rules.map((r) => (
            <div
              key={r.id}
              className="grid grid-cols-[1fr_1fr_120px_100px_60px] items-center gap-2 border-t border-border/50 px-4 py-2.5 text-sm"
            >
              <div className="flex items-center gap-2">
                {scope === "project" ? (
                  <Badge variant="secondary">{projectName(r.project_id)}</Badge>
                ) : (
                  <span>{scopeRefLabel(r.scope_ref)}</span>
                )}
              </div>
              <div className="text-muted-foreground">
                {scope === "project" ? "—" : projectName(r.project_id)}
              </div>
              <div>{formatHours(r.target_hours)}</div>
              <div>
                <Switch checked={r.is_active} onCheckedChange={() => toggleM.mutate(r)} />
              </div>
              <div className="flex justify-end">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => delM.mutate(r.id)}
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </DashboardPanelSurface>
  );
}