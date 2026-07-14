import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ChevronLeft, ChevronRight, CalendarDays, Loader2,
  Image as ImageIcon, Film, MessageCircle, Newspaper,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useActiveContext } from "@/hooks/use-active-context";
import { listScheduledPostsFn, type CalendarPost } from "@/lib/calendar.functions";
import { usePageHeader } from "@/hooks/use-page-header";
import { CalendarPlanDialog } from "@/components/calendar/calendar-plan-dialog";

type Kind = "feed" | "stories" | "reels" | "whatsapp" | "blog";

function classifyPost(p: CalendarPost): Kind {
  const fmt = (p.format ?? "").toLowerCase();
  const chans = (p.channels ?? []).map((c) => c.toLowerCase());
  if (fmt.includes("story") || fmt.includes("stories")) return "stories";
  if (fmt.includes("reel") || fmt.includes("vídeo") || fmt.includes("video") || fmt.includes("tiktok")) return "reels";
  if (fmt.includes("whatsapp") || fmt.includes("grupo") || chans.includes("whatsapp")) return "whatsapp";
  if (chans.includes("blog") || fmt.includes("artigo") || fmt.includes("blog")) return "blog";
  return "feed";
}

const KIND_STYLES: Record<Kind, { chip: string; dot: string; icon: React.ReactNode; label: string }> = {
  feed:     { chip: "bg-violet-500/10 text-violet-700 dark:text-violet-300 ring-1 ring-inset ring-violet-500/20 hover:bg-violet-500/15", dot: "bg-violet-500", icon: <ImageIcon className="h-3 w-3" />, label: "Feed" },
  stories:  { chip: "bg-sky-500/10 text-sky-700 dark:text-sky-300 ring-1 ring-inset ring-sky-500/20 hover:bg-sky-500/15", dot: "bg-sky-500", icon: <Newspaper className="h-3 w-3" />, label: "Stories" },
  reels:    { chip: "bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300 ring-1 ring-inset ring-fuchsia-500/20 hover:bg-fuchsia-500/15", dot: "bg-fuchsia-500", icon: <Film className="h-3 w-3" />, label: "Reels" },
  whatsapp: { chip: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-500/20 hover:bg-emerald-500/15", dot: "bg-emerald-500", icon: <MessageCircle className="h-3 w-3" />, label: "WhatsApp" },
  blog:     { chip: "bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-1 ring-inset ring-amber-500/20 hover:bg-amber-500/15", dot: "bg-amber-500", icon: <Newspaper className="h-3 w-3" />, label: "Blog" },
};

function initials(name: string | null | undefined) {
  if (!name) return "?";
  return name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

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

  const volumetria = useMemo(() => {
    const acc: Record<Kind, number> = { feed: 0, stories: 0, reels: 0, whatsapp: 0, blog: 0 };
    (q.data ?? []).forEach((p) => { acc[classifyPost(p)]++; });
    return acc;
  }, [q.data]);
  const totalPosts = q.data?.length ?? 0;

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
          <div className="mx-1 h-5 w-px bg-border" />
          <CalendarPlanDialog brandId={brandId ?? ""} clientId={clientId ?? null} />
        </div>
      ),
    },
    [monthLabel, q.data?.length, brandId, clientId],
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
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500/15 to-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-300">
              <CalendarDays className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Volumetria</div>
              <div className="text-lg font-semibold">
                {totalPosts} publicações neste mês
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(KIND_STYLES) as Kind[]).map((k) => {
              const s = KIND_STYLES[k];
              const n = volumetria[k];
              if (!n && k !== "feed" && k !== "stories") return null;
              return (
                <div
                  key={k}
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${s.chip}`}
                >
                  {s.icon}
                  <span className="tabular-nums">{n}</span>
                  <span>{s.label}</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="flex-1 overflow-hidden">
        <CardContent className="p-0">
          <div className="grid grid-cols-7 border-b bg-muted/40 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
              <div key={d} className="px-3 py-3 text-center">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 auto-rows-[minmax(140px,1fr)]">
            {grid.map((day, i) => {
              const key = day.date.toISOString().slice(0, 10);
              const posts = byDay.get(key) ?? [];
              const isCurrentMonth = day.date.getMonth() === cursor.getMonth();
              const isToday = key === new Date().toISOString().slice(0, 10);
              return (
                <div
                  key={i}
                  className={`group border-b border-r p-2 text-xs transition-colors ${
                    isCurrentMonth ? "bg-background" : "bg-muted/20 text-muted-foreground/60"
                  }`}
                >
                  <div className="mb-1.5 flex items-center justify-between">
                    <span
                      className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[11px] font-medium tabular-nums ${
                        isToday ? "bg-primary text-primary-foreground shadow-sm" : "text-foreground/70"
                      }`}
                    >
                      {day.date.getDate()}
                    </span>
                    {posts.length > 0 ? (
                      <span className="rounded-full bg-muted/70 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {posts.length}
                      </span>
                    ) : null}
                  </div>
                  <div className="space-y-1">
                    {posts.slice(0, 3).map((p) => {
                      const kind = classifyPost(p);
                      const style = KIND_STYLES[kind];
                      return (
                        <Link
                          key={p.id}
                          to="/content"
                          className={`flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] leading-tight transition ${style.chip}`}
                          title={`${style.label} · ${p.title}`}
                        >
                          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`} />
                          <span className="min-w-0 flex-1 truncate font-medium">{p.title}</span>
                          {p.assignee ? (
                            <Avatar className="h-4 w-4 shrink-0 ring-1 ring-background">
                              {p.assignee.avatar_url ? (
                                <AvatarImage src={p.assignee.avatar_url} alt={p.assignee.full_name ?? ""} />
                              ) : null}
                              <AvatarFallback className="text-[8px]">{initials(p.assignee.full_name)}</AvatarFallback>
                            </Avatar>
                          ) : null}
                        </Link>
                      );
                    })}
                    {posts.length > 3 ? (
                      <span className="block px-1 text-[10px] font-medium text-muted-foreground">
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