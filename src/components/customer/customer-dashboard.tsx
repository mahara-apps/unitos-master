import { useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  Bot,
  CalendarClock,
  CheckCircle2,
  Circle,
  Clock,
  DollarSign,
  ExternalLink,
  Instagram,
  Linkedin,
  Music2,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Youtube,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sparkline } from "@/components/dashboard/sparkline";
import { ClientHealthPanel } from "@/components/dashboard/client-health-panel";
import { OverviewSkeleton } from "@/components/ai-agents/tab-skeletons";
import { StatCard } from "@/components/ui/stat-card";
import { AlertBanner } from "@/components/ui/alert-banner";
import { FunnelStages } from "@/components/ui/funnel-stages";
import { AgentUsageBar } from "@/components/ui/agent-usage-bar";
import {
  ActivityTimelineItem,
  type ActivityTimelineTone,
} from "@/components/ui/activity-timeline-item";
import { PanelCard } from "@/components/ui/panel-card";
import { PanelEmptyState } from "@/components/ui/panel-empty";
import { isValidScope } from "@/lib/customer-queries";
import {
  loadCustomerDashboardFn,
  type CustomerDashboardData,
} from "@/lib/customer-dashboard.functions";
import { getBrandHub } from "@/lib/brand-hub.functions";
import { computeBriefingCompletion } from "@/lib/briefing-progress";
import { useEffect } from "react";

type Props = {
  brandId: string;
  clientId: string;
  onOpenBriefing?: () => void;
};

export function CustomerDashboard({ brandId, clientId, onOpenBriefing }: Props) {
  const loadFn = useServerFn(loadCustomerDashboardFn);
  const fetchHub = useServerFn(getBrandHub);
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

  const hubQ = useQuery({
    queryKey: ["brand-hub", brandId, clientId],
    queryFn: () => fetchHub({ data: { brandId, clientId } }),
    staleTime: 30_000,
    enabled: scopeValid,
  });

  useEffect(() => {
    if (q.error) {
      const msg = (q.error as Error).message ?? "Falha ao carregar dados da conta";
      toast.error("Não foi possível carregar o painel", { description: msg });
    }
  }, [q.error]);

  if (!scopeValid || q.isLoading || !q.data) return <OverviewSkeleton />;
  const briefingCompletion = hubQ.data
    ? computeBriefingCompletion(hubQ.data.brand_hub ?? {}, hubQ.data)
    : null;
  return (
    <DashboardReady
      data={q.data}
      clientId={clientId}
      brandId={brandId}
      briefingCompletion={briefingCompletion}
      onOpenBriefing={onOpenBriefing}
    />
  );
}

