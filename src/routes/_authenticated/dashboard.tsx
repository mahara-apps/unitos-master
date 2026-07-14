import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import {
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Copy,
  ExternalLink,
  FolderKanban,
  Instagram,
  Linkedin,
  Mail,
  Music2,
  Phone,
  Plus,
  Sparkles,
  UserPlus,
  Youtube,
  CalendarIcon,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from "lucide-react";
import { useActiveContext } from "@/hooks/use-active-context";
import { getDashboardStats } from "@/lib/dashboard.functions";
import {
  loadCustomerDashboardFn,
  createPortalTokenFn,
} from "@/lib/customer-dashboard.functions";
import { supabase } from "@/integrations/supabase/client";
import { usePageHeader } from "@/hooks/use-page-header";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

// ---------- Page ----------

function DashboardPage() {
  const { brandId, clientId } = useActiveContext();

  if (!brandId) {
    return (
      <div className="w-full px-6 py-10 md:px-8">
        <div className="rounded-2xl border border-border/60 bg-card px-6 py-8 text-sm text-muted-foreground">
          Selecione uma workspace na barra lateral para carregar o painel.
        </div>
      </div>
    );
  }

  return <DashboardContent brandId={brandId} clientId={clientId} />;
}

function DashboardContent({ brandId, clientId }: { brandId: string; clientId: string | null }) {
  const statsFn = useServerFn(getDashboardStats);
  const customerFn = useServerFn(loadCustomerDashboardFn);

  const stats = useQuery({
    queryKey: ["dashboard", brandId, clientId],
    queryFn: () => statsFn({ data: { brandId, clientId } }),
    staleTime: 20_000,
  });

  const customer = useQuery({
    queryKey: ["customer-dashboard", brandId, clientId],
    queryFn: () => customerFn({ data: { brandId, clientId: clientId! } }),
    enabled: !!clientId,
    staleTime: 20_000,
  });

  const [userName, setUserName] = React.useState<string>("");
  React.useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      const meta = (u?.user_metadata ?? {}) as Record<string, unknown>;
      const name =
        (meta.full_name as string) ||
        (meta.name as string) ||
        (u?.email ? u.email.split("@")[0] : "");
      setUserName(name);
    });
  }, []);

  const clientName = customer.data?.client?.name ?? null;
  const scopeLabel = clientName ?? "Agência";
  const greeting = userName ? `Olá, ${userName}!` : "Olá!";

  usePageHeader(
    {
      title: greeting,
      subtitle: `Visão de ${scopeLabel} · tudo o que está acontecendo agora`,
    },
    [greeting, scopeLabel],
  );

  return (
    <div className="w-full space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      {/* Ações rápidas */}
      <section>
        <SectionHeading title="Ações rápidas" />
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <QuickAction
            to="/content"
            icon={<ClipboardList className="h-4 w-4" />}
            title="Nova tarefa"
            hint="Atribua à equipe"
            tint="from-sky-500/25 via-sky-500/10 to-transparent"
          />
          <QuickAction
            to="/calendar"
            icon={<CalendarDays className="h-4 w-4" />}
            title="Calendário"
            hint="Próximas publicações"
            tint="from-amber-500/25 via-amber-500/10 to-transparent"
          />
          <QuickAction
            to="/content"
            icon={<FolderKanban className="h-4 w-4" />}
            title="Painel de produção"
            hint="Kanban de conteúdo"
            tint="from-emerald-500/25 via-emerald-500/10 to-transparent"
          />
          {clientId ? (
            <QuickAction
              to={`/customers/${clientId}/briefing`}
              icon={<Sparkles className="h-4 w-4" />}
              title="Novo briefing"
              hint="Atualize a estratégia"
              tint="from-fuchsia-500/25 via-fuchsia-500/10 to-transparent"
            />
          ) : (
            <QuickAction
              to="/customers"
              icon={<UserPlus className="h-4 w-4" />}
              title="Novo cliente"
              hint="Cadastre marcas"
              tint="from-fuchsia-500/25 via-fuchsia-500/10 to-transparent"
            />
          )}
        </div>
      </section>

      {/* Cliente em foco */}
      <section>
        <SectionHeading title="Cliente em foco" />
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          <ClientIdentityCard
            brandId={brandId}
            client={customer.data?.client ?? null}
            loading={!!clientId && customer.isLoading}
          />
          <ClientProjectsPortalCard
            clientId={clientId}
            portalTokens={customer.data?.portalTokens ?? []}
          />
        </div>
      </section>

      {/* Métricas */}
      <section>
        <SectionHeading title="Métricas" />
        <div className="mt-3 grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
          <MetricTile
            label="Posts aprovados (30d)"
            value={stats.data?.counts.posts_approved_30d ?? 0}
            accent="blue"
            tone="positive"
          />
          <MetricTile
            label="Projetos ativos"
            value={stats.data?.counts.projects_active ?? 0}
            accent="purple"
            tone="positive"
          />
          <MetricTile
            label="Tarefas abertas"
            value={stats.data?.counts.tasks_open ?? 0}
            accent="orange"
            tone="neutral"
          />
          <MetricTile
            label="Tarefas atrasadas"
            value={stats.data?.counts.tasks_overdue ?? 0}
            accent="red"
            tone="risk"
          />
          <MetricTile
            label="Concluídas (7d)"
            value={stats.data?.counts.tasks_done_7d ?? 0}
            accent="green"
            tone="positive"
          />
          <MetricTile
            label="Publicações"
            value={stats.data?.counts.posts_total ?? 0}
            accent="pink"
            tone="positive"
          />
        </div>
      </section>

      {/* Tasks + Funil */}
      <section className="grid gap-4 lg:grid-cols-2">
        <MyTasksCard tasks={stats.data?.myTasks ?? []} loading={stats.isLoading} />
        <ProductionFunnelCard postsByStage={stats.data?.postsByStage ?? {}} />
      </section>

      {/* Footer row */}
      <section className="grid gap-4 lg:grid-cols-2">
        <UpcomingPostsCard posts={stats.data?.upcomingPosts ?? []} loading={stats.isLoading} />
        <RecentActivityCard activity={stats.data?.recentActivity ?? []} loading={stats.isLoading} />
      </section>
    </div>
  );
}

