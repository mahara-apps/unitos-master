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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { WelcomeModal } from "@/components/dashboard/welcome-modal";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

// ---------- Page ----------

function DashboardPage() {
  const { brandId, clientId } = useActiveContext();
  usePageHeader({ title: "" }, []);

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

  return (
    <div className="w-full space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <WelcomeModal brandId={brandId} data={undefined} />

      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-2">
            <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground">
              {greeting}
            </h1>
            <span className="text-sm text-muted-foreground">
              Visão de <span className="text-foreground/80 font-medium">{scopeLabel}</span>
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Tudo o que está acontecendo na sua operação agora.
          </p>
        </div>
      </header>

      {/* Ações rápidas */}
      <section>
        <SectionHeading title="Ações rápidas" />
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <QuickAction
            to="/work"
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
            to="/projects"
            icon={<FolderKanban className="h-4 w-4" />}
            title="Novo projeto"
            hint="Agrupe entregas"
            tint="from-emerald-500/25 via-emerald-500/10 to-transparent"
          />
          <QuickAction
            to="/customers"
            icon={<UserPlus className="h-4 w-4" />}
            title="Novo cliente"
            hint="Cadastre marcas"
            tint="from-fuchsia-500/25 via-fuchsia-500/10 to-transparent"
          />
        </div>
      </section>

      {/* Cliente em foco */}
      <section>
        <SectionHeading title="Cliente em foco" />
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          <ClientIdentityCard
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
          <MetricTile label="Clientes" value={stats.data?.counts.clients ?? 0} accent="sky" />
          <MetricTile label="Projetos ativos" value={stats.data?.counts.projects_active ?? 0} accent="indigo" />
          <MetricTile label="Tarefas abertas" value={stats.data?.counts.tasks_open ?? 0} accent="amber" />
          <MetricTile label="Tarefas atrasadas" value={stats.data?.counts.tasks_overdue ?? 0} accent="rose" />
          <MetricTile label="Concluídas (7d)" value={stats.data?.counts.tasks_done_7d ?? 0} accent="emerald" />
          <MetricTile label="Publicações" value={stats.data?.counts.posts_total ?? 0} accent="fuchsia" />
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
  socials?: Record<string, string | undefined> | null;
} | null;

function ClientIdentityCard({ client, loading }: { client: ClientRow; loading: boolean }) {
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
  const socials = (client.socials ?? {}) as Record<string, string | undefined>;
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
};

function MetricTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent: keyof typeof ACCENTS;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-border/60 bg-card p-4">
      <span className={cn("absolute inset-x-0 top-0 h-0.5", ACCENTS[accent])} />
      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">{value}</div>
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
        <Link to="/work" className="text-xs text-muted-foreground hover:text-foreground">
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

function DashboardPage() {
  const { brandId, clientId } = useActiveContext();

  const [range, setRange] = React.useState<DateRange | undefined>(() => ({
    from: subDays(new Date(), 29),
    to: new Date(),
  }));

  const days = React.useMemo(() => {
    if (!range?.from) return 30;
    const end = range.to ?? range.from;
    return Math.max(7, Math.min(90, differenceInCalendarDays(end, range.from) + 1));
  }, [range]);

  usePageHeader(
    {
      title: "Central de comando da agência",
      subtitle: clientId ? "Visão da conta" : "Telemetria operacional de todas as contas ativas",
      actions: <DateRangePicker value={range} onChange={setRange} />,
    },
    [range, clientId],
  );

  const agency = useQuery({
    queryKey: ["agency-dashboard", brandId],
    enabled: !!brandId && !clientId,
    queryFn: () => getAgencyDashboard({ data: { brandId: brandId! } }),
  });

  const client = useQuery({
    queryKey: ["dashboard", brandId, clientId],
    enabled: !!brandId && !!clientId,
    queryFn: () => getDashboardStats({ data: { brandId: brandId!, clientId } }),
  });

  if (!brandId) {
    return (
      <div className="w-full px-6 py-10 md:px-8">
        <div className="rounded-2xl border border-border/60 bg-card px-6 py-8 text-sm text-muted-foreground">
          Selecione uma workspace na barra lateral para carregar a central de comando.
        </div>
      </div>
    );
  }

  // When an account is selected globally, the dashboard becomes the
  // customer-scoped control center (same view as the Overview tab in
  // /customers/$customerId).
  if (clientId) {
    return (
      <div className="w-full px-4 py-6 sm:px-6 lg:px-8">
        <CustomerDashboard brandId={brandId} clientId={clientId} />
      </div>
    );
  }

  const data: AgencyDashboard | undefined = agency.data;
  const isLoading = agency.isLoading;
  const c = data?.counts;
  const spark = data?.sparkline ?? [];
  const heatmap = (data?.heatmap ?? []).slice(-days);

  const doneRatio = c
    ? Math.round(
        (c.tasks_done_7d /
          Math.max(1, c.tasks_done_7d + c.tasks_open)) *
          100,
      )
    : 0;
  const approvalRatio = c
    ? Math.round(
        ((c.posts_total - c.approvals_pending) / Math.max(1, c.posts_total)) * 100,
      )
    : 100;

  return (
    <div className="w-full space-y-6 px-6 py-6 md:px-8">
      <WelcomeModal brandId={brandId} data={data} />
      {/* KPI ROW */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={<Users className="h-3.5 w-3.5" />}
          label="Contas ativas"
          value={isLoading ? "…" : (c?.clients ?? 0)}
          spark={spark}
          trendDelta={deltaFromSpark(spark)}
          accent="var(--color-primary)"
        />
        <MetricCard
          icon={<ListChecks className="h-3.5 w-3.5" />}
          label="Tarefas abertas"
          value={isLoading ? "…" : (c?.tasks_open ?? 0)}
          hint={`${c?.tasks_overdue ?? 0} atrasadas · ${c?.tasks_done_7d ?? 0} concluídas 7d`}
          spark={spark}
          accent="var(--color-severity-warning, oklch(0.72 0.16 65))"
          footer={
            <div className="mt-3 space-y-1">
              <div className="flex justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
                <span>Conclusão 7d</span>
                <span className="text-foreground/80">{doneRatio}%</span>
              </div>
              <HealthBar score={doneRatio} />
            </div>
          }
        />
        <MetricCard
          icon={<ShieldCheck className="h-3.5 w-3.5" />}
          label="Aprovações pendentes"
          value={isLoading ? "…" : (c?.approvals_pending ?? 0)}
          hint={`${c?.posts_total ?? 0} peças no pipeline`}
          spark={spark}
          accent="var(--color-severity-info, oklch(0.7 0.14 240))"
          footer={
            <div className="mt-3 space-y-1">
              <div className="flex justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
                <span>Fluxo aprovado</span>
                <span className="text-foreground/80">{approvalRatio}%</span>
              </div>
              <HealthBar score={approvalRatio} />
            </div>
          }
        />
        <MetricCard
          icon={<CalendarClock className="h-3.5 w-3.5" />}
          label="Projetos ativos"
          value={isLoading ? "…" : (c?.projects_active ?? 0)}
          hint="Em execução no ciclo atual"
          spark={spark}
          accent="oklch(0.78 0.16 155)"
        />
      </div>

      {/* WOW GRID */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <section className="relative overflow-hidden rounded-2xl border border-border/60 bg-card">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/[0.04] via-transparent to-transparent" />
          <header className="relative flex items-center justify-between gap-3 border-b border-border/50 px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-foreground">
                Ritmo editorial
              </h2>
              <p className="text-xs text-muted-foreground">
                Cadência de publicações agregada entre todas as contas · últimos {days} dias
              </p>
            </div>
            <HeatmapLegend />
          </header>
          <div className="relative flex min-h-[220px] items-center justify-center overflow-x-auto px-5 py-6">
            {isLoading ? (
              <div className="h-24 w-full animate-pulse rounded-lg bg-muted/40" />
            ) : (
              <PublicationHeatmap data={heatmap.length ? heatmap : Array.from({ length: days }, () => 0)} />
            )}
          </div>
          <div className="relative grid grid-cols-3 gap-4 border-t border-border/50 px-5 py-3 text-xs">
            <FootStat label="Total no período" value={heatmap.reduce((a, b) => a + b, 0)} />
            <FootStat label="Pico diário" value={Math.max(0, ...heatmap)} />
            <FootStat
              label="Média / dia"
              value={heatmap.length ? (heatmap.reduce((a, b) => a + b, 0) / heatmap.length).toFixed(1) : 0}
            />
          </div>
        </section>

        <div className="grid gap-4">
          <AlertList alerts={data?.alerts ?? []} loading={isLoading} />
          <ApprovalsList items={data?.approvalsQueue ?? []} loading={isLoading} />
        </div>
      </div>

      {/* HEALTH + INSIGHTS */}
      {data && data.healths.length > 0 && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
          <section className="rounded-2xl border border-border/60 bg-card">
            <header className="flex items-center justify-between border-b border-border/50 px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold tracking-tight">Saúde das contas</h2>
                <p className="text-xs text-muted-foreground">
                  Score composto: entregas, aprovações, briefing e agenda.
                </p>
              </div>
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                {data.healths.length} contas
              </span>
            </header>
            <ul className="divide-y divide-border/40">
              {data.healths.slice(0, 6).map((h) => (
                <li
                  key={h.id}
                  className="grid grid-cols-[1fr_100px_60px] items-center gap-4 px-5 py-3 text-sm"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: h.color ?? "var(--color-primary)" }}
                    />
                    <div className="min-w-0">
                      <div className="truncate font-medium text-foreground">{h.name}</div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {h.openTasks} tarefas · {h.overdueTasks} atrasadas · {h.approvalsPending} p/ aprovar
                      </div>
                    </div>
                  </div>
                  <HealthBar score={h.score} />
                  <span className="text-right font-mono text-xs tabular-nums text-foreground/80">
                    {h.score}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <InsightsPanel brandId={brandId} clientId={clientId} />
        </div>
      )}

      {/* NOTIFICATION STREAM */}
      <ActivityStream items={data?.upcoming ?? []} loading={isLoading} />
    </div>
  );
}

function AlertList({ alerts, loading }: { alerts: AgencyAlert[]; loading: boolean }) {
  return (
    <section className="rounded-2xl border border-border/60 bg-card">
      <header className="flex items-center justify-between border-b border-border/50 px-5 py-3.5">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">Alertas</h2>
          <p className="text-[11px] text-muted-foreground">Sinais que exigem atenção.</p>
        </div>
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
          {alerts.length}
        </span>
      </header>
      {loading ? (
        <div className="space-y-2 px-5 py-4">
          <div className="h-8 w-full animate-pulse rounded-md bg-muted/40" />
          <div className="h-8 w-full animate-pulse rounded-md bg-muted/40" />
        </div>
      ) : alerts.length === 0 ? (
        <div className="flex items-center gap-2 px-5 py-6 text-xs text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          Tudo certo. Nenhum alerta ativo.
        </div>
      ) : (
        <ul className="divide-y divide-border/40">
          {alerts.slice(0, 5).map((a) => {
            const tone =
              a.severity === "critical"
                ? "text-rose-500"
                : a.severity === "warning"
                ? "text-amber-500"
                : "text-sky-500";
            const Icon =
              a.severity === "critical" ? ShieldAlert : a.severity === "warning" ? AlertTriangle : Info;
            return (
              <li key={a.id} className="flex items-start gap-3 px-5 py-3">
                <Icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", tone)} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-foreground">{a.title}</span>
                    <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
                      {a.count}
                    </span>
                  </div>
                  <p className="truncate text-[11px] text-muted-foreground">{a.description}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function ApprovalsList({
  items,
  loading,
}: {
  items: AgencyDashboard["approvalsQueue"];
  loading: boolean;
}) {
  return (
    <section className="rounded-2xl border border-border/60 bg-card">
      <header className="flex items-center justify-between border-b border-border/50 px-5 py-3.5">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">Aprovações pendentes</h2>
          <p className="text-[11px] text-muted-foreground">Peças aguardando validação.</p>
        </div>
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
          {items.length}
        </span>
      </header>
      {loading ? (
        <div className="space-y-2 px-5 py-4">
          <div className="h-8 w-full animate-pulse rounded-md bg-muted/40" />
          <div className="h-8 w-full animate-pulse rounded-md bg-muted/40" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex items-center gap-2 px-5 py-6 text-xs text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          Nada pendente. Fluxo em dia.
        </div>
      ) : (
        <ul className="divide-y divide-border/40">
          {items.slice(0, 5).map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
              <div className="min-w-0">
                <div className="truncate font-medium text-foreground">{a.title}</div>
                <div className="truncate text-[11px] text-muted-foreground">{a.client_name}</div>
              </div>
              <span className="shrink-0 font-mono text-[10px] uppercase text-muted-foreground">
                {timeAgo(a.waiting_since)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ActivityStream({
  items,
  loading,
}: {
  items: AgencyDashboard["upcoming"];
  loading: boolean;
}) {
  return (
    <section className="rounded-2xl border border-border/60 bg-card">
      <header className="flex items-center justify-between border-b border-border/50 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">Fluxo de atividades</h2>
          <p className="text-[11px] text-muted-foreground">
            Próximas entregas e publicações agendadas de toda a agência.
          </p>
        </div>
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
          {items.length}
        </span>
      </header>
      {loading ? (
        <div className="space-y-2 px-5 py-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-7 w-full animate-pulse rounded-md bg-muted/40" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="px-5 py-8 text-center text-xs text-muted-foreground">
          Nenhuma atividade agendada nesta janela.
        </div>
      ) : (
        <ul className="divide-y divide-border/40">
          {items.slice(0, 10).map((n) => {
            const isPost = n.kind === "post";
            return (
              <li
                key={`${n.kind}-${n.id}`}
                className="flex items-center gap-4 px-5 py-3 text-sm"
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 shrink-0 rounded-full",
                    isPost ? "bg-sky-500" : "bg-amber-500",
                  )}
                />
                <span className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                  {isPost ? <FileText className="h-3 w-3" /> : <ListChecks className="h-3 w-3" />}
                  {isPost ? "Post" : "Tarefa"}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                  {n.title}
                </span>
                <span className="hidden shrink-0 truncate text-[11px] text-muted-foreground sm:inline">
                  {n.client_name ?? "—"}
                </span>
                <span className="shrink-0 font-mono text-[10px] uppercase tabular-nums text-muted-foreground">
                  {formatWhen(n.when)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const diff = d.getTime() - Date.now();
  const abs = Math.abs(diff);
  const h = Math.round(abs / 3_600_000);
  const suffix = diff >= 0 ? "" : " atrás";
  const prefix = diff >= 0 ? "em " : "";
  if (h < 1) return "agora";
  if (h < 24) return `${prefix}${h}h${suffix}`;
  const days = Math.round(h / 24);
  return `${prefix}${days}d${suffix}`;
}

function MetricCard({
  icon,
  label,
  value,
  hint,
  spark,
  accent,
  trendDelta,
  footer,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  hint?: string;
  spark?: number[];
  accent?: string;
  trendDelta?: number;
  footer?: React.ReactNode;
}) {
  const trendPositive = (trendDelta ?? 0) >= 0;
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card p-4 transition hover:border-border">
      <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-40 blur-2xl"
        style={{ background: accent }} />
      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          <span className="grid h-6 w-6 place-items-center rounded-md border border-border/60 bg-background/60 text-foreground/70">
            {icon}
          </span>
          {label}
        </div>
        {typeof trendDelta === "number" && (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium tabular-nums",
              trendPositive
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
                : "border-rose-500/30 bg-rose-500/10 text-rose-500",
            )}
          >
            {trendPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {trendPositive ? "+" : ""}
            {trendDelta}%
          </span>
        )}
      </div>
      <div className="relative mt-3 flex items-end justify-between gap-3">
        <div className="text-3xl font-semibold tracking-tight text-foreground">{value}</div>
        {spark && spark.length > 0 && (
          <Sparkline data={spark} className="h-8 w-24" color={accent ?? "hsl(var(--primary))"} />
        )}
      </div>
      {hint && <div className="relative mt-1 text-[11px] text-muted-foreground">{hint}</div>}
      {footer && <div className="relative">{footer}</div>}
    </div>
  );
}

function FootStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="font-mono text-sm font-semibold tabular-nums text-foreground">{value}</div>
    </div>
  );
}

function HeatmapLegend() {
  return (
    <div className="hidden items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground sm:flex">
      Menos
      {[0.15, 0.35, 0.55, 0.75, 0.95].map((o) => (
        <span
          key={o}
          className="h-2.5 w-2.5 rounded-[3px]"
          style={{ background: `color-mix(in oklch, var(--color-primary) ${o * 100}%, transparent)` }}
        />
      ))}
      Mais
    </div>
  );
}

function deltaFromSpark(data: number[]): number {
  if (data.length < 2) return 0;
  const half = Math.floor(data.length / 2);
  const prev = data.slice(0, half).reduce((a, b) => a + b, 0) || 1;
  const curr = data.slice(half).reduce((a, b) => a + b, 0);
  return Math.round(((curr - prev) / prev) * 100);
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return "agora";
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}