function DashboardReady({
  data,
  clientId,
  brandId,
  briefingCompletion,
  onOpenBriefing,
}: {
  data: NonNullable<CustomerDashboardData>;
  clientId: string;
  brandId: string;
  briefingCompletion: number | null;
  onOpenBriefing?: () => void;
}) {
  const client = data.client;
  const m = data.metrics;
  const approvalPct = m.totalApprovals ? Math.round((m.decidedApprovals / m.totalApprovals) * 100) : 0;
  const socials = (client?.socials ?? {}) as Record<string, string | undefined>;
  const socialsCount = SOCIAL_META.filter((s) => !!socials?.[s.key]).length;
  const hasAiUsage = (m.aiJobsCount ?? 0) > 0;
  const hasActivity = data.activity.length > 0;

  const nextSteps: NextStep[] = [];
  if (briefingCompletion !== null && briefingCompletion < 100) {
    nextSteps.push({
      id: "brief",
      label: "Completar identidade da marca",
      hint:
        briefingCompletion > 0
          ? `Cérebro em ${briefingCompletion}%`
          : "Nenhum campo preenchido ainda",
      onClick: onOpenBriefing,
    });
  }
  if (!hasAiUsage) {
    nextSteps.push({
      id: "ai",
      label: "Gerar primeira estratégia com IA",
      hint: "O agente usa o Cérebro da Marca como contexto",
      onClick: onOpenBriefing,
    });
  }
  if (socialsCount <= 1) {
    nextSteps.push({
      id: "socials",
      label: "Conectar mais canais sociais",
      hint: socialsCount === 0 ? "Nenhum canal vinculado" : "Apenas 1 canal vinculado",
      onClick: onOpenBriefing,
    });
  }
  const showNextSteps = !hasActivity && nextSteps.length > 0;

  return (
    <div className="space-y-5">
      {/* Health */}
      <ClientHealthPanel score={m.health.score} breakdown={m.health.breakdown} />

      {/* Metrics row */}
      <div className="grid gap-4 md:grid-cols-3">
        {hasAiUsage ? (
          <MetricCard
            icon={DollarSign}
            label="Consumo de IA"
            value={`$${m.costTotal30d.toFixed(4)}`}
            hint={`$${m.costTotal14d.toFixed(4)} nos últimos 14d`}
            right={<Sparkline data={m.costSpark} className="h-8 w-24 text-cyan-500" />}
          />
        ) : (
          <AiEmptyCard onOpenBriefing={onOpenBriefing} />
        )}
        <MetricCard
          icon={ShieldCheck}
          label="Aprovações pendentes"
          value={m.pendingApprovals}
          hint={
            m.pendingApprovals === 0 && m.totalApprovals === 0
              ? "Nenhum conteúdo enviado para aprovação ainda"
              : `${m.decidedApprovals}/${m.totalApprovals || 0} resolvidas`
          }
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
          hint={
            m.scheduled === 0 && m.published === 0
              ? "Nenhum conteúdo agendado ainda"
              : `${m.published} já publicadas`
          }
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
              {data.pipeline.total === 0 ? (
                <span className="text-muted-foreground">Nenhum conteúdo gerado ainda</span>
              ) : (
                <>
                  {data.pipeline.total} posts em {data.pipeline.stages.length} estágios
                  {data.pipeline.pipelineName ? (
                    <span className="ml-1 text-muted-foreground">· {data.pipeline.pipelineName}</span>
                  ) : null}
                </>
              )}
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
        {showNextSteps ? (
          <NextStepsCard steps={nextSteps} />
        ) : (
          <ActivityFeedCard activity={data.activity} />
        )}
      </div>
    </div>
  );
}

// ---------- AI empty state ----------

function AiEmptyCard({ onOpenBriefing }: { onOpenBriefing?: () => void }) {
  return (
    <div className="flex flex-col justify-between gap-3 rounded-xl border border-dashed border-border/60 bg-card p-4">
      <div>
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3 w-3 text-muted-foreground" />
          <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            Consumo de IA
          </span>
        </div>
        <div className="mt-2 text-sm font-medium">Nenhuma geração ainda</div>
        <div className="mt-1 text-[11px] text-muted-foreground">
          Rode a primeira estratégia para começar a acumular consumo.
        </div>
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={onOpenBriefing}
        className="h-8 gap-1.5 self-start border-fuchsia-500/40 text-fuchsia-300 hover:bg-fuchsia-500/10 hover:text-fuchsia-200"
      >
        <Sparkles className="h-3.5 w-3.5" />
        Gerar Inteligência com IA
      </Button>
    </div>
  );
}

// ---------- Next steps ----------

type NextStep = {
  id: string;
  label: string;
  hint?: string;
  onClick?: () => void;
};

function NextStepsCard({ steps }: { steps: NextStep[] }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card">
      <div className="border-b border-border/60 px-4 py-3">
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          Próximos passos
        </div>
        <div className="mt-0.5 text-sm font-medium">
          Complete o onboarding do cliente ({steps.length})
        </div>
      </div>
      <ul className="divide-y divide-border/60">
        {steps.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={s.onClick}
              className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-accent/40"
            >
              <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{s.label}</div>
                {s.hint ? (
                  <div className="mt-0.5 text-[11px] text-muted-foreground">{s.hint}</div>
                ) : null}
              </div>
              <ExternalLink className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </button>
          </li>
        ))}
      </ul>
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
