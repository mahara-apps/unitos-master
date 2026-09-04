/**
 * Modal de resumo de um item de pauta (job virtual "Pautas") dentro da tela do
 * projeto. Objetivo: gestão sem trocar de página — a ida para Conteúdo passa a
 * ser uma saída opcional no rodapé.
 *
 * Só apresentação + reuso das funções já existentes (tarefas e comentários).
 * Nenhum campo novo de banco: o "dono" do item é o responsável da tarefa de
 * produção correspondente.
 */
import { useMemo, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { ExternalLink, Image as ImageIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PanelEmptyState } from "@/components/ui/panel-empty";
import { ExpandedModal } from "@/components/ui/expanded-modal";
import { listTasksFn, updateTaskFn, type TaskRow } from "@/lib/tasks.functions";
import { AssigneePicker, type TeamOption } from "./assignee-picker";
import { StatusPicker } from "./status-picker";
import { CommentThread } from "./comment-thread";
import { WorkItemRow, formatShortDate, isOverdue } from "./work-item-row";

export type PautaDetailItem = {
  /** Chave estável do item (topic_id ou post id quando fora da pauta). */
  key: string;
  title: string;
  coverUrl: string | null;
  channelLabel: string | null;
  formatLabel: string | null;
  stateLabel: string;
  stateClassName: string;
  scheduledAt: string | null;
  postId: string | null;
  /** Item sem tópico de pauta (peça criada fora da pauta). */
  outOfPlan?: boolean;
  planId?: string | null;
};

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-1">
      <span className="block font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}

export function PautaDetailModal({
  open,
  onOpenChange,
  brandId,
  projectId,
  clientId,
  item,
  team,
  currentUserId,
  canEdit,
  onOpenTask,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  brandId: string;
  projectId: string;
  clientId: string | null;
  item: PautaDetailItem | null;
  team: TeamOption[];
  currentUserId?: string | null;
  canEdit: boolean;
  /** Abre o drawer de tarefa (mesmo usado na lista de tarefas do job). */
  onOpenTask?: (taskId: string) => void;
}) {
  const qc = useQueryClient();
  const listTasks = useServerFn(listTasksFn);
  const updateTask = useServerFn(updateTaskFn);

  const tasksQ = useQuery({
    queryKey: ["tasks", brandId, clientId ?? null, "all"],
    enabled: open && !!brandId,
    queryFn: () => listTasks({ data: { brandId, clientId: clientId ?? null, archive: "all" } }),
  });

  const tasks = useMemo(() => {
    const all = (tasksQ.data ?? []) as TaskRow[];
    if (!item?.postId) return [];
    return all.filter((t) => t.post_id === item.postId && t.project_id === projectId);
  }, [tasksQ.data, item?.postId, projectId]);

  const primary = tasks[0] ?? null;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["tasks", brandId] });
    qc.invalidateQueries({ queryKey: ["job-tasks", brandId, projectId] });
    qc.invalidateQueries({ queryKey: ["project", brandId, projectId] });
  };

  const patchMut = useMutation({
    mutationFn: (v: { taskId: string; patch: Record<string, unknown> }) =>
      updateTask({ data: { brandId, taskId: v.taskId, patch: v.patch as never } }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  if (!item) return null;

  const ownerDisabled = !canEdit || !primary || patchMut.isPending;

  return (
    <ExpandedModal
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      title={item.title}
      description={
        [item.channelLabel, item.formatLabel].filter(Boolean).join(" · ") ||
        (item.outOfPlan ? "Peça fora da pauta" : "Item da pauta")
      }
      headerExtra={
        <Badge variant="outline" className={`text-[10px] ${item.stateClassName}`}>
          {item.stateLabel}
        </Badge>
      }
      footer={
        <>
          {item.planId && !item.outOfPlan ? (
            <Button asChild variant="ghost" size="sm" className="h-9">
              <Link to="/monthly-plan/$planId" params={{ planId: item.planId }}>
                Ver na pauta
              </Link>
            </Button>
          ) : null}
          {item.postId ? (
            <Button asChild variant="outline" size="sm" className="h-9">
              <Link to="/content" search={{ post: item.postId }}>
                <ExternalLink className="mr-2 h-4 w-4" />
                Abrir peça em Conteúdo
              </Link>
            </Button>
          ) : null}
        </>
      }
    >
      <div className="space-y-5">
        {/* Identidade da peça */}
        <div className="flex items-start gap-3">
          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md bg-muted">
            {item.coverUrl ? (
              <img src={item.coverUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <ImageIcon className="h-5 w-5 text-muted-foreground" />
              </div>
            )}
          </div>
          <div className="grid min-w-0 flex-1 grid-cols-2 gap-3">
            <Field label="Canal">
              <span className="block truncate text-sm">{item.channelLabel ?? "Não definido"}</span>
            </Field>
            <Field label="Formato">
              <span className="block truncate text-sm">{item.formatLabel ?? "Não definido"}</span>
            </Field>
            <Field label="Agendamento">
              <span className="block text-sm tabular-nums">
                {formatShortDate(item.scheduledAt) ?? "—"}
              </span>
            </Field>
            <Field label="Prazo">
              <span className="block text-sm tabular-nums">
                {formatShortDate(primary?.due_at ?? null) ?? "—"}
              </span>
            </Field>
          </div>
        </div>

        {/* Dono + status do item (grava na tarefa de produção) */}
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border/60 bg-muted/30 p-3">
          <Field label="Dono">
            <AssigneePicker
              value={primary?.assignee_id ?? null}
              options={team}
              disabled={ownerDisabled}
              onChange={(userId) =>
                primary && patchMut.mutate({ taskId: primary.id, patch: { assignee_id: userId } })
              }
            />
          </Field>
          {primary ? (
            <Field label="Status">
              <StatusPicker
                brandId={brandId}
                scope="task"
                value={primary.status_id}
                disabled={!canEdit || patchMut.isPending}
                onChange={(statusId) =>
                  patchMut.mutate({ taskId: primary.id, patch: { status_id: statusId } })
                }
              />
            </Field>
          ) : null}
          {!primary ? (
            <span className="text-[11px] text-muted-foreground">
              Dono disponível após a pauta virar produção.
            </span>
          ) : null}
        </div>

        {/* Tarefas de produção ligadas ao item */}
        <section className="space-y-2">
          <h4 className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Tarefas de produção
          </h4>
          {tasksQ.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : tasks.length === 0 ? (
            <div className="rounded-lg border border-border/60">
              <PanelEmptyState
                text="Nenhuma tarefa de produção vinculada a este item ainda."
                icon={null}
              />
            </div>
          ) : (
            <div className="divide-y divide-border/60 overflow-hidden rounded-lg border border-border/60">
              {tasks.map((t) => (
                <WorkItemRow
                  key={t.id}
                  title={t.title}
                  done={t.done}
                  onOpen={onOpenTask ? () => onOpenTask(t.id) : undefined}
                  assignee={
                    <span className="hidden text-[11px] text-muted-foreground sm:inline">
                      {team.find((m) => m.user_id === t.assignee_id)?.full_name ?? "Sem dono"}
                    </span>
                  }
                  dateLabel={formatShortDate(t.due_at)}
                  overdue={isOverdue(t.due_at, t.done)}
                />
              ))}
            </div>
          )}
        </section>

        {/* Observações do item */}
        <section className="space-y-2">
          <h4 className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Observações
          </h4>
          {primary ? (
            <CommentThread
              brandId={brandId}
              level="task"
              taskId={primary.id}
              currentUserId={currentUserId}
              placeholder="Registrar observação sobre esta pauta…"
            />
          ) : (
            <p className="text-[11px] text-muted-foreground">
              As observações ficam disponíveis quando o item vira tarefa de produção.
            </p>
          )}
        </section>
      </div>
    </ExpandedModal>
  );
}