// ---------- Building blocks ----------

function SectionHeading({ title }: { title: string }) {
  return (
    <h2 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
      {title}
    </h2>
  );
}

function QuickAction({
  to,
  icon,
  title,
  hint,
  tint,
}: {
  to: string;
  icon: React.ReactNode;
  title: string;
  hint: string;
  tint: string;
}) {
  return (
    <Link
      to={to}
      className="group relative overflow-hidden rounded-xl border border-border/60 bg-card p-4 transition hover:border-border hover:shadow-sm"
    >
      <div className={cn("pointer-events-none absolute inset-0 bg-gradient-to-br opacity-70", tint)} />
      <div className="relative flex items-start gap-3">
        <span className="grid h-8 w-8 place-items-center rounded-lg border border-border/60 bg-background/70 text-foreground/80">
          {icon}
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            {title}
            <Plus className="h-3 w-3 opacity-40 transition group-hover:opacity-100" />
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>
        </div>
      </div>
    </Link>
  );
}

// ---------- Client identity ----------

type ClientRow = {
  id: string;
  name: string;
  color?: string | null;
  niche?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  tone_of_voice?: string | null;
  socials?: unknown;
} | null;

function ClientIdentityCard({
  brandId,
  client,
  loading,
}: {
  brandId: string;
  client: ClientRow;
  loading: boolean;
}) {
  if (loading) {
    return <div className="h-64 animate-pulse rounded-xl border border-border/60 bg-card" />;
  }
  if (!client) {
    return (
      <div className="flex h-full min-h-[16rem] items-center justify-center rounded-xl border border-dashed border-border/60 bg-card/40 p-6 text-center text-sm text-muted-foreground">
        Selecione uma conta na barra lateral para ver os dados do cliente em foco.
      </div>
    );
  }
  const socials =
    (client.socials && typeof client.socials === "object"
      ? (client.socials as Record<string, string | undefined>)
      : {}) ?? {};
  const palette = extractPalette(client);
  const initials = client.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("") || "?";

  return (
    <div className="rounded-xl border border-border/60 bg-card p-4">
      <div className="flex items-start gap-3">
        <div
          className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-sm font-semibold text-white"
          style={{ background: client.color ?? "linear-gradient(135deg,#6366f1,#ec4899)" }}
        >
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-semibold tracking-tight">{client.name}</div>
          <div className="text-xs text-muted-foreground">{client.niche ?? "Sem nicho definido"}</div>
        </div>
        <Link
          to="/customers/$customerId"
          params={{ customerId: client.id }}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Abrir conta →
        </Link>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <IdentityField label="Contato" value={client.contact_name ?? "—"} icon={<UserPlus className="h-3 w-3" />} />
        <IdentityField label="E-mail" value={client.contact_email ?? "—"} icon={<Mail className="h-3 w-3" />} />
        <IdentityField label="Telefone" value={(socials.phone as string) ?? "—"} icon={<Phone className="h-3 w-3" />} />
        <IdentityField label="Tom de voz" value={client.tone_of_voice ?? "—"} icon={<Sparkles className="h-3 w-3" />} />

        <div className="sm:col-span-2">
          <FieldLabel>Paleta</FieldLabel>
          {palette.length ? (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {palette.map((c, i) => (
                <span
                  key={`${c}-${i}`}
                  className="h-6 w-6 rounded-md border border-border/60"
                  style={{ background: c }}
                  title={c}
                />
              ))}
            </div>
          ) : (
            <div className="mt-1 text-sm text-muted-foreground">—</div>
          )}
        </div>

        <div className="sm:col-span-2">
          <FieldLabel>Redes</FieldLabel>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {renderSocial("instagram", socials.instagram, Instagram, "https://instagram.com/")}
            {renderSocial("tiktok", socials.tiktok, Music2, "https://tiktok.com/@")}
            {renderSocial("linkedin", socials.linkedin, Linkedin, "https://linkedin.com/in/")}
            {renderSocial("youtube", socials.youtube, Youtube, "https://youtube.com/@")}
            {["instagram", "tiktok", "linkedin", "youtube"].every((k) => !socials[k]) && (
              <span className="text-sm text-muted-foreground">Nenhuma rede vinculada.</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function extractPalette(client: NonNullable<ClientRow>): string[] {
  const raw = client as unknown as Record<string, unknown>;
  const brandHub = (raw.brand_hub ?? {}) as Record<string, unknown>;
  const palette = (brandHub.palette as string[] | undefined) ?? [];
  const out = palette.filter((s) => typeof s === "string" && /^#|rgb|hsl|oklch|oklab/i.test(s));
  if (client.color) out.unshift(client.color);
  return Array.from(new Set(out)).slice(0, 8);
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
      {children}
    </div>
  );
}

function IdentityField({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <FieldLabel>{label}</FieldLabel>
      <div className="mt-1 flex items-center gap-1.5 truncate text-sm text-foreground/90">
        <span className="text-muted-foreground">{icon}</span>
        <span className="truncate">{value}</span>
      </div>
    </div>
  );
}

function renderSocial(
  key: string,
  handle: string | undefined,
  Icon: React.ComponentType<{ className?: string }>,
  prefix: string,
) {
  if (!handle) return null;
  const clean = handle.replace(/^@/, "");
  return (
    <a
      key={key}
      href={`${prefix}${clean}`}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-background/40 px-2 py-1 text-xs text-foreground/80 transition hover:border-border hover:text-foreground"
    >
      <Icon className="h-3 w-3" />@{clean}
      <ExternalLink className="h-2.5 w-2.5 opacity-60" />
    </a>
  );
}

// ---------- Portal + projects ----------

type PortalToken = {
  id: string;
  token: string;
  label: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

function ClientProjectsPortalCard({
  clientId,
  portalTokens,
}: {
  clientId: string | null;
  portalTokens: PortalToken[];
}) {
  const qc = useQueryClient();
  const createToken = useServerFn(createPortalTokenFn);
  const [label, setLabel] = React.useState("");
  const [expires, setExpires] = React.useState<Date | undefined>(undefined);

  const mut = useMutation({
    mutationFn: async () => {
      if (!clientId) throw new Error("Selecione uma conta primeiro.");
      const expiresInDays = expires
        ? Math.max(1, Math.ceil((expires.getTime() - Date.now()) / 86_400_000))
        : null;
      return createToken({
        data: {
          clientId,
          label: label.trim() || "Link público",
          expiresInDays,
        },
      });
    },
    onSuccess: () => {
      toast.success("Link do portal gerado.");
      setLabel("");
      setExpires(undefined);
      qc.invalidateQueries({ queryKey: ["customer-dashboard"] });
    },
    onError: (e) => toast.error((e as Error).message ?? "Falha ao gerar link"),
  });

  const activeTokens = portalTokens.filter((t) => !t.revoked_at);

  return (
    <div className="flex flex-col rounded-xl border border-border/60 bg-card">
      <div className="border-b border-border/60 px-4 py-3">
        <div className="text-sm font-medium">Projetos (0)</div>
        <p className="text-xs text-muted-foreground">Agrupe entregas em projetos para ganhar visibilidade.</p>
      </div>
      <div className="px-4 py-3 text-xs text-muted-foreground">
        Nenhum projeto criado para esta conta ainda.
      </div>

      <div className="border-t border-border/60 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">Links de portal público</div>
            <p className="text-xs text-muted-foreground">
              Compartilhe uma URL somente-leitura com a marca ou stakeholders.
            </p>
          </div>
          <span className="rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            {activeTokens.length}
          </span>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_180px_auto]">
          <Input
            placeholder="Identificação (ex: Cliente ACME)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            disabled={!clientId}
          />
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                disabled={!clientId}
                className={cn("justify-start font-normal", !expires && "text-muted-foreground")}
              >
                <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                {expires ? format(expires, "PPP", { locale: ptBR }) : "Data de expiração"}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto p-0">
              <Calendar
                mode="single"
                selected={expires}
                onSelect={setExpires}
                initialFocus
                className="pointer-events-auto p-3"
                disabled={(d) => d < new Date()}
              />
            </PopoverContent>
          </Popover>
          <Button
            type="button"
            onClick={() => mut.mutate()}
            disabled={!clientId || mut.isPending}
            className="bg-rose-600 text-white hover:bg-rose-700"
          >
            <Plus className="mr-1 h-3.5 w-3.5" /> Gerar link
          </Button>
        </div>

        {activeTokens.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {activeTokens.slice(0, 4).map((t) => {
              const url = `${typeof window !== "undefined" ? window.location.origin : ""}/portal/${t.token}`;
              return (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-background/40 px-2 py-1.5 text-xs"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{t.label ?? "Link público"}</div>
                    <div className="truncate font-mono text-[10px] text-muted-foreground">{url}</div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      navigator.clipboard.writeText(url);
                      toast.success("Link copiado.");
                    }}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

// ---------- Metric tile ----------

const ACCENTS: Record<string, string> = {
  sky: "bg-sky-500",
  indigo: "bg-indigo-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  emerald: "bg-emerald-500",
  fuchsia: "bg-fuchsia-500",
  blue: "bg-blue-500",
  purple: "bg-purple-500",
  orange: "bg-orange-500",
  red: "bg-red-500",
  green: "bg-green-500",
  pink: "bg-pink-500",
};

function MetricTile({
  label,
  value,
  accent,
  tone = "neutral",
  delta,
}: {
  label: string;
  value: number | string;
  accent: keyof typeof ACCENTS;
  tone?: "positive" | "risk" | "neutral";
  delta?: { pct: number; direction: "up" | "down"; period?: string } | null;
}) {
  const period = delta?.period ?? "vs período anterior";
  let trend: React.ReactNode;
  if (!delta) {
    trend = (
      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/70">
        <Minus className="h-3 w-3" />
        <span className="tabular-nums">—</span>
        <span>{period}</span>
      </span>
    );
  } else {
    const up = delta.direction === "up";
    // For "positive" tone, up is good (emerald). For "risk", up is bad (crimson).
    const good = tone === "risk" ? !up : up;
    const color = good ? "text-emerald-500" : "text-rose-500";
    const Arrow = up ? ArrowUpRight : ArrowDownRight;
    trend = (
      <span className={cn("inline-flex items-center gap-1 text-[11px] font-medium", color)}>
        <Arrow className="h-3 w-3" />
        <span className="tabular-nums">{delta.pct}%</span>
        <span className="text-muted-foreground font-normal">{period}</span>
      </span>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-xl border border-border/60 bg-card p-4">
      <span className={cn("absolute inset-x-0 top-0 h-0.5", ACCENTS[accent])} />
      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">{value}</div>
      <div className="mt-1.5">{trend}</div>
    </div>
  );
}

// ---------- My tasks ----------

function MyTasksCard({
  tasks,
  loading,
}: {
  tasks: Array<{ id: string; title: string; due_at: string | null; priority: string; status: string }>;
  loading: boolean;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <div className="text-sm font-medium">Minhas tarefas em aberto</div>
        <Link to="/content" className="text-xs text-muted-foreground hover:text-foreground">
          Ver todas →
        </Link>
      </div>
      {loading ? (
        <div className="p-6 text-center text-xs text-muted-foreground">Carregando…</div>
      ) : tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-full border border-border/60 bg-background/40">
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          </div>
          <div className="text-sm font-medium text-foreground">Sem tarefas pendentes para você.</div>
          <div className="text-xs text-muted-foreground">Bom trabalho!</div>
        </div>
      ) : (
        <ul className="divide-y divide-border/40">
          {tasks.slice(0, 8).map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <span className="truncate">{t.title}</span>
              <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                {t.due_at ? format(new Date(t.due_at), "dd MMM", { locale: ptBR }) : "sem prazo"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------- Production funnel ----------

const FUNNEL_STAGES: Array<{ key: string; label: string; dot: string }> = [
  { key: "idea", label: "Ideia", dot: "bg-sky-500" },
  { key: "production", label: "Em produção", dot: "bg-amber-500" },
  { key: "review", label: "Em revisão", dot: "bg-orange-500" },
  { key: "approved", label: "Aprovado", dot: "bg-emerald-500" },
  { key: "scheduled", label: "Agendado", dot: "bg-violet-500" },
  { key: "published", label: "Publicado", dot: "bg-pink-500" },
];

function ProductionFunnelCard({ postsByStage }: { postsByStage: Record<string, number> }) {
  const total = FUNNEL_STAGES.reduce((s, x) => s + (postsByStage[x.key] ?? 0), 0);
  return (
    <div className="rounded-xl border border-border/60 bg-card">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <div className="text-sm font-medium">Funil de produção</div>
        <Link to="/content" className="text-xs text-muted-foreground hover:text-foreground">
          Abrir Kanban →
        </Link>
      </div>
      <ul className="divide-y divide-border/40">
        {FUNNEL_STAGES.map((s) => {
          const n = postsByStage[s.key] ?? 0;
          const pct = total ? Math.round((n / total) * 100) : 0;
          return (
            <li key={s.key} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <span className="flex items-center gap-2">
                <span className={cn("h-2 w-2 rounded-full", s.dot)} />
                {s.label}
              </span>
              <span className="flex items-center gap-3 font-mono text-xs tabular-nums">
                <span className="text-muted-foreground">{pct}%</span>
                <span className="text-foreground">{n}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------- Upcoming posts ----------

function UpcomingPostsCard({
  posts,
  loading,
}: {
  posts: Array<{ id: string; title: string; scheduled_at: string | null }>;
  loading: boolean;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <div>
          <div className="text-sm font-medium">Próximas publicações</div>
          <div className="text-[11px] text-muted-foreground">7 dias</div>
        </div>
        <Link to="/calendar" className="text-xs text-muted-foreground hover:text-foreground">
          Calendário →
        </Link>
      </div>
      {loading ? (
        <div className="p-6 text-center text-xs text-muted-foreground">Carregando…</div>
      ) : posts.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
          <CalendarClock className="h-5 w-5 text-muted-foreground" />
          <div className="text-sm text-foreground">Nenhuma publicação agendada para os próximos 7 dias.</div>
        </div>
      ) : (
        <ul className="divide-y divide-border/40">
          {posts.slice(0, 6).map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <span className="truncate">{p.title}</span>
              <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                {p.scheduled_at ? format(new Date(p.scheduled_at), "dd MMM · HH:mm", { locale: ptBR }) : "—"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------- Recent activity ----------

function RecentActivityCard({
  activity,
  loading,
}: {
  activity: Array<{ id: string; verb: string; entity_type: string; payload: { title?: string } | null; created_at: string }>;
  loading: boolean;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <div className="text-sm font-medium">Atividade recente</div>
        <Link to="/notifications" className="text-xs text-muted-foreground hover:text-foreground">
          Ver tudo →
        </Link>
      </div>
      {loading ? (
        <div className="p-6 text-center text-xs text-muted-foreground">Carregando…</div>
      ) : activity.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
          <Sparkles className="h-5 w-5 text-muted-foreground" />
          <div className="text-sm text-foreground">Nada por aqui ainda.</div>
          <div className="text-xs text-muted-foreground">
            Assim que a equipe começar a operar, os eventos aparecem em tempo real.
          </div>
        </div>
      ) : (
        <ul className="divide-y divide-border/40">
          {activity.slice(0, 8).map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <span className="truncate">
                <span className="font-medium capitalize">{a.entity_type}</span>{" "}
                <span className="text-muted-foreground">{a.verb}</span>
                {a.payload?.title ? (
                  <span className="ml-1 text-muted-foreground">· {a.payload.title}</span>
                ) : null}
              </span>
              <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                {format(new Date(a.created_at), "dd MMM · HH:mm", { locale: ptBR })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
