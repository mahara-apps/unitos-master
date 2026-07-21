import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  BarChart,
  Bar,
} from "recharts";
import {
  Activity,
  BarChart3,
  Clock,
  ExternalLink,
  Layers,
  Loader2,
  Sparkles,
  TrendingUp,
  Users,
  Eye,
  Zap,
  CalendarDays,
  Trophy,
  BrainCircuit,
  Instagram,
  Facebook,
  Linkedin,
  Music2,
  Youtube,
  AlertTriangle,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { KpiCard } from "@/components/ui/kpi-card";
import { PanelEmptyState } from "@/components/ui/panel-empty";
import { cn } from "@/lib/utils";
import {
  getBrandSocialDashboardFn,
  type BrandSocialDashboard,
  type ChannelPerformance,
  type FormatPerformance,
  type UnifiedTopPost,
  type SocialTimePoint,
} from "@/lib/social-analytics/brand-dashboard.functions";

const NETWORK_META: Record<
  string,
  { label: string; Icon: typeof Instagram; tone: string }
> = {
  instagram: { label: "Instagram", Icon: Instagram, tone: "text-pink-500" },
  facebook: { label: "Facebook", Icon: Facebook, tone: "text-sky-500" },
  linkedin: { label: "LinkedIn", Icon: Linkedin, tone: "text-sky-600" },
  tiktok: { label: "TikTok", Icon: Music2, tone: "text-zinc-500" },
  youtube: { label: "YouTube", Icon: Youtube, tone: "text-rose-500" },
  x: { label: "X", Icon: TrendingUp, tone: "text-zinc-500" },
  threads: { label: "Threads", Icon: TrendingUp, tone: "text-zinc-500" },
};

const FORMAT_LABEL: Record<string, string> = {
  image: "Imagem",
  video: "Vídeo",
  carousel: "Carrossel",
  text: "Texto",
  other: "Outros",
};

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(Math.round(n));
}

export function SocialAnalyticsDashboard({
  brandId,
  period,
}: {
  brandId: string;
  period: string;
}) {
  const fetchFn = useServerFn(getBrandSocialDashboardFn);
  const q = useQuery({
    queryKey: ["social-analytics", brandId, period],
    queryFn: () => fetchFn({ data: { brandId, period } }),
    staleTime: 60_000,
  });

  if (q.isLoading) return <LoadingSkeleton />;
  if (q.error)
    return (
      <Card>
        <CardContent className="p-6 text-sm text-rose-500">
          {(q.error as Error).message}
        </CardContent>
      </Card>
    );
  const data = q.data;
  if (!data)
    return (
      <PanelEmptyState
        icon={<BarChart3 className="h-5 w-5" />}
        text="Sem dados."
      />
    );

  if (data.connectionsTotal === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <Sparkles className="h-8 w-8 text-muted-foreground" />
          <p className="max-w-md text-sm text-muted-foreground">
            Esta marca ainda não tem canais sociais conectados. Vá em{" "}
            <b>Integrações</b> para conectar Instagram, Facebook e outras redes.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <WarningsBanner warnings={data.warnings} />
      <ResumoSection data={data} />
      <PerformanceSection data={data} />
      <TopPostsSection posts={data.topPosts} />
      <TimingSection data={data} />
      <InsightsSection data={data} />
    </div>
  );
}

