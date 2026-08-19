// Centro de comando do cliente — conteúdo da aba "Visão geral".
// Grid rígido de 2 cards por linha (50/50 no desktop, 1 coluna no mobile).
// Consome apenas server functions já existentes; nenhum dado mockado.
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { OverviewSkeleton } from "@/components/ai-agents/tab-skeletons";
import { isValidScope } from "@/lib/customer-queries";
import { loadCustomerDashboardFn } from "@/lib/customer-dashboard.functions";
import { getBrandHub } from "@/lib/brand-hub.functions";
import { computeBriefingCompletion } from "@/lib/briefing-progress";
import { listTasksFn } from "@/lib/tasks.functions";
import { listScheduledPostsFn } from "@/lib/calendar.functions";
import { listCalendarEventsFn } from "@/lib/calendar-events.functions";
import { EventDialog } from "@/components/calendar/event-dialog";
import { OverviewSummary } from "./overview-summary";
import { OverviewAttention } from "./overview-attention";
import { OverviewPipeline } from "./overview-pipeline";
import { OverviewUpcoming, type UpcomingItem } from "./overview-upcoming";
import { OverviewPerformance } from "./overview-performance";
import { OverviewBrain } from "./overview-brain";
import { OverviewActivity } from "./overview-activity";
import { OverviewClientInfo } from "./overview-client-info";

type Props = {
  brandId: string;
  clientId: string;
  onOpenBriefing?: () => void;
  onOpenTab?: (tab: string) => void;
};

