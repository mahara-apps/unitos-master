import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Clock3,
  FileText,
  Plus,
  Radio,
} from "lucide-react";
import { toast } from "sonner";
import { AssigneeAvatar, type TeamOption } from "@/components/projects/assignee-picker";
import { StageFunnel } from "@/components/projects/stage-funnel";
import { StatusBadge, useWorkStatuses } from "@/components/projects/status-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PageKpi, PageKpiGrid, type KpiStatus } from "@/components/ui/page-kpi";
import { Progress } from "@/components/ui/progress";
import { DashboardPanelSurface } from "@/components/ui/dashboard-primitives";
import { Skeleton } from "@/components/ui/skeleton";
import { CONTENT_STAGES, type ContentStage } from "@/lib/content-stage-tokens";
import {
  createJobFn,
  getProjectOverviewFn,
  type ProjectOverviewActivity,
} from "@/lib/project-jobs.functions";
import { formatMinutes } from "@/lib/timesheet.functions";
import { formatDateBr, formatDateTimeBr, isoDateInTz } from "@/lib/timezone";
import { ensureWorkStatusDefaultsFn } from "@/lib/work-statuses.functions";
import { cn } from "@/lib/utils";

type Deadline = { key: string; title: string; kindLabel: string; date: string; onOpen?: () => void };

type Props = {
  brandId: string;
  projectId: string;
  dueAt: string | null;
  completedItems: number;
  publishedItems: number;
  totalItems: number;
  funnelCounts: Record<ContentStage, number>;
  pautaCount: number;
  approvedCount: number;
  deadlines: Deadline[];
  team: TeamOption[];
  onSelectStage: (stage: ContentStage | null) => void;
  onOpenJob: (jobId: string) => void;
  onViewJobs: () => void;
  onOpenPautas: () => void;
};

function calendarDaysUntil(date: string | null) {
  if (!date) return null;
  const due = date.slice(0, 10);
  const today = isoDateInTz();
  const parse = (value: string) => {
    const [year, month, day] = value.split("-").map(Number);
    return Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1);
  };
  return Math.ceil((parse(due) - parse(today)) / 86_400_000);
}

function activityLabel(event: ProjectOverviewActivity) {
  const actions: Record<string, string> = {
    created: "criou",
    updated: "atualizou",
    archived: "arquivou",
    restored: "restaurou",
    deleted: "excluiu",
    timer_started: "iniciou o timer de",
    timer_stopped: "parou o timer de",
    completed: "concluiu",
    reopened: "reabriu",
  };
  const entities: Record<string, string> = { project: "o projeto", job: "um job", task: "uma tarefa" };
  return `${actions[event.verb] ?? event.verb.replaceAll("_", " ")} ${entities[event.entity_type] ?? "um item"}`;
}

function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 border-b border-border/60 px-4 py-2.5">
      <h2 className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{title}</h2>
      {action}
    </div>
  );
}

