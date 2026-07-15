import { useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Activity,
  CalendarClock,
  CheckCircle2,
  Clock,
  DollarSign,
  ExternalLink,
  Instagram,
  Linkedin,
  Music2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Youtube,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sparkline } from "@/components/dashboard/sparkline";
import { HealthBar } from "@/components/dashboard/health-bar";
import { OverviewSkeleton } from "@/components/ai-agents/tab-skeletons";
import { isValidScope } from "@/lib/customer-queries";
import {
  loadCustomerDashboardFn,
  type CustomerDashboardData,
} from "@/lib/customer-dashboard.functions";
import { useEffect } from "react";

type Props = {
  brandId: string;
  clientId: string;
  onOpenBriefing?: () => void;
};

const STAGE_FALLBACK_ACCENT: Record<string, string> = {
  idea: "bg-zinc-400 dark:bg-zinc-500",
  production: "bg-amber-500",
  review: "bg-orange-500",
  approved: "bg-cyan-500",
  approval: "bg-cyan-500",
  scheduled: "bg-indigo-500",
  published: "bg-emerald-500",
};

export function CustomerDashboard({ brandId, clientId, onOpenBriefing }: Props) {
  const loadFn = useServerFn(loadCustomerDashboardFn);
  const scopeValid = isValidScope({ brandId, clientId });

  const q = useQuery({
    queryKey: ["customer-dashboard", brandId, clientId],
    queryFn: () => loadFn({ data: { brandId, clientId } }),
    staleTime: 20_000,
    enabled: scopeValid,
    retry: (failureCount, err) => {
      const msg = (err as Error)?.message ?? "";
      // Não retentar erros de RLS / não autorizado.
      if (/row-level security|permission denied|unauthorized|forbidden/i.test(msg)) return false;
      return failureCount < 2;
    },
  });

  useEffect(() => {
    if (q.error) {
      const msg = (q.error as Error).message ?? "Falha ao carregar dados da conta";
      toast.error("Não foi possível carregar o painel", { description: msg });
    }
  }, [q.error]);

  if (!scopeValid || q.isLoading || !q.data) return <OverviewSkeleton />;
  return (
    <DashboardReady
      data={q.data}
      clientId={clientId}
      brandId={brandId}
      onOpenBriefing={onOpenBriefing}
    />
  );
}

function DashboardReady({
  data,
  clientId,
  brandId,
}: {
  data: NonNullable<CustomerDashboardData>;
  clientId: string;
  brandId: string;
  onOpenBriefing?: () => void;
}) {
  const client = data.client;
  const m = data.metrics;
  const approvalPct = m.totalApprovals ? Math.round((m.decidedApprovals / m.totalApprovals) * 100) : 0;
  const socials = (client?.socials ?? {}) as Record<string, string | undefined>;

  return (
    <div className="space-y-5">
      {/* Header row */}
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-border/60 bg-card/60 px-4 py-3">
        <div className="min-w-0">
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            Painel da conta
          </div>
          <div className="mt-0.5 flex items-center gap-2">
            <h2 className="truncate text-lg font-semibold tracking-tight">{client?.name ?? "—"}</h2>
            {client?.niche ? (
              <Badge variant="outline" className="border-border/60 text-[10px] uppercase tracking-wide">
                {client.niche}
              </Badge>
            ) : null}
          </div>
        </div>
      </div>

      {/* Metrics row */}
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          icon={DollarSign}
          label="Consumo de IA"
          value={`$${m.costTotal30d.toFixed(4)}`}
          hint={`$${m.costTotal14d.toFixed(4)} nos últimos 14d`}
          right={<Sparkline data={m.costSpark} className="h-8 w-24 text-cyan-500" />}
        />
        <MetricCard
          icon={ShieldCheck}
          label="Aprovações pendentes"
          value={m.pendingApprovals}
          hint={`${m.decidedApprovals}/${m.totalApprovals || 0} resolvidas`}
          right={
            <div className="w-24">
              <HealthBar score={approvalPct} />
              <div className="mt-1 text-right text-[10px] font-mono text-muted-foreground">{approvalPct}%</div>
            </div>
          }
        />
        <MetricCard
          icon={CalendarClock}
          label="Publicações agendadas"
          value={m.scheduled}
          hint={`${m.published} já publicadas`}
          right={
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 font-mono text-[10px] text-emerald-500 dark:text-emerald-300">
              LIVE
            </div>
          }
        />
      </div>

      {/* Production pipeline funnel */}
      <div className="rounded-xl border border-border/60 bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              Pipeline de produção
            </div>
            <div className="mt-0.5 text-sm font-medium">
              {data.pipeline.total} posts em {data.pipeline.stages.length} estágios
              {data.pipeline.pipelineName ? (
                <span className="ml-1 text-muted-foreground">· {data.pipeline.pipelineName}</span>
              ) : null}
            </div>
          </div>
          <Badge variant="outline" className="font-mono text-[10px]">
            Ao vivo · Sync do Kanban
          </Badge>
        </div>
        <PipelineFunnel stages={data.pipeline.stages} total={data.pipeline.total} />
      </div>

      {/* Bottom split layout */}
      <div className="grid gap-4 lg:grid-cols-2">
        <AccountPropertiesCard
          socials={socials}
          contactEmail={client?.contact_email ?? null}
          contactName={client?.contact_name ?? null}
          brandId={brandId}
          clientId={clientId}
        />
        <ActivityFeedCard activity={data.activity} />
      </div>
    </div>
  );
}