function WarningsBanner({ warnings }: { warnings: string[] }) {
  if (!warnings?.length) return null;
  return (
    <details className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
      <summary className="flex cursor-pointer items-center gap-2 font-medium">
        <AlertTriangle className="h-4 w-4" />
        {warnings.length === 1
          ? "1 métrica não pôde ser carregada"
          : `${warnings.length} métricas não puderam ser carregadas`}
        <span className="ml-auto text-xs opacity-70">clique para detalhes</span>
      </summary>
      <ul className="mt-2 space-y-1 pl-6 text-xs font-mono text-amber-800/80 dark:text-amber-200/80">
        {warnings.map((w, i) => (
          <li key={i}>• {w}</li>
        ))}
      </ul>
    </details>
  );
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function ResumoSection({ data }: { data: BrandSocialDashboard }) {
  const iconFor = (key: string) => {
    switch (key) {
      case "followers": return Users;
      case "reach": return Eye;
      case "impressions": return Activity;
      case "engagement": return Zap;
      case "posts": return Layers;
      case "growth": return TrendingUp;
      default: return Sparkles;
    }
  };
  const tones: Record<string, "neutral" | "emerald" | "sky" | "violet" | "amber" | "rose"> = {
    followers: "sky",
    reach: "violet",
    impressions: "neutral",
    engagement: "amber",
    posts: "neutral",
    growth: "emerald",
  };
  return (
    <section className="space-y-3">
      <SectionTitle icon={<BarChart3 className="h-4 w-4" />} title="Resumo" subtitle={`${data.connectionsActive}/${data.connectionsTotal} contas · ${data.networks.length} rede(s)`} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {data.summary.map((k) => {
          const Icon = iconFor(k.key);
          const sub =
            k.deltaPct != null ? (
              <span
                className={cn(
                  "text-xs font-medium",
                  k.deltaPct >= 0 ? "text-emerald-500" : "text-rose-500",
                )}
              >
                {k.deltaPct >= 0 ? "+" : ""}
                {k.deltaPct}%
              </span>
            ) : undefined;
          return (
            <KpiCard
              key={k.key}
              label={k.label}
              value={fmt(k.value)}
              tone={tones[k.key] ?? "neutral"}
              icon={<Icon className="h-4 w-4" />}
              sub={sub}
            />
          );
        })}
      </div>
    </section>
  );
}

function PerformanceSection({ data }: { data: BrandSocialDashboard }) {
  return (
    <section className="space-y-3">
      <SectionTitle
        icon={<Trophy className="h-4 w-4" />}
        title="Performance"
        subtitle="Por canal, por formato e evolução temporal"
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <ChannelPerformanceCard channels={data.channels} />
        <FormatPerformanceCard formats={data.formats} />
      </div>
      <TimeSeriesCard series={data.series} />
    </section>
  );
}

function ChannelPerformanceCard({ channels }: { channels: ChannelPerformance[] }) {
  const max = Math.max(...channels.map((c) => c.engagement), 1);
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Performance por canal</CardTitle>
        <CardDescription>Engajamento consolidado por conta</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {channels.length === 0 ? (
          <PanelEmptyState icon={<Layers className="h-4 w-4" />} text="Sem dados de canais." />
        ) : (
          channels.map((c) => {
            const meta = NETWORK_META[c.network];
            const Icon = meta?.Icon ?? Layers;
            return (
              <div key={`${c.connectionId}:${c.network}`} className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Avatar className="h-6 w-6">
                    {c.avatarUrl ? <AvatarImage src={c.avatarUrl} /> : null}
                    <AvatarFallback className="text-[10px]">
                      <Icon className={cn("h-3.5 w-3.5", meta?.tone)} />
                    </AvatarFallback>
                  </Avatar>
                  <span className="flex-1 truncate text-xs font-medium">{c.accountLabel}</span>
                  <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                    {meta?.label ?? c.network}
                  </Badge>
                  <span className="tabular-nums text-xs text-muted-foreground">
                    {fmt(c.engagement)}
                  </span>
                </div>
                <Progress value={(c.engagement / max) * 100} className="h-1.5" />
                <div className="flex gap-3 text-[10px] text-muted-foreground">
                  <span>{fmt(c.followers ?? 0)} seguidores</span>
                  <span>{fmt(c.reach)} alcance</span>
                  {c.engagementRate != null ? <span>{c.engagementRate}% eng.</span> : null}
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

function FormatPerformanceCard({ formats }: { formats: FormatPerformance[] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Performance por formato</CardTitle>
        <CardDescription>Engajamento médio por tipo de mídia</CardDescription>
      </CardHeader>
      <CardContent className="h-64">
        {formats.length === 0 ? (
          <PanelEmptyState icon={<Layers className="h-4 w-4" />} text="Sem posts no período." />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={formats.map((f) => ({
                format: FORMAT_LABEL[f.format] ?? f.format,
                Engajamento: f.engagement,
                Alcance: f.reach,
              }))}
            >
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="format" fontSize={11} stroke="hsl(var(--muted-foreground))" />
              <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                }}
              />
              <Bar dataKey="Engajamento" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Alcance" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

function TimeSeriesCard({ series }: { series: SocialTimePoint[] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Evolução temporal</CardTitle>
        <CardDescription>Alcance, impressões e engajamento por dia</CardDescription>
      </CardHeader>
      <CardContent className="h-72">
        {series.length === 0 ? (
          <PanelEmptyState icon={<Activity className="h-4 w-4" />} text="Sem série temporal disponível para o período." />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series}>
              <defs>
                <linearGradient id="reach-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="date" fontSize={11} stroke="hsl(var(--muted-foreground))" />
              <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                }}
              />
              <Area
                type="monotone"
                dataKey="reach"
                name="Alcance"
                stroke="hsl(var(--primary))"
                fill="url(#reach-fill)"
                strokeWidth={2}
              />
              <Line
                type="monotone"
                dataKey="engagement"
                name="Engajamento"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

function TopPostsSection({ posts }: { posts: UnifiedTopPost[] }) {
  return (
    <section className="space-y-3">
      <SectionTitle icon={<Trophy className="h-4 w-4" />} title="Top publicações" subtitle="Ranqueadas por engajamento" />
      {posts.length === 0 ? (
        <Card>
          <CardContent className="py-6">
            <PanelEmptyState icon={<Trophy className="h-4 w-4" />} text="Sem publicações no período." />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((p) => {
            const meta = NETWORK_META[p.network];
            const Icon = meta?.Icon ?? Layers;
            return (
              <Card key={`${p.connectionId}:${p.externalPostId}`} className="overflow-hidden">
                <div className="relative aspect-video w-full bg-muted">
                  {p.thumbnailUrl ? (
                    <img
                      src={p.thumbnailUrl}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground">
                      <Layers className="h-6 w-6" />
                    </div>
                  )}
                  <Badge className="absolute right-2 top-2 gap-1 bg-background/90 text-foreground">
                    <Icon className={cn("h-3 w-3", meta?.tone)} />
                    {meta?.label ?? p.network}
                  </Badge>
                </div>
                <CardContent className="space-y-2 p-3">
                  <p className="line-clamp-2 text-xs">
                    {p.caption ?? <span className="italic text-muted-foreground">Sem legenda</span>}
                  </p>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>{p.channelLabel}</span>
                    <span className="tabular-nums">{fmt(p.engagement)} eng · {fmt(p.reach)} alc</span>
                  </div>
                  {p.permalink ? (
                    <a
                      href={p.permalink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                    >
                      Abrir <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}

function TimingSection({ data }: { data: BrandSocialDashboard }) {
  return (
    <section className="space-y-3">
      <SectionTitle icon={<Clock className="h-4 w-4" />} title="Timing" subtitle="Melhor horário e melhor dia para publicar" />
      <div className="grid gap-4 lg:grid-cols-2">
        <BestHoursCard data={data} />
        <BestDaysCard data={data} />
      </div>
    </section>
  );
}

function BestHoursCard({ data }: { data: BrandSocialDashboard }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Clock className="h-4 w-4" /> Melhor horário
        </CardTitle>
        <CardDescription>Top 5 janelas por engajamento</CardDescription>
      </CardHeader>
      <CardContent>
        {data.bestHours.length === 0 ? (
          <PanelEmptyState icon={<Clock className="h-4 w-4" />} text="Sem histórico suficiente." />
        ) : (
          <ul className="divide-y divide-border/60">
            {data.bestHours.map((s, i) => (
              <li key={`${s.weekday}-${s.hour}`} className="flex items-center justify-between py-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="h-5 w-5 justify-center p-0 text-[10px]">
                    {i + 1}
                  </Badge>
                  <span className="text-sm">
                    {WEEKDAY_LABELS[s.weekday]} · {String(s.hour).padStart(2, "0")}h
                  </span>
                </div>
                <div className="text-xs text-muted-foreground tabular-nums">
                  {fmt(s.score)} eng · {s.posts} post(s)
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function BestDaysCard({ data }: { data: BrandSocialDashboard }) {
  const max = Math.max(...data.bestDays.map((d) => d.score), 1);
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <CalendarDays className="h-4 w-4" /> Melhor dia
        </CardTitle>
        <CardDescription>Engajamento por dia da semana</CardDescription>
      </CardHeader>
      <CardContent>
        {data.bestDays.length === 0 ? (
          <PanelEmptyState icon={<CalendarDays className="h-4 w-4" />} text="Sem histórico suficiente." />
        ) : (
          <div className="space-y-2">
            {WEEKDAY_LABELS.map((label, weekday) => {
              const slot = data.bestDays.find((d) => d.weekday === weekday);
              const value = slot?.score ?? 0;
              return (
                <div key={weekday} className="flex items-center gap-3">
                  <span className="w-10 text-xs text-muted-foreground">{label}</span>
                  <Progress value={(value / max) * 100} className="h-2 flex-1" />
                  <span className="w-16 text-right text-xs tabular-nums text-muted-foreground">
                    {fmt(value)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function InsightsSection({ data }: { data: BrandSocialDashboard }) {
  return (
    <section className="space-y-3">
      <SectionTitle
        icon={<BrainCircuit className="h-4 w-4" />}
        title="Insights do Brain"
        subtitle="Análises automáticas de padrão, horário, formato e crescimento"
      />
      {data.insights.length === 0 ? (
        <Card>
          <CardContent className="py-6">
            <PanelEmptyState
              icon={<BrainCircuit className="h-4 w-4" />}
              text="O Brain ainda não gerou insights sociais. Publique mais para alimentar a análise."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.insights.map((i) => (
            <Card key={i.id} className="border-l-4 border-l-primary/70">
              <CardContent className="space-y-2 p-4">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="text-[10px]">
                    {i.type}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">
                    Confiança {(i.confidence * 100).toFixed(0)}%
                  </span>
                </div>
                <p className="text-sm leading-snug">{i.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

function SectionTitle({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="rounded-md bg-muted p-1.5 text-muted-foreground">{icon}</div>
      <div>
        <div className="text-sm font-semibold tracking-tight">{title}</div>
        {subtitle ? (
          <div className="text-[11px] text-muted-foreground">{subtitle}</div>
        ) : null}
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-72 w-full" />
    </div>
  );
}