export function ProjectOverview(props: Props) {
  const queryClient = useQueryClient();
  const getOverview = useServerFn(getProjectOverviewFn);
  const createJob = useServerFn(createJobFn);
  const ensureStatuses = useServerFn(ensureWorkStatusDefaultsFn);
  const statusesQ = useWorkStatuses(props.brandId, "job");
  const [newJobOpen, setNewJobOpen] = useState(false);
  const [newJobName, setNewJobName] = useState("");
  const ensuredStatuses = useRef(false);

  const overviewQ = useQuery({
    queryKey: ["project-overview", props.brandId, props.projectId],
    queryFn: () => getOverview({ data: { brandId: props.brandId, projectId: props.projectId } }),
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (ensuredStatuses.current) return;
    ensuredStatuses.current = true;
    ensureStatuses({ data: { brandId: props.brandId } })
      .then(() => queryClient.invalidateQueries({ queryKey: ["work-statuses", props.brandId] }))
      .catch(() => undefined);
  }, [ensureStatuses, props.brandId, queryClient]);

  const createMut = useMutation({
    mutationFn: () =>
      createJob({ data: { brandId: props.brandId, projectId: props.projectId, name: newJobName.trim() } }),
    onSuccess: async (row) => {
      setNewJobName("");
      setNewJobOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["project-overview", props.brandId, props.projectId] });
      await queryClient.invalidateQueries({ queryKey: ["project-jobs", props.brandId, props.projectId] });
      props.onOpenJob(row.id);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const overview = overviewQ.data;
  const jobs = overview?.jobs.slice(0, 6) ?? [];
  const statuses = statusesQ.data ?? [];
  const progress = props.totalItems > 0 ? Math.round((props.completedItems / props.totalItems) * 100) : 0;
  const days = calendarDaysUntil(props.dueAt);
  const deadlineStatus: KpiStatus = days === null ? "neutral" : days < 0 ? "danger" : days <= 7 ? "warning" : "info";
  const deadlineValue = days === null ? "Sem prazo" : days < 0 ? `${Math.abs(days)}d atrasado` : days === 0 ? "Hoje" : `${days} dias`;

  const statusMap = useMemo(() => new Map(statuses.map((status) => [status.id, status])), [statuses]);

  return (
    <div className="space-y-4">
      <PageKpiGrid columns={4}>
        <PageKpi
          label="Peças concluídas"
          value={`${props.completedItems}/${props.totalItems}`}
          icon={<CheckCircle2 />}
          status={progress === 100 ? "success" : "info"}
          description={`${progress}% concluído`}
        />
        <PageKpi
          label="Publicadas"
          value={props.publishedItems}
          icon={<Radio />}
          status={props.publishedItems > 0 ? "success" : "neutral"}
          description={`de ${props.totalItems} peças`}
        />
        <PageKpi
          label="Tempo do projeto"
          value={overviewQ.isLoading ? "—" : formatMinutes(overview?.totalMinutes ?? 0)}
          icon={<Clock3 />}
          status={overview?.running ? "success" : "neutral"}
          description={overview?.running ? "timer em andamento" : "horas somadas dos jobs"}
        />
        <PageKpi
          label="Prazo"
          value={deadlineValue}
          icon={<CalendarClock />}
          status={deadlineStatus}
          description={props.dueAt ? formatDateBr(props.dueAt) : "data de entrega não definida"}
        />
      </PageKpiGrid>

      <DashboardPanelSurface>
        <SectionHeader title="Pipeline de conteúdo" />
        <div className="p-3 sm:p-4">
          <StageFunnel counts={props.funnelCounts} onSelect={props.onSelectStage} />
        </div>
      </DashboardPanelSurface>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <DashboardPanelSurface className="min-w-0">
          <SectionHeader
            title="Resumo de jobs"
            action={
              <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setNewJobOpen(true)}>
                <Plus className="h-3.5 w-3.5" /> Novo job
              </Button>
            }
          />
          {overviewQ.isLoading ? (
            <div className="space-y-2 p-4"><Skeleton className="h-14" /><Skeleton className="h-14" /><Skeleton className="h-14" /></div>
          ) : jobs.length === 0 ? (
            <div className="grid min-h-44 place-items-center px-5 text-center text-xs text-muted-foreground">Nenhum job ativo neste projeto.</div>
          ) : (
            <div className="divide-y divide-border/60">
              {jobs.map((job) => {
                const percent = job.taskTotal ? Math.round((job.taskDone / job.taskTotal) * 100) : 0;
                const jobStatus = job.status_id ? statusMap.get(job.status_id) : undefined;
                return (
                  <div key={job.id} className="grid min-h-16 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 lg:grid-cols-[auto_minmax(180px,1fr)_130px_90px_100px_150px]">
                    <span className="rounded-md border border-border/60 bg-background px-2 py-1 font-mono text-[10px] tabular-nums text-muted-foreground">#{job.job_number}.1</span>
                    <Button variant="ghost" className="h-auto min-w-0 justify-start p-0 text-left" onClick={() => props.onOpenJob(job.id)}>
                      <span className="truncate text-sm font-semibold">{job.name}</span>
                    </Button>
                    <div className="col-span-3 flex items-center gap-2 lg:col-span-1">
                      <span className="w-8 shrink-0 text-[10px] tabular-nums text-muted-foreground">{job.taskDone}/{job.taskTotal}</span>
                      <Progress value={percent} className="h-1.5 flex-1" />
                    </div>
                    <span className={cn("hidden items-center gap-1 text-xs tabular-nums lg:flex", job.running ? "text-health-good" : "text-muted-foreground")}>
                      <Clock3 className={cn("h-3.5 w-3.5", job.running && "animate-pulse")} /> {formatMinutes(job.minutes)}
                    </span>
                    <div className="hidden items-center lg:flex">
                      {job.participantIds.length ? job.participantIds.slice(0, 3).map((id, index) => (
                        <AssigneeAvatar key={id} userId={id} options={props.team} className={cn("h-7 w-7 border-2 border-background", index > 0 && "-ml-2")} />
                      )) : <span className="text-[11px] text-muted-foreground">Sem responsável</span>}
                    </div>
                    <div className="hidden lg:block"><StatusBadge statusId={job.status_id} statuses={statuses} />{!jobStatus ? <span className="text-[11px] text-muted-foreground">Sem status</span> : null}</div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex justify-end border-t border-border/60 px-4 py-2.5">
            <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" onClick={props.onViewJobs}>Ver todos os jobs <ArrowRight className="h-3.5 w-3.5" /></Button>
          </div>
        </DashboardPanelSurface>

        <aside className="min-w-0 space-y-4">
          <DashboardPanelSurface>
            <SectionHeader title="Pautas" />
            <Button variant="ghost" className="h-auto w-full justify-between rounded-none px-4 py-4 text-left" onClick={props.onOpenPautas}>
              <span className="flex items-center gap-3"><FileText className="h-4 w-4 text-primary" /><span><span className="block text-sm font-semibold">{props.pautaCount} {props.pautaCount === 1 ? "peça" : "peças"}</span><span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">{props.approvedCount} aprovadas</span></span></span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </DashboardPanelSurface>

          <DashboardPanelSurface>
            <SectionHeader title="Próximas entregas" />
            {props.deadlines.length === 0 ? <p className="px-4 py-5 text-[11px] text-muted-foreground">Nenhuma entrega agendada.</p> : (
              <div className="divide-y divide-border/60">{props.deadlines.slice(0, 4).map((deadline) => (
                <Button key={deadline.key} variant="ghost" className="h-auto w-full justify-start rounded-none px-4 py-3 text-left" onClick={deadline.onOpen}>
                  <CalendarClock className="mr-3 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium">{deadline.title}</span><span className="block text-[10px] font-normal text-muted-foreground">{formatDateTimeBr(deadline.date)}</span></span>
                </Button>
              ))}</div>
            )}
          </DashboardPanelSurface>

          <DashboardPanelSurface>
            <SectionHeader title="Atividade recente" />
            {overviewQ.isLoading ? <div className="space-y-3 p-4"><Skeleton className="h-9" /><Skeleton className="h-9" /></div> : !overview?.activity.length ? (
              <p className="px-4 py-5 text-[11px] text-muted-foreground">Ainda não há atividade registrada neste projeto.</p>
            ) : (
              <ol className="px-4 py-2">{overview.activity.slice(0, 5).map((event, index) => (
                <li key={event.id} className="relative flex gap-3 py-2.5">
                  {index < Math.min(overview.activity.length, 5) - 1 ? <span aria-hidden className="absolute bottom-0 left-[5px] top-5 w-px bg-border" /> : null}
                  <span className="relative mt-1 h-2.5 w-2.5 shrink-0 rounded-full border-2 border-background bg-primary ring-1 ring-border" />
                  <span className="min-w-0"><span className="block text-xs"><strong className="font-semibold">{event.actor_name ?? "Sistema"}</strong> {activityLabel(event)}</span><span className="mt-0.5 block text-[10px] text-muted-foreground">{formatDateTimeBr(event.created_at)}</span></span>
                </li>
              ))}</ol>
            )}
          </DashboardPanelSurface>
        </aside>
      </div>

      <Dialog open={newJobOpen} onOpenChange={setNewJobOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Novo job</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input autoFocus value={newJobName} onChange={(event) => setNewJobName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && newJobName.trim()) createMut.mutate(); }} placeholder="Nome do job" />
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setNewJobOpen(false)}>Cancelar</Button><Button onClick={() => createMut.mutate()} disabled={!newJobName.trim() || createMut.isPending}><Plus className="mr-1.5 h-4 w-4" />Criar job</Button></div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}