export function CustomerOverview({ brandId, clientId, onOpenBriefing, onOpenTab }: Props) {
  const loadFn = useServerFn(loadCustomerDashboardFn);
  const fetchHub = useServerFn(getBrandHub);
  const listTasks = useServerFn(listTasksFn);
  const listScheduled = useServerFn(listScheduledPostsFn);
  const listEvents = useServerFn(listCalendarEventsFn);
  const navigate = useNavigate();
  const [newAppointment, setNewAppointment] = useState(false);
  const scopeValid = isValidScope({ brandId, clientId });

  const q = useQuery({
    queryKey: ["customer-dashboard", brandId, clientId],
    queryFn: () => loadFn({ data: { brandId, clientId } }),
    staleTime: 20_000,
    enabled: scopeValid,
    retry: (failureCount, err) => {
      const msg = (err as Error)?.message ?? "";
      if (/row-level security|permission denied|unauthorized|forbidden/i.test(msg)) return false;
      return failureCount < 2;
    },
  });

  const hubQ = useQuery({
    queryKey: ["brand-hub", brandId, clientId],
    queryFn: () => fetchHub({ data: { brandId, clientId } }),
    staleTime: 30_000,
    enabled: scopeValid,
  });

  const tasksQ = useQuery({
    queryKey: ["tasks", brandId, clientId],
    queryFn: () => listTasks({ data: { brandId, clientId } }),
    staleTime: 30_000,
    enabled: scopeValid,
  });

  const range = useMemo(() => {
    const from = new Date();
    const to = new Date(from.getTime() + 21 * 86_400_000);
    return { from: from.toISOString(), to: to.toISOString() };
  }, []);

  const scheduledQ = useQuery({
    queryKey: ["overview-upcoming-posts", brandId, clientId, range.from.slice(0, 10)],
    queryFn: () => listScheduled({ data: { brandId, clientId, from: range.from, to: range.to } }),
    staleTime: 60_000,
    enabled: scopeValid,
  });

  const eventsQ = useQuery({
    queryKey: ["overview-upcoming-events", brandId, clientId, range.from.slice(0, 10)],
    queryFn: () => listEvents({ data: { brandId, clientId, from: range.from, to: range.to } }),
    staleTime: 60_000,
    enabled: scopeValid,
  });

  useEffect(() => {
    if (q.error) {
      const msg = (q.error as Error).message ?? "Falha ao carregar dados da conta";
      toast.error("Não foi possível carregar o painel", { description: msg });
    }
  }, [q.error]);

  // Escopo inválido → nada a carregar (não é loading nem erro).
  if (!scopeValid) {
    return (
      <div className="rounded-xl border border-border/60 bg-card px-4 py-6 text-sm text-muted-foreground">
        Selecione um workspace e um cliente para ver a visão geral.
      </div>
    );
  }

  // Erro real: estado explícito com ação de tentar novamente (nunca skeleton infinito).
  if (q.isError) {
    return (
      <div className="space-y-3 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-5">
        <div className="flex items-start gap-2.5 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0">
            <p className="font-medium">Não foi possível carregar a visão geral.</p>
            <p className="mt-0.5 text-[12px] opacity-80">
              {(q.error as Error)?.message ?? "Erro inesperado ao consultar os dados da conta."}
            </p>
          </div>
        </div>
        <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => q.refetch()}>
          <RefreshCw className="h-3.5 w-3.5" />
          Tentar novamente
        </Button>
      </div>
    );
  }

  if (q.isPending) return <OverviewSkeleton />;

  // Sucesso sem payload: estado vazio explícito.
  if (!q.data) {
    return (
      <div className="rounded-xl border border-border/60 bg-card px-4 py-6 text-sm text-muted-foreground">
        Nenhum dado disponível para este cliente ainda.
      </div>
    );
  }


  const data = q.data;
  const m = data.metrics;
  const client = data.client;
  const briefingCompletion = hubQ.data
    ? computeBriefingCompletion(hubQ.data.brand_hub ?? {}, hubQ.data)
    : null;

  const tasks = tasksQ.data ?? [];
  const now = Date.now();
  const overdue = tasks
    .filter((t) => t.status !== "done" && !!t.due_at && new Date(t.due_at).getTime() < now)
    .sort((a, b) => new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime())
    .map((t) => ({ id: t.id, title: t.title, due_at: t.due_at }));

  const upcoming: UpcomingItem[] = [
    ...tasks
      .filter((t) => t.status !== "done" && !!t.due_at && new Date(t.due_at).getTime() >= now)
      .map((t) => ({ id: t.id, title: t.title, when: t.due_at as string, kind: "task" as const })),
    ...(scheduledQ.data ?? []).map((p) => ({
      id: p.id,
      title: p.title || "Publicação",
      when: p.scheduled_at,
      kind: "post" as const,
    })),
    ...(eventsQ.data ?? []).map((e) => ({
      id: e.id,
      title: e.title,
      when: e.starts_at,
      kind: e.type === "seasonal" ? ("seasonal" as const) : ("appointment" as const),
      allDay: e.all_day,
    })),
  ].sort((a, b) => new Date(a.when).getTime() - new Date(b.when).getTime());

  return (
    <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-2">
      {/* Linha 1 — o que está acontecendo agora */}
      <OverviewSummary
        health={m.health.score}
        breakdown={m.health.breakdown}
        totalTasks={tasks.length || m.openTasks + m.doneTasks}
        overdueTasks={overdue.length}
        contentTotal={data.pipeline.total}
        briefingCompletion={briefingCompletion}
      />
      <OverviewAttention
        alerts={data.alerts ?? []}
        overdue={overdue}
        onOpenTasks={() =>
          navigate({ to: "/tasks", search: { view: "list", groupBy: "status" } as never })
        }
      />

      {/* Linha 2 — o que precisa ser feito */}
      <OverviewPipeline
        stages={data.pipeline.stages.map((s) => ({
          key: s.key,
          label: s.label,
          count: s.count,
          color: s.color,
        }))}
        total={data.pipeline.total}
        pipelineName={data.pipeline.pipelineName}
      />
      <OverviewUpcoming items={upcoming} onNewAppointment={() => setNewAppointment(true)} />

      {/* Linha 3 — como está a operação */}
      <OverviewPerformance
        published={m.published}
        scheduled={m.scheduled}
        pendingApprovals={m.pendingApprovals}
        totalApprovals={m.totalApprovals}
        decidedApprovals={m.decidedApprovals}
        aiJobs={m.aiJobsCount}
        aiCost30d={m.costTotal30d}
        costSpark={m.costSpark}
        onOpenChannels={() => onOpenTab?.("channels")}
      />
      <OverviewBrain brandId={brandId} clientId={clientId} />

      {/* Linha 4 — o que o sistema percebeu */}
      <OverviewActivity activity={data.activity ?? []} />
      <OverviewClientInfo
        contactName={client?.contact_name ?? null}
        contactEmail={client?.contact_email ?? null}
        niche={client?.niche ?? null}
        socials={(client?.socials ?? {}) as Record<string, string | undefined>}
        onOpenCadastro={() => (onOpenTab ? onOpenTab("conta") : onOpenBriefing?.())}
      />

      {newAppointment ? (
        <EventDialog
          open={newAppointment}
          onOpenChange={setNewAppointment}
          brandId={brandId}
          clientId={clientId}
          defaultType="appointment"
          invalidateKey={["overview-upcoming-events", brandId, clientId, range.from.slice(0, 10)]}
        />
      ) : null}
    </div>
  );
}