// ---------- Metric card ----------

function MetricCard({
  icon: Icon,
  label,
  value,
  hint,
  right,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  hint?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <Icon className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              {label}
            </span>
          </div>
          <div className="mt-2 text-3xl font-semibold tracking-tight">{value}</div>
          {hint ? <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div> : null}
        </div>
        <div className="shrink-0">{right}</div>
      </div>
    </div>
  );
}

// ---------- Pipeline ----------

type PipelineStage = CustomerDashboardData["pipeline"]["stages"][number];

function PipelineFunnel({ stages, total }: { stages: PipelineStage[]; total: number }) {
  const max = Math.max(1, ...stages.map((s) => s.count));
  const gridCols =
    stages.length <= 3
      ? "sm:grid-cols-3"
      : stages.length === 4
        ? "sm:grid-cols-2 md:grid-cols-4"
        : stages.length === 5
          ? "sm:grid-cols-3 md:grid-cols-5"
          : "sm:grid-cols-3 md:grid-cols-6";
  return (
    <div className={`grid grid-cols-2 gap-2 ${gridCols}`}>
      {stages.map((s) => {
        const c = s.count;
        const pct = total ? Math.round((c / total) * 100) : 0;
        const barHeight = Math.max(6, Math.round((c / max) * 100));
        const accent = STAGE_FALLBACK_ACCENT[s.key.toLowerCase()] ?? "bg-primary/70";
        const barStyle = s.color ? { width: `${barHeight}%`, backgroundColor: s.color } : { width: `${barHeight}%` };
        return (
          <div
            key={s.id}
            className="group relative overflow-hidden rounded-lg border border-border/60 bg-background/40 p-3"
          >
            <div className="flex items-baseline justify-between">
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                {s.label}
              </div>
              <div className="text-[10px] font-mono text-muted-foreground">{pct}%</div>
            </div>
            <div className="mt-2 text-2xl font-semibold tabular-nums">{c}</div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={s.color ? "h-full rounded-full transition-all" : `${accent} h-full rounded-full transition-all`}
                style={barStyle}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------- Account properties + tokens ----------

const SOCIAL_META: Array<{
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  urlPrefix: string;
}> = [
  { key: "instagram", label: "Instagram", icon: Instagram, urlPrefix: "https://instagram.com/" },
  { key: "tiktok", label: "TikTok", icon: Music2, urlPrefix: "https://tiktok.com/@" },
  { key: "linkedin", label: "LinkedIn", icon: Linkedin, urlPrefix: "https://linkedin.com/in/" },
  { key: "youtube", label: "YouTube", icon: Youtube, urlPrefix: "https://youtube.com/@" },
];

function AccountPropertiesCard({
  socials,
  contactEmail,
  contactName,
  brandId,
  clientId,
}: {
  socials: Record<string, string | undefined>;
  contactEmail: string | null;
  contactName: string | null;
  brandId: string;
  clientId: string;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card">
      <div className="border-b border-border/60 px-4 py-3">
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          Propriedades da conta
        </div>
        <div className="mt-0.5 text-sm font-medium">Identidade e canais vinculados</div>
      </div>
      <div className="space-y-4 p-4">
        {(contactName || contactEmail) && (
          <div className="grid gap-1.5">
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              Contato principal
            </div>
            <div className="text-sm">
              {contactName ?? "—"}{" "}
              {contactEmail ? (
                <span className="text-muted-foreground">· {contactEmail}</span>
              ) : null}
            </div>
          </div>
        )}

        <div className="grid gap-1.5">
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            Canais sociais vinculados
          </div>
          <div className="grid gap-1">
            {SOCIAL_META.map((s) => {
              const handle = socials?.[s.key];
              if (!handle) return null;
              const clean = handle.replace(/^@/, "");
              return (
                <a
                  key={s.key}
                  href={`${s.urlPrefix}${clean}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between rounded-md border border-transparent px-2 py-1.5 text-sm transition hover:border-border/60 hover:bg-accent/40"
                >
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <s.icon className="h-3.5 w-3.5" />
                    {s.label}
                  </span>
                  <span className="flex items-center gap-1 font-mono text-xs">
                    @{clean}
                    <ExternalLink className="h-3 w-3 opacity-60" />
                  </span>
                </a>
              );
            })}
            {SOCIAL_META.every((s) => !socials?.[s.key]) && (
              <div className="rounded-md border border-dashed border-border/60 p-3 text-center text-xs text-muted-foreground">
                Nenhum canal social vinculado ainda.
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

// ---------- Activity feed ----------

function ActivityFeedCard({ activity }: { activity: CustomerDashboardData["activity"] }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card">
      <div className="border-b border-border/60 px-4 py-3">
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          Trilha de auditoria
        </div>
        <div className="mt-0.5 text-sm font-medium">Atividade recente ({activity.length})</div>
      </div>
      <div className="max-h-[420px] overflow-y-auto p-2">
        {activity.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground">
            Nenhum evento de atividade para esta conta ainda.
          </div>
        ) : (
          <ol className="relative ml-3 border-l border-border/60">
            {activity.map((ev) => (
              <ActivityRow key={ev.id} event={ev} />
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function ActivityRow({ event }: { event: CustomerDashboardData["activity"][number] }) {
  const meta = useMemo(() => activityDescriptor(event), [event]);
  const when = useMemo(() => {
    try {
      const d = new Date(event.created_at as string);
      const safe = Date.now() - d.getTime() < 0 ? new Date() : d;
      return formatDistanceToNow(safe, { addSuffix: true, locale: ptBR });
    } catch {
      return "";
    }
  }, [event.created_at]);
  return (
    <li className="relative pl-4 pr-2 py-2">
      <span className={`absolute -left-[6px] top-3 h-2.5 w-2.5 rounded-full ${meta.dot}`} />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <meta.icon className="h-3 w-3 text-muted-foreground" />
            <span className="text-sm font-medium">{meta.title}</span>
          </div>
          {meta.subtitle ? (
            <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{meta.subtitle}</div>
          ) : null}
        </div>
        <div className="shrink-0 font-mono text-[10px] text-muted-foreground">{when}</div>
      </div>
    </li>
  );
}

function activityDescriptor(ev: CustomerDashboardData["activity"][number]): {
  title: string;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  dot: string;
} {
  const payload = (ev.payload ?? {}) as Record<string, unknown>;
  const title = (payload.title as string) ?? "";
  const verbLabel: Record<string, string> = {
    created: "criado",
    updated: "atualizado",
    deleted: "excluído",
    approved: "aprovado",
    rejected: "rejeitado",
    scheduled: "agendado",
    published: "publicado",
    assigned: "atribuído",
    commented: "comentado",
    stage_changed: "movido de estágio",
    status_changed: "status alterado",
  };
  const stageLabel: Record<string, string> = {
    idea: "Ideia",
    production: "Produção",
    review: "Revisão",
    approval: "Aprovação",
    scheduled: "Agendado",
    published: "Publicado",
  };
  const taskStatusLabel: Record<string, string> = {
    todo: "a fazer",
    doing: "em andamento",
    done: "concluída",
    blocked: "bloqueada",
    backlog: "no backlog",
  };
  const humanVerb = (v: string) => verbLabel[v] ?? v;
  if (ev.entity_type === "post") {
    if (ev.verb === "stage_changed") {
      const to = String(payload.to ?? "");
      return {
        title: `Post movido para ${stageLabel[to] ?? to}`,
        subtitle: title,
        icon: Activity,
        dot: "bg-indigo-500",
      };
    }
    return { title: `Post ${humanVerb(ev.verb)}`, subtitle: title, icon: Sparkles, dot: "bg-cyan-500" };
  }
  if (ev.entity_type === "task") {
    if (ev.verb === "status_changed") {
      const to = String(payload.to ?? "");
      return {
        title: `Tarefa ${taskStatusLabel[to] ?? to}`,
        subtitle: title,
        icon: CheckCircle2,
        dot: "bg-emerald-500",
      };
    }
    return { title: `Tarefa ${humanVerb(ev.verb)}`, subtitle: title, icon: Clock, dot: "bg-amber-500" };
  }
  const entityLabel: Record<string, string> = {
    post: "Post",
    task: "Tarefa",
    project: "Projeto",
    customer: "Cliente",
    briefing: "Briefing",
    persona: "Persona",
  };
  return {
    title: `${entityLabel[ev.entity_type] ?? ev.entity_type} ${humanVerb(ev.verb)}`,
    subtitle: title,
    icon: Activity,
    dot: "bg-zinc-400 dark:bg-zinc-500",
  };
}
