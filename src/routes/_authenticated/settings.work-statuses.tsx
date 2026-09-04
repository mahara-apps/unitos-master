/**
 * Cadastro de status de trabalho por escopo (projeto / job / tarefa).
 * Sem status cadastrados, as telas continuam usando os status embutidos.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, ListChecks, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { DashboardPageShell, DashboardPanelSurface } from "@/components/ui/dashboard-primitives";
import { PanelEmptyState } from "@/components/ui/panel-empty";
import { usePageHeader } from "@/hooks/use-page-header";
import { useActiveContext } from "@/hooks/use-active-context";
import {
  WORK_STATUS_SCOPES,
  createWorkStatusFn,
  deleteWorkStatusFn,
  listWorkStatusesFn,
  updateWorkStatusFn,
  type WorkStatus,
  type WorkStatusScope,
} from "@/lib/work-statuses.functions";

export const Route = createFileRoute("/_authenticated/settings/work-statuses")({
  component: WorkStatusesPage,
  head: () => ({
    meta: [
      { title: "Status de trabalho · Unitos" },
      {
        name: "description",
        content:
          "Cadastre os status usados em projetos, jobs e tarefas da sua workspace no Unitos.",
      },
      { property: "og:title", content: "Status de trabalho · Unitos" },
      {
        property: "og:description",
        content: "Configure status próprios para projetos, jobs e tarefas.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const SCOPE_LABEL: Record<WorkStatusScope, string> = {
  project: "Projetos",
  job: "Jobs",
  task: "Tarefas",
};

const DEFAULT_COLOR = "#8b5cf6";

function ScopeSection({ brandId, scope }: { brandId: string; scope: WorkStatusScope }) {
  const qc = useQueryClient();
  const list = useServerFn(listWorkStatusesFn);
  const create = useServerFn(createWorkStatusFn);
  const update = useServerFn(updateWorkStatusFn);
  const remove = useServerFn(deleteWorkStatusFn);

  const key = ["work-statuses", brandId, scope] as const;
  const q = useQuery({ queryKey: key, queryFn: () => list({ data: { brandId, scope } }) });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["work-statuses"] });

  const [name, setName] = useState("");
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [isDone, setIsDone] = useState(false);

  const createMut = useMutation({
    mutationFn: () => create({ data: { brandId, scope, name: name.trim(), color, isDone } }),
    onSuccess: () => {
      setName("");
      setColor(DEFAULT_COLOR);
      setIsDone(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const patchMut = useMutation({
    mutationFn: (v: { statusId: string; patch: Record<string, unknown> }) =>
      update({ data: { brandId, statusId: v.statusId, patch: v.patch as never } }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });
  const delMut = useMutation({
    mutationFn: (statusId: string) => remove({ data: { brandId, statusId } }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const statuses = (q.data ?? []) as WorkStatus[];

  return (
    <DashboardPanelSurface className="overflow-hidden">
      <div className="border-b border-border/60 bg-background/40 px-4 py-2.5">
        <h2 className="font-mono text-[11px] uppercase tracking-widest text-foreground">
          {SCOPE_LABEL[scope]}
        </h2>
      </div>

      {statuses.length === 0 ? (
        <PanelEmptyState
          icon={<ListChecks className="h-4 w-4" />}
          text={`Nenhum status cadastrado para ${SCOPE_LABEL[scope].toLowerCase()}. Sem cadastro, os status padrão continuam valendo.`}
        />
      ) : (
        <div className="divide-y divide-border/60">
          {statuses.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
              <input
                type="color"
                value={s.color}
                onChange={(e) => patchMut.mutate({ statusId: s.id, patch: { color: e.target.value } })}
                className="h-6 w-8 cursor-pointer rounded border border-border/60 bg-transparent"
                aria-label={`Cor de ${s.name}`}
              />
              <Input
                defaultValue={s.name}
                className="h-8 w-[220px]"
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== s.name) patchMut.mutate({ statusId: s.id, patch: { name: v } });
                }}
              />
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Checkbox
                  checked={s.is_done}
                  onCheckedChange={(v) =>
                    patchMut.mutate({ statusId: s.id, patch: { is_done: !!v } })
                  }
                />
                <CheckCircle2 className="h-3 w-3" /> Conta como concluído
              </label>
              <Button
                variant="ghost"
                size="icon"
                className="ml-auto h-7 w-7 text-muted-foreground hover:text-destructive"
                aria-label={`Excluir ${s.name}`}
                onClick={() => delMut.mutate(s.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3 border-t border-border/60 bg-background/40 px-4 py-3">
        <div className="grid gap-1.5">
          <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Novo status
          </Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Em aprovação"
            className="h-8 w-[240px]"
            onKeyDown={(e) => {
              if (e.key === "Enter" && name.trim()) createMut.mutate();
            }}
          />
        </div>
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="h-8 w-10 cursor-pointer rounded border border-border/60 bg-transparent"
          aria-label="Cor do novo status"
        />
        <label className="flex items-center gap-2 pb-1.5 text-xs text-muted-foreground">
          <Checkbox checked={isDone} onCheckedChange={(v) => setIsDone(!!v)} />
          Conta como concluído
        </label>
        <Button
          size="sm"
          className="h-8 gap-1.5"
          disabled={!name.trim() || createMut.isPending}
          onClick={() => createMut.mutate()}
        >
          <Plus className="h-3.5 w-3.5" /> Adicionar
        </Button>
      </div>
    </DashboardPanelSurface>
  );
}

function WorkStatusesPage() {
  const { brandId } = useActiveContext();
  usePageHeader(
    {
      title: "Status de trabalho",
      subtitle: "Projetos, jobs e tarefas",
    },
    [],
  );

  if (!brandId) return null;

  return (
    <DashboardPageShell>
      <p className="text-sm text-muted-foreground">
        Os status abaixo aparecem nos seletores de projeto, job e tarefa. Marcar “conta como
        concluído” ajuda os relatórios a entenderem o fim do trabalho.
      </p>
      {WORK_STATUS_SCOPES.map((scope) => (
        <ScopeSection key={scope} brandId={brandId} scope={scope} />
      ))}
    </DashboardPageShell>
  );
}
