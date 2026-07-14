import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, ChevronRight, CalendarDays, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useActiveContext } from "@/hooks/use-active-context";
import { listScheduledPostsFn, type CalendarPost } from "@/lib/calendar.functions";
import { usePageHeader } from "@/hooks/use-page-header";
import { GeneratePlanDialog } from "@/components/calendar/generate-plan-dialog";
import { cn } from "@/lib/utils";

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
  const qc = useQueryClient();

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

  const volumetry = useMemo(() => computeVolumetry(q.data ?? []), [q.data]);

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
          {brandId ? (
            <GeneratePlanDialog
              brandId={brandId}
              clientId={clientId ?? null}
              onGenerated={() => {
                setTimeout(() => qc.invalidateQueries({ queryKey: ["calendar"] }), 1200);
              }}
            />
          ) : null}
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
    <TooltipProvider delayDuration={200}>
    <div className="flex h-full flex-col gap-5 p-6">
      {/* Volumetria */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {volumetry.map((v) => (
          <div
            key={v.key}
            className="group relative overflow-hidden rounded-xl border bg-card p-4 transition-colors hover:border-foreground/20"
          >
            <div className={cn("absolute inset-x-0 top-0 h-0.5", v.bar)} />
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <span className={cn("h-2 w-2 rounded-full", v.dot)} />
              {v.label}
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-2xl font-semibold tabular-nums tracking-tight">{v.count}</span>
              <span className="text-xs text-muted-foreground">no mês</span>
            </div>
          </div>
        ))}
      </section>

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
                  className={cn(
                    "border-b border-r p-2 text-xs transition-colors",
                    isCurrentMonth ? "" : "bg-muted/20 text-muted-foreground/50",
                  )}
                >
                  <div className="mb-1.5 flex items-center justify-between">
                    <span
                      className={cn(
                        "inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
                        isToday
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-foreground/80",
                      )}
                    >
                      {day.date.getDate()}
                    </span>
                    {posts.length > 0 ? (
                      <span className="text-[10px] font-medium text-muted-foreground">
                        {posts.length}
                      </span>
                    ) : null}
                  </div>
                  <div className="space-y-1">
                    {posts.slice(0, 3).map((p) => (
                      <PostChip key={p.id} post={p} />
                    ))}
                    {posts.length > 3 ? (
                      <span className="block pl-0.5 text-[10px] font-medium text-muted-foreground">
                        +{posts.length - 3} mais
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
    </TooltipProvider>
  );
}

// -- Chip ---------------------------------------------------------------
function PostChip({ post }: { post: CalendarPost }) {
  const kind = classifyChannel(post.channels?.[0] ?? "");
  const t = new Date(post.scheduled_at).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          to="/content"
          className={cn(
            "flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] transition-all hover:-translate-y-px hover:shadow-sm",
            kind.chip,
          )}
          title={post.title}
        >
          <span className="tabular-nums font-semibold opacity-70">{t}</span>
          <span className="truncate flex-1">{post.title}</span>
          {post.author ? (
            <Avatar className="h-4 w-4 ring-1 ring-background">
              {post.author.avatar_url ? (
                <AvatarImage src={post.author.avatar_url} alt={post.author.name ?? ""} />
              ) : null}
              <AvatarFallback className="text-[8px]">
                {(post.author.name ?? "?").slice(0, 1).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          ) : null}
        </Link>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs">
        <div className="font-medium">{post.title}</div>
        <div className="mt-0.5 text-muted-foreground">
          {kind.label} · {t}
          {post.author?.name ? ` · ${post.author.name}` : ""}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

type ChannelKind = {
  key: string;
  label: string;
  chip: string; // pill classes
  dot: string;
  bar: string;
};

const CHANNEL_KINDS: Record<string, ChannelKind> = {
  instagram: {
    key: "instagram",
    label: "Feed",
    chip: "border-purple-200 bg-purple-100 text-purple-700 dark:border-purple-500/30 dark:bg-purple-500/15 dark:text-purple-300",
    dot: "bg-purple-500",
    bar: "bg-gradient-to-r from-purple-500 to-fuchsia-500",
  },
  stories: {
    key: "stories",
    label: "Stories",
    chip: "border-blue-200 bg-blue-100 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/15 dark:text-blue-300",
    dot: "bg-blue-500",
    bar: "bg-gradient-to-r from-blue-500 to-sky-500",
  },
  tiktok: {
    key: "tiktok",
    label: "TikTok",
    chip: "border-cyan-200 bg-cyan-100 text-cyan-700 dark:border-cyan-500/30 dark:bg-cyan-500/15 dark:text-cyan-300",
    dot: "bg-cyan-500",
    bar: "bg-gradient-to-r from-cyan-500 to-teal-500",
  },
  youtube: {
    key: "youtube",
    label: "YouTube",
    chip: "border-rose-200 bg-rose-100 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-300",
    dot: "bg-rose-500",
    bar: "bg-gradient-to-r from-rose-500 to-red-500",
  },
  linkedin: {
    key: "linkedin",
    label: "LinkedIn",
    chip: "border-sky-200 bg-sky-100 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/15 dark:text-sky-300",
    dot: "bg-sky-500",
    bar: "bg-gradient-to-r from-sky-500 to-blue-600",
  },
  whatsapp: {
    key: "whatsapp",
    label: "WhatsApp",
    chip: "border-emerald-200 bg-emerald-100 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300",
    dot: "bg-emerald-500",
    bar: "bg-gradient-to-r from-emerald-500 to-green-600",
  },
  blog: {
    key: "blog",
    label: "Blog",
    chip: "border-amber-200 bg-amber-100 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300",
    dot: "bg-amber-500",
    bar: "bg-gradient-to-r from-amber-500 to-orange-500",
  },
  other: {
    key: "other",
    label: "Outros",
    chip: "border-zinc-200 bg-zinc-100 text-zinc-700 dark:border-zinc-500/30 dark:bg-zinc-500/15 dark:text-zinc-300",
    dot: "bg-zinc-500",
    bar: "bg-gradient-to-r from-zinc-500 to-zinc-400",
  },
};

function classifyChannel(raw: string): ChannelKind {
  const k = (raw ?? "").toLowerCase();
  if (k.includes("story") || k.includes("stories")) return CHANNEL_KINDS.stories;
  if (k.includes("tiktok")) return CHANNEL_KINDS.tiktok;
  if (k.includes("youtube") || k === "yt") return CHANNEL_KINDS.youtube;
  if (k.includes("linkedin")) return CHANNEL_KINDS.linkedin;
  if (k.includes("whats")) return CHANNEL_KINDS.whatsapp;
  if (k.includes("blog")) return CHANNEL_KINDS.blog;
  if (k.includes("insta") || k.includes("feed") || k.includes("facebook") || k === "x" || k.includes("twitter") || k.includes("threads")) {
    return CHANNEL_KINDS.instagram;
  }
  return CHANNEL_KINDS.other;
}

function computeVolumetry(posts: CalendarPost[]) {
  const counts = new Map<string, number>();
  for (const p of posts) {
    const kind = classifyChannel(p.channels?.[0] ?? "");
    counts.set(kind.key, (counts.get(kind.key) ?? 0) + 1);
  }
  const preferred = ["instagram", "stories", "tiktok", "linkedin", "youtube", "whatsapp", "blog", "other"];
  const items = preferred
    .map((k) => ({ ...CHANNEL_KINDS[k], count: counts.get(k) ?? 0 }))
    .filter((v) => v.count > 0);
  if (items.length >= 4) return items.slice(0, 4);
  // Fill with placeholders (0 count) up to 4 so header always has a full row.
  const fillers = preferred
    .filter((k) => !items.find((i) => i.key === k))
    .slice(0, 4 - items.length)
    .map((k) => ({ ...CHANNEL_KINDS[k], count: 0 }));
  return [...items, ...fillers];
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