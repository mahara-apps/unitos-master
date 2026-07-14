import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, ChevronRight, CalendarDays, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useActiveContext } from "@/hooks/use-active-context";
import { listScheduledPostsFn, type CalendarPost } from "@/lib/calendar.functions";
import { usePageHeader } from "@/hooks/use-page-header";

export const Route = createFileRoute("/_authenticated/calendar")({
  component: CalendarPage,
});

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}
function addMonths(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function CalendarPage() {
  const { brandId, clientId } = useActiveContext();
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const list = useServerFn(listScheduledPostsFn);

  const from = startOfMonth(cursor).toISOString();
  const to = endOfMonth(cursor).toISOString();

  const q = useQuery({
    enabled: !!brandId,
    queryKey: ["calendar", brandId, clientId, from, to],
    queryFn: () =>
      list({ data: { brandId: brandId!, clientId: clientId ?? null, from, to } }),
  });

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarPost[]>();
    (q.data ?? []).forEach((p) => {
      const k = new Date(p.scheduled_at).toISOString().slice(0, 10);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(p);
    });
    return map;
  }, [q.data]);

  const grid = useMemo(() => buildMonthGrid(cursor), [cursor]);
  const monthLabel = cursor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  usePageHeader(
    {
      title: monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1),
      subtitle: `Publicações agendadas · ${q.data?.length ?? 0} posts no mês`,
      actions: (
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setCursor((d) => addMonths(d, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCursor(startOfMonth(new Date()))}>
            Hoje
          </Button>
          <Button variant="outline" size="icon" onClick={() => setCursor((d) => addMonths(d, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
    [monthLabel, q.data?.length],
  );

  if (!brandId) {
    return (
      <div className="p-8 text-sm text-muted-foreground">
        Selecione um workspace para visualizar o calendário editorial.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <Card className="flex-1 overflow-hidden">
        <CardContent className="p-0">
          <div className="grid grid-cols-7 border-b bg-muted/40 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
              <div key={d} className="px-2 py-2 text-center">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 auto-rows-[minmax(120px,1fr)]">
            {grid.map((day, i) => {
              const key = day.date.toISOString().slice(0, 10);
              const posts = byDay.get(key) ?? [];
              const isCurrentMonth = day.date.getMonth() === cursor.getMonth();
              const isToday = key === new Date().toISOString().slice(0, 10);
              return (
                <div
                  key={i}
                  className={`border-b border-r p-1.5 text-xs ${
                    isCurrentMonth ? "" : "bg-muted/20 text-muted-foreground/60"
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span
                      className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 ${
                        isToday ? "bg-primary text-primary-foreground" : ""
                      }`}
                    >
                      {day.date.getDate()}
                    </span>
                    {posts.length > 0 ? (
                      <span className="text-[10px] text-muted-foreground">{posts.length}</span>
                    ) : null}
                  </div>
                  <div className="space-y-1">
                    {posts.slice(0, 3).map((p) => (
                      <Link
                        key={p.id}
                        to="/content"
                        className="block truncate rounded border border-border/60 bg-background px-1.5 py-0.5 text-[11px] hover:bg-accent"
                        title={p.title}
                      >
                        <span className="font-medium">
                          {new Date(p.scheduled_at).toLocaleTimeString("pt-BR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>{" "}
                        <span className="text-muted-foreground">{p.title}</span>
                      </Link>
                    ))}
                    {posts.length > 3 ? (
                      <span className="block text-[10px] text-muted-foreground">
                        +{posts.length - 3}
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <section>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-medium">
          <CalendarDays className="h-4 w-4" /> Próximas publicações
        </h2>
        {q.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </div>
        ) : (q.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum post agendado neste mês. Gere um plano em <Link to="/content" className="underline">Produção</Link>.
          </p>
        ) : (
          <ul className="divide-y rounded-md border">
            {(q.data ?? []).slice(0, 8).map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-medium">{p.title}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {new Date(p.scheduled_at).toLocaleString("pt-BR")} · {p.channels?.join(", ")}
                  </div>
                </div>
                <Badge variant="outline" className="capitalize">
                  {p.review_status ?? "pendente"}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function buildMonthGrid(cursor: Date) {
  const first = startOfMonth(cursor);
  const startWeekday = first.getDay(); // 0=Sun
  const start = new Date(first);
  start.setDate(first.getDate() - startWeekday);
  const cells: { date: Date }[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    cells.push({ date: d });
  }
  return cells;
}