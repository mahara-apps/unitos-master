import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useActiveContext } from "@/hooks/use-active-context";
import { getDashboardStats } from "@/lib/dashboard.functions";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { usePageHeader } from "@/hooks/use-page-header";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const { brandId, clientId } = useActiveContext();
  usePageHeader({ title: "Painel", subtitle: "Visão geral da operação" });
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", brandId, clientId],
    enabled: !!brandId,
    queryFn: () => getDashboardStats({ data: { brandId: brandId!, clientId } }),
  });

  if (!brandId) {
    return (
      <div className="p-8 text-sm text-muted-foreground">
        Selecione uma marca no menu lateral para carregar o dashboard.
      </div>
    );
  }

  const c = data?.counts;
  return (
    <div className="space-y-6 p-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Clientes" value={isLoading ? "…" : (c?.clients ?? 0)} spark={data?.sparkline} />
        <KpiCard label="Projetos ativos" value={isLoading ? "…" : (c?.projects_active ?? 0)} />
        <KpiCard label="Tarefas abertas" value={isLoading ? "…" : (c?.tasks_open ?? 0)} hint={`${c?.tasks_overdue ?? 0} atrasadas`} />
        <KpiCard label="Aprovações pendentes" value={isLoading ? "…" : (c?.approvals_pending ?? 0)} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-border/60 bg-card p-4">
          <h2 className="mb-3 text-sm font-medium">Minhas tarefas</h2>
          <ul className="space-y-2 text-sm">
            {(data?.myTasks ?? []).map((t) => (
              <li key={t.id} className="flex items-center justify-between border-b border-border/40 pb-2 last:border-0">
                <span className="truncate">{t.title}</span>
                <span className="text-xs text-muted-foreground">{t.due_at ? new Date(t.due_at).toLocaleDateString() : "—"}</span>
              </li>
            ))}
            {!isLoading && (data?.myTasks ?? []).length === 0 && (
              <li className="text-xs text-muted-foreground">Nenhuma tarefa atribuída.</li>
            )}
          </ul>
        </section>
        <section className="rounded-xl border border-border/60 bg-card p-4">
          <h2 className="mb-3 text-sm font-medium">Próximas publicações</h2>
          <ul className="space-y-2 text-sm">
            {(data?.upcomingPosts ?? []).map((p) => (
              <li key={p.id} className="flex items-center justify-between border-b border-border/40 pb-2 last:border-0">
                <span className="truncate">{p.title}</span>
                <span className="text-xs text-muted-foreground">{p.scheduled_at ? new Date(p.scheduled_at).toLocaleString() : "—"}</span>
              </li>
            ))}
            {!isLoading && (data?.upcomingPosts ?? []).length === 0 && (
              <li className="text-xs text-muted-foreground">Sem publicações agendadas nos próximos 7 dias.</li>
            )}
          </ul>
        </section>
      </div>
    </div>
  );
}