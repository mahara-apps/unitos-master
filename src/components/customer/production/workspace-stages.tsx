import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Eye, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageKpi, PageKpiGrid } from "@/components/ui/page-kpi";
import { SettingsLoadingState, SettingsPageState } from "@/components/settings/settings-page-state";
import { useAccessRole } from "@/hooks/use-access-role";
import { describeError } from "@/lib/errors";
import { PRODUCTION_COLORS, defaultProductionStages, needsProductionDestination, productionStagesSchema, type ProductionStage, type ProductionPreview } from "@/lib/production-stages";
import { getProductionStagesFn, saveProductionStagesFn, previewProductionStagesFn, applyProductionStagesFn } from "@/lib/production-stages.functions";

const swatches: Record<ProductionStage["color"], string> = {
  muted: "bg-muted-foreground", indigo: "bg-content-production", violet: "bg-content-design",
  amber: "bg-content-review", emerald: "bg-content-approved", sky: "bg-primary", rose: "bg-destructive", cyan: "bg-content-scheduled",
};

export function WorkspaceStages({ brandId }: { brandId: string }) {
  const qc = useQueryClient();
  const { role } = useAccessRole();
  const canEdit = role === "admin";
  const get = useServerFn(getProductionStagesFn);
  const save = useServerFn(saveProductionStagesFn);
  const previewFn = useServerFn(previewProductionStagesFn);
  const apply = useServerFn(applyProductionStagesFn);
  const q = useQuery({ queryKey: ["production-stage-defaults", brandId], queryFn: () => get({ data: { brandId } }) });
  const [stages, setStages] = useState<ProductionStage[]>(defaultProductionStages);
  const [keepExceptions, setKeepExceptions] = useState(true);
  const [preview, setPreview] = useState<ProductionPreview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [operationId, setOperationId] = useState("");
  useEffect(() => { if (q.data) setStages(q.data.stages); }, [q.data]);

  const invalidate = async () => {
    await Promise.all([qc.invalidateQueries({ queryKey: ["production-stage-defaults", brandId] }),
      qc.invalidateQueries({ queryKey: ["content-pipelines"] }), qc.invalidateQueries({ queryKey: ["content-board"] }),
      qc.invalidateQueries({ queryKey: ["production-pipeline-status"] })]);
  };
  const saveM = useMutation({ mutationFn: () => save({ data: { brandId, stages: productionStagesSchema.parse(stages) } }),
    onSuccess: () => { toast.success("Padrão salvo. Quadros existentes não foram alterados."); void invalidate(); },
    onError: (e) => toast.error(describeError(e)) });
  const previewM = useMutation({ mutationFn: () => previewFn({ data: { brandId, stages: productionStagesSchema.parse(stages), keepExceptions, mapping: {} } }),
    onSuccess: (value) => { setMapping({}); setOperationId(crypto.randomUUID()); setPreview(value); },
    onError: (e) => toast.error(describeError(e)) });
  const applyM = useMutation({ mutationFn: async () => {
    if (!preview) throw new Error("Confira a prévia antes de aplicar.");
    return apply({ data: { brandId, stages, keepExceptions, mapping, fingerprint: preview.fingerprint, operationId } });
  }, onSuccess: (result) => { toast.success(`Padrão aplicado a ${result.clients} cliente(s).`, { description: `${result.movedPosts} peça(s) transferida(s).` }); setPreview(null); void invalidate(); },
  onError: (e) => toast.error(describeError(e)) });
  const busy = !canEdit || saveM.isPending || previewM.isPending || applyM.isPending;
  function patch(index: number, values: Partial<ProductionStage>) {
    setStages((current) => current.map((stage, i) => i === index ? { ...stage, ...values } : stage));
  }
  function move(index: number, direction: number) {
    setStages((current) => { const next = [...current]; const item = next[index]; if (!item) return current;
      next.splice(index, 1); next.splice(index + direction, 0, item); return next; });
  }
  if (q.isLoading) return <SettingsLoadingState />;
  if (q.isError || !q.data) return <SettingsPageState kind="error" title="Não foi possível carregar as etapas" description={describeError(q.error)} actionLabel="Tentar novamente" onAction={() => void q.refetch()} />;
  return <section className="space-y-4 border-t border-border pt-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-base font-semibold">Etapas de produção</h2>
      <Badge variant="outline">{q.data.configured ? "Padrão configurado" : "Padrão ainda não salvo"}</Badge>
    </div>
    <div className="divide-y divide-border">
      {stages.map((stage, index) => <div key={stage.key} className="space-y-3 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex shrink-0">
            <Button size="icon" variant="ghost" title="Mover etapa para cima" aria-label="Mover etapa para cima" disabled={busy || index === 0} onClick={() => move(index, -1)}><ArrowUp className="size-4" /></Button>
            <Button size="icon" variant="ghost" title="Mover etapa para baixo" aria-label="Mover etapa para baixo" disabled={busy || index === stages.length - 1} onClick={() => move(index, 1)}><ArrowDown className="size-4" /></Button>
          </div>
          <Input className="min-w-40 flex-1" aria-label={`Nome da etapa ${index + 1}`} maxLength={40} value={stage.label} disabled={busy} onChange={(e) => patch(index, { label: e.target.value })} />
          <div className="flex items-center gap-1">
            {PRODUCTION_COLORS.map((color) => <Button key={color} size="icon" variant="ghost" className="size-7" title={`Cor ${color}`} aria-label={`Cor ${color} da etapa ${index + 1}`} aria-pressed={stage.color === color} disabled={busy} onClick={() => patch(index, { color })}>
              <span className={`size-4 rounded-full ${swatches[color]} ${stage.color === color ? "ring-2 ring-foreground ring-offset-2 ring-offset-background" : ""}`} />
            </Button>)}
          </div>
          <Button size="icon" variant="ghost" title="Remover etapa" aria-label={`Remover etapa ${stage.label}`} disabled={busy || stages.length === 1} onClick={() => setStages((current) => current.filter((_, i) => i !== index))}><Trash2 className="size-4 text-destructive" /></Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Label className="flex items-center gap-2 text-xs">SLA (horas)<Input type="number" className="w-24" aria-label={`SLA de ${stage.label}`} min={0} max={8760} value={stage.sla_hours ?? ""} disabled={busy} onChange={(e) => patch(index, { sla_hours: e.target.value === "" ? null : Number(e.target.value) })} /></Label>
          <Label className="flex items-center justify-between gap-2 text-xs">Etapa final<Switch aria-label={`Etapa final ${stage.label}`} checked={stage.is_terminal} disabled={busy} onCheckedChange={(v) => patch(index, { is_terminal: v })} /></Label>
          <Label className="flex items-center justify-between gap-2 text-xs">Visível no portal<Switch aria-label={`Visível no portal ${stage.label}`} checked={!stage.hide_in_portal} disabled={busy} onCheckedChange={(v) => patch(index, { hide_in_portal: !v })} /></Label>
          <Label className="flex items-center justify-between gap-2 text-xs">Link de aprovação<Switch aria-label={`Link de aprovação ${stage.label}`} checked={stage.enables_approval_link} disabled={busy} onCheckedChange={(v) => patch(index, { enables_approval_link: v })} /></Label>
        </div>
      </div>)}
    </div>
    {canEdit && <>
      <Button variant="outline" size="sm" disabled={busy || stages.length >= 40} onClick={() => setStages((current) => [...current, { key: `stage-${crypto.randomUUID()}`, label: "Nova etapa", color: "muted", is_terminal: false, hide_in_portal: false, enables_approval_link: false, sla_hours: null }])}><Plus className="mr-2 size-4" />Adicionar etapa</Button>
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4">
        <Label className="flex items-center gap-3"><Switch aria-label="Manter clientes com exceção" checked={keepExceptions} disabled={busy} onCheckedChange={setKeepExceptions} />Manter clientes com exceção</Label>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={busy} onClick={() => saveM.mutate()}>Salvar padrão para novos clientes</Button>
          <Button disabled={busy} onClick={() => previewM.mutate()}>{previewM.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Eye className="mr-2 size-4" />}Prévia de aplicação</Button>
        </div>
      </div>
    </>}
    <Dialog open={!!preview} onOpenChange={(open) => { if (!open && !applyM.isPending) setPreview(null); }}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader><DialogTitle>Aplicar etapas aos clientes</DialogTitle><DialogDescription>Somente o quadro principal será alterado. Quadros adicionais e regras de aprovação permanecem intactos.</DialogDescription></DialogHeader>
        {preview && <>
          <PageKpiGrid columns={2}><PageKpi label="Clientes afetados" value={preview.clients.filter((c) => !c.skipped).length} /><PageKpi label="Exceções preservadas" value={preview.clients.filter((c) => c.skipped).length} /></PageKpiGrid>
          <div className="divide-y divide-border">
            {preview.clients.map((client) => <div key={client.pipelineId ?? client.clientId} className="space-y-2 py-3">
              <div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold">{client.name}</h3><Badge variant="outline">{client.skipped ? "Exceção preservada" : client.changes.length ? "Será atualizado" : "Igual ao padrão"}</Badge></div>
              {!client.skipped && client.changes.map((change, i) => <div key={`${change.stageId ?? change.key}-${i}`} className="space-y-2 text-sm text-muted-foreground">
                <p>{change.kind === "add" ? "Adicionar" : change.kind === "remove" ? "Remover" : "Atualizar"}: {change.previous && change.previous !== change.label ? `${change.previous} → ` : ""}{change.label}{change.kind === "remove" ? ` · ${change.posts ?? 0} peça(s)` : ""}</p>
                {change.kind === "remove" && (change.posts ?? 0) > 0 && change.stageId && <Select value={mapping[change.stageId] ?? ""} disabled={applyM.isPending} onValueChange={(value) => { const id = change.stageId; if (id) setMapping((current) => ({ ...current, [id]: value })); }}>
                  <SelectTrigger aria-label={`Destino das peças de ${change.label} em ${client.name}`}><SelectValue placeholder="Escolha a etapa de destino" /></SelectTrigger>
                  <SelectContent>{stages.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}</SelectContent>
                </Select>}
              </div>)}
            </div>)}
          </div>
          <DialogFooter><Button variant="outline" disabled={applyM.isPending} onClick={() => setPreview(null)}>Voltar</Button><Button disabled={applyM.isPending || needsProductionDestination(preview, stages, mapping)} onClick={() => applyM.mutate()}>{applyM.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}Confirmar aplicação</Button></DialogFooter>
        </>}
      </DialogContent>
    </Dialog>
  </section>;
}