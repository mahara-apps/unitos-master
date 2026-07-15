import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import {
  Home, CheckSquare, Calendar as CalIcon, Grid3x3, Folder, ClipboardList,
  Check, MessageSquareWarning, X, MessageCircle, Loader2, Download, ExternalLink,
  Image as ImageIcon, FileText, Instagram, Play, Layers, ChevronLeft, ChevronRight, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { KpiCard } from "@/components/ui/kpi-card";
import {
  resolvePortalTokenFn,
  getPortalMetricsFn,
  listPortalApprovalsFn,
  getPortalPostFn,
  decidePortalApprovalFn,
  listPortalCalendarFn,
  listPortalFeedFn,
  listPortalFilesFn,
  listPortalBriefingsFn,
} from "@/lib/portal-public.functions";

export const Route = createFileRoute("/portal/$token")({
  component: PortalRoute,
  head: () => ({
    meta: [
      { title: "Portal do cliente" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

type TabId = "home" | "approvals" | "calendar" | "feed" | "files" | "briefings";

const TABS: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "home", label: "Início", icon: Home },
  { id: "approvals", label: "Aprovações", icon: CheckSquare },
  { id: "calendar", label: "Calendário", icon: CalIcon },
  { id: "feed", label: "Feed", icon: Grid3x3 },
  { id: "files", label: "Arquivos", icon: Folder },
  { id: "briefings", label: "Briefings", icon: ClipboardList },
];

function PortalRoute() {
  const { token } = Route.useParams();
  const resolve = useServerFn(resolvePortalTokenFn);
  const q = useQuery({
    queryKey: ["portal-resolve", token],
    queryFn: () => resolve({ data: { token } }),
    retry: false,
    staleTime: 60_000,
  });

  if (q.isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (q.isError || !q.data) {
    const msg = (q.error as Error | undefined)?.message ?? "invalid_token";
    return <ExpiredView reason={msg} />;
  }
  return <PortalShell token={token} session={q.data} />;
}

function ExpiredView({ reason }: { reason: string }) {
  const label =
    reason === "token_expired"
      ? "Este link expirou."
      : reason === "token_revoked"
        ? "Este link foi revogado pela agência."
        : "Este link é inválido ou não existe.";
  return (
    <div className="grid min-h-screen place-items-center bg-background p-6">
      <div className="w-full max-w-md rounded-2xl border border-border/60 bg-card p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <X className="h-6 w-6" />
        </div>
        <h1 className="text-lg font-semibold">Acesso indisponível</h1>
        <p className="mt-2 text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 text-xs text-muted-foreground">Solicite um novo link à sua agência.</p>
      </div>
    </div>
  );
}

type Session = {
  clientId: string;
  brandId: string;
  client: { name: string; color: string | null } | null;
  brand: { name: string } | null;
};

const IDENTITY_KEY = (t: string) => `portal:${t}:identity`;

function PortalShell({ token, session }: { token: string; session: Session }) {
  const [tab, setTab] = useState<TabId>(() => {
    if (typeof window === "undefined") return "home";
    const u = new URL(window.location.href);
    return (u.searchParams.get("tab") as TabId) || "home";
  });
  const [identity, setIdentity] = useState<string>("");
  const [askIdentity, setAskIdentity] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.sessionStorage.getItem(IDENTITY_KEY(token));
    if (saved) setIdentity(saved);
  }, [token]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const u = new URL(window.location.href);
    u.searchParams.set("tab", tab);
    window.history.replaceState(null, "", u.toString());
  }, [tab]);

  function saveIdentity(name: string) {
    setIdentity(name);
    if (typeof window !== "undefined") window.sessionStorage.setItem(IDENTITY_KEY(token), name);
    setAskIdentity(false);
  }

  const brandColor = session.client?.color || "#7c3aed";
  const initials = (session.client?.name ?? "?")
    .split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

  const currentTab = TABS.find((t) => t.id === tab)!;

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside
        className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-border/60"
        style={{ background: `linear-gradient(180deg, ${brandColor}20, transparent 40%)` }}
      >
        <div className="flex items-center gap-3 px-5 py-6">
          <div
            className="flex h-11 w-11 items-center justify-center rounded-xl text-sm font-semibold text-white shadow"
            style={{ background: brandColor }}
          >
            {initials}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{session.client?.name ?? "Cliente"}</div>
            <div className="truncate font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              portal do cliente
            </div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {TABS.map((t) => {
            const active = t.id === tab;
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-foreground/5 font-medium text-foreground"
                    : "text-muted-foreground hover:bg-foreground/[0.03] hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </nav>
        <div className="border-t border-border/60 px-5 py-4">
          {identity ? (
            <button
              className="text-left text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setAskIdentity(true)}
            >
              <div className="font-medium text-foreground">{identity}</div>
              <div>trocar identificação</div>
            </button>
          ) : (
            <Button size="sm" variant="outline" className="w-full" onClick={() => setAskIdentity(true)}>
              Identificar-se
            </Button>
          )}
          <div className="mt-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            por {session.brand?.name ?? "Agência"}
          </div>
        </div>
      </aside>

      <main className="flex-1 min-w-0">
        <header className="border-b border-border/60 bg-background/80 px-8 py-6 backdrop-blur">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">{currentTab.label}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {tabSubtitle(tab, session.client?.name)}
              </p>
            </div>
          </div>
        </header>

        <div className="px-8 py-8">
          {tab === "home" && <HomeTab token={token} identity={identity} onIdentifyRequest={() => setAskIdentity(true)} onGoTo={setTab} />}
          {tab === "approvals" && <ApprovalsTab token={token} identity={identity} onIdentifyRequest={() => setAskIdentity(true)} />}
          {tab === "calendar" && <CalendarTab token={token} />}
          {tab === "feed" && <FeedTab token={token} />}
          {tab === "files" && <FilesTab token={token} />}
          {tab === "briefings" && <BriefingsTab token={token} />}
        </div>
      </main>

      <IdentityDialog open={askIdentity} initial={identity} onClose={() => setAskIdentity(false)} onSave={saveIdentity} />
    </div>
  );
}

function tabSubtitle(tab: TabId, name?: string | null): string {
  switch (tab) {
    case "home": return `Painel geral · ${name ?? "conta"}`;
    case "approvals": return "Aprove, peça ajustes ou rejeite conteúdos.";
    case "calendar": return "Cronograma editorial das próximas semanas.";
    case "feed": return "Prévia do feed com posts aprovados e publicados.";
    case "files": return "Materiais compartilhados pela agência.";
    case "briefings": return "Respostas rápidas para acelerar a produção.";
  }
}

function IdentityDialog({
  open, initial, onClose, onSave,
}: { open: boolean; initial: string; onClose: () => void; onSave: (v: string) => void }) {
  const [v, setV] = useState(initial);
  useEffect(() => setV(initial), [initial, open]);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Identifique-se</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Precisamos do seu nome para registrar as decisões que você tomar no portal.
        </p>
        <Input placeholder="Seu nome completo" value={v} onChange={(e) => setV(e.target.value)} />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => v.trim() && onSave(v.trim())} disabled={!v.trim()}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------- HOME ----------------

function HomeTab({
  token, identity, onIdentifyRequest, onGoTo,
}: { token: string; identity: string; onIdentifyRequest: () => void; onGoTo: (t: TabId) => void }) {
  const metricsFn = useServerFn(getPortalMetricsFn);
  const approvalsFn = useServerFn(listPortalApprovalsFn);
  const m = useQuery({ queryKey: ["portal-metrics", token], queryFn: () => metricsFn({ data: { token } }) });
  const pending = useQuery({
    queryKey: ["portal-approvals", token, "pending"],
    queryFn: () => approvalsFn({ data: { token, status: "pending" } }),
  });
  const [openPost, setOpenPost] = useState<string | null>(null);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard label="Aguardando aprovação" value={m.data?.pending ?? 0} tone="amber" loading={m.isLoading} />
        <KpiCard label="Aprovadas no mês" value={m.data?.approvedThisMonth ?? 0} tone="emerald" loading={m.isLoading} />
        <KpiCard label="Agendadas" value={m.data?.scheduled ?? 0} tone="sky" loading={m.isLoading} />
      </div>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">Pendentes de aprovação</h2>
          <button
            onClick={() => onGoTo("approvals")}
            className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
          >
            ver todas →
          </button>
        </div>
        {pending.isLoading ? (
          <Skeleton className="h-40 w-full rounded-xl" />
        ) : (pending.data ?? []).length === 0 ? (
          <EmptyPanel
            icon={<Check className="h-8 w-8 text-emerald-500" />}
            title="Nada pendente por enquanto"
            desc="Assim que a agência liberar um conteúdo, ele aparecerá aqui."
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {pending.data!.map((p) => (
              <PostCard key={p.id} post={p} onClick={() => setOpenPost(p.id)} />
            ))}
          </div>
        )}
      </section>

      <PostDrawer
        token={token}
        postId={openPost}
        identity={identity}
        onClose={() => setOpenPost(null)}
        onIdentifyRequest={onIdentifyRequest}
      />
    </div>
  );
}

// ---------------- APPROVALS ----------------

function ApprovalsTab({
  token, identity, onIdentifyRequest,
}: { token: string; identity: string; onIdentifyRequest: () => void }) {
  const [status, setStatus] = useState<"all" | "pending" | "approved" | "adjust">("all");
  const fn = useServerFn(listPortalApprovalsFn);
  const q = useQuery({
    queryKey: ["portal-approvals", token, status],
    queryFn: () => fn({ data: { token, status } }),
  });
  const [openPost, setOpenPost] = useState<string | null>(null);
  const filters: Array<{ id: typeof status; label: string }> = [
    { id: "all", label: "Todas" },
    { id: "pending", label: "Pendentes" },
    { id: "approved", label: "Aprovadas" },
    { id: "adjust", label: "Ajustes" },
  ];
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap gap-1.5">
          {filters.map((f) => (
            <button
              key={f.id}
              onClick={() => setStatus(f.id)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                status === f.id
                  ? "border-foreground bg-foreground text-background"
                  : "border-border/60 text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <Button size="sm" variant="ghost" onClick={() => q.refetch()}>
          <RefreshCw className="mr-1 h-3.5 w-3.5" /> Atualizar
        </Button>
      </div>
      {q.isLoading ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : (q.data ?? []).length === 0 ? (
        <EmptyPanel
          icon={<CheckSquare className="h-8 w-8 text-muted-foreground" />}
          title="Nada nesta categoria"
          desc="Volte mais tarde para acompanhar novas atualizações."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {q.data!.map((p) => (
            <PostCard key={p.id} post={p} onClick={() => setOpenPost(p.id)} status={p.approval.status} />
          ))}
        </div>
      )}
      <PostDrawer
        token={token}
        postId={openPost}
        identity={identity}
        onClose={() => setOpenPost(null)}
        onIdentifyRequest={onIdentifyRequest}
      />
    </div>
  );
}

// ---------------- CALENDAR ----------------

function CalendarTab({ token }: { token: string }) {
  const now = new Date();
  const [month, setMonth] = useState(`${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`);
  const fn = useServerFn(listPortalCalendarFn);
  const q = useQuery({
    queryKey: ["portal-calendar", token, month],
    queryFn: () => fn({ data: { token, month } }),
  });
  const monthDate = new Date(`${month}-01T00:00:00Z`);
  const monthLabel = format(monthDate, "MMMM 'de' yyyy", { locale: ptBR });
  const daysInMonth = new Date(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + 1, 0).getUTCDate();
  const firstDay = new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth(), 1)).getUTCDay();
  const cells = Array.from({ length: firstDay + daysInMonth });
  const postsByDay = new Map<number, typeof q.data>();
  (q.data ?? []).forEach((p) => {
    if (!p.scheduled_at) return;
    const d = new Date(p.scheduled_at).getUTCDate();
    const arr = postsByDay.get(d) ?? ([] as typeof q.data);
    arr!.push(p);
    postsByDay.set(d, arr);
  });
  function shift(delta: number) {
    const m = new Date(`${month}-01T00:00:00Z`);
    m.setUTCMonth(m.getUTCMonth() + delta);
    setMonth(`${m.getUTCFullYear()}-${String(m.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => shift(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-sm font-semibold capitalize">{monthLabel}</div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => shift(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          {(q.data ?? []).length} publicações
        </div>
      </div>
      <div className="rounded-xl border border-border/60 bg-card p-3">
        <div className="grid grid-cols-7 gap-1 pb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
            <div key={d} className="px-2">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((_, idx) => {
            const day = idx - firstDay + 1;
            if (day < 1) return <div key={idx} className="h-24" />;
            const items = postsByDay.get(day) ?? [];
            return (
              <div key={idx} className="h-24 rounded-md border border-border/40 bg-background/40 p-1.5">
                <div className="mb-1 text-[11px] font-medium text-muted-foreground">{day}</div>
                <div className="space-y-0.5">
                  {items.slice(0, 2).map((it) => (
                    <div
                      key={it.id}
                      className="truncate rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-foreground"
                      title={it.title ?? ""}
                    >
                      {it.title ?? "post"}
                    </div>
                  ))}
                  {items.length > 2 && (
                    <div className="px-1.5 text-[10px] text-muted-foreground">+{items.length - 2}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------- FEED ----------------

function FeedTab({ token }: { token: string }) {
  const fn = useServerFn(listPortalFeedFn);
  const q = useQuery({ queryKey: ["portal-feed", token], queryFn: () => fn({ data: { token } }) });
  if (q.isLoading) return <Skeleton className="h-96 w-full rounded-xl" />;
  if (!q.data || q.data.length === 0) {
    return (
      <EmptyPanel
        icon={<Instagram className="h-8 w-8 text-muted-foreground" />}
        title="Aguardando publicações"
        desc="As primeiras peças aprovadas aparecerão aqui como prévia do feed."
      />
    );
  }
  return (
    <div className="grid grid-cols-3 gap-1 rounded-xl border border-border/60 bg-card p-1">
      {q.data.map((p) => (
        <div key={p.id} className="relative aspect-square overflow-hidden bg-muted">
          {p.cover_url ? (
            <img src={p.cover_url} alt={p.title ?? ""} className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full place-items-center text-muted-foreground">
              <ImageIcon className="h-6 w-6" />
            </div>
          )}
          {p.format && (
            <div className="absolute right-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[9px] uppercase text-white">
              {p.format === "reel" ? <Play className="h-3 w-3" /> : p.format === "carousel" ? <Layers className="h-3 w-3" /> : p.format}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------- FILES ----------------

function FilesTab({ token }: { token: string }) {
  const [search, setSearch] = useState("");
  const fn = useServerFn(listPortalFilesFn);
  const q = useQuery({
    queryKey: ["portal-files", token, search],
    queryFn: () => fn({ data: { token, search } }),
  });
  return (
    <div className="space-y-4">
      <Input
        placeholder="Buscar arquivos…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="h-9 max-w-md"
      />
      {q.isLoading ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : !q.data || q.data.length === 0 ? (
        <EmptyPanel
          icon={<Folder className="h-8 w-8 text-muted-foreground" />}
          title="Nenhum arquivo compartilhado"
          desc="Quando a agência publicar materiais nesta conta, você poderá baixá-los aqui."
        />
      ) : (
        <div className="divide-y divide-border/60 rounded-xl border border-border/60 bg-card">
          {q.data.map((d) => (
            <div key={d.id} className="flex items-center gap-3 px-4 py-3">
              <div className="grid h-9 w-9 place-items-center rounded-md bg-muted text-muted-foreground">
                <FileText className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{d.name}</div>
                <div className="truncate font-mono text-[10px] text-muted-foreground">
                  {d.mime_type ?? "arquivo"} · {formatSize(d.size_bytes)}
                </div>
              </div>
              {d.url && (
                <a href={d.url} target="_blank" rel="noreferrer">
                  <Button size="sm" variant="outline">
                    <Download className="mr-1.5 h-3.5 w-3.5" /> Baixar
                  </Button>
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatSize(bytes: number | null | undefined) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------------- BRIEFINGS ----------------

function BriefingsTab({ token }: { token: string }) {
  const fn = useServerFn(listPortalBriefingsFn);
  const q = useQuery({ queryKey: ["portal-briefings", token], queryFn: () => fn({ data: { token } }) });
  if (q.isLoading) return <Skeleton className="h-40 w-full rounded-xl" />;
  if (!q.data || q.data.length === 0) {
    return (
      <EmptyPanel
        icon={<ClipboardList className="h-8 w-8 text-muted-foreground" />}
        title="Nenhum briefing pendente"
        desc="Quando a agência enviar um briefing, ele aparecerá aqui para você responder."
      />
    );
  }
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {q.data.map((b) => {
        const submitted = !!b.submitted_at;
        const revoked = !!b.revoked_at;
        const expired = b.expires_at ? new Date(b.expires_at).getTime() < Date.now() : false;
        const status = revoked ? "revogado" : expired ? "expirado" : submitted ? "respondido" : "pendente";
        const tone =
          status === "pendente" ? "text-amber-500" : status === "respondido" ? "text-emerald-500" : "text-muted-foreground";
        return (
          <div key={b.id} className="rounded-xl border border-border/60 bg-card p-5">
            <div className="mb-2 flex items-center justify-between">
              <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">briefing</div>
              <div className={`font-mono text-[10px] uppercase tracking-widest ${tone}`}>{status}</div>
            </div>
            <div className="text-sm font-semibold">{b.label ?? "Briefing sem título"}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              Criado em {format(parseISO(b.created_at), "dd/MM/yyyy", { locale: ptBR })}
            </div>
            {!submitted && !revoked && !expired && (
              <a href={`/p/briefing/${b.token}`} target="_blank" rel="noreferrer" className="mt-3 inline-block">
                <Button size="sm">
                  <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Responder briefing
                </Button>
              </a>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------- SHARED ----------------

function EmptyPanel({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="grid place-items-center rounded-2xl border border-dashed border-border/60 bg-card px-6 py-16 text-center">
      <div className="mb-3 grid h-14 w-14 place-items-center rounded-full bg-muted">{icon}</div>
      <div className="text-base font-semibold">{title}</div>
      <div className="mt-1 max-w-sm text-sm text-muted-foreground">{desc}</div>
    </div>
  );
}

type PostLite = {
  id: string; title: string | null; format: string | null;
  channels: string[] | null; scheduled_at: string | null;
  cover_url: string | null;
};

function PostCard({
  post, onClick, status,
}: { post: PostLite; onClick: () => void; status?: "pending" | "approved" | "rejected" | "adjust" }) {
  const toneMap = {
    pending: "border-amber-500/40",
    approved: "border-emerald-500/40",
    rejected: "border-rose-500/40",
    adjust: "border-sky-500/40",
  } as const;
  const labelMap = {
    pending: "Aguardando",
    approved: "Aprovada",
    rejected: "Rejeitada",
    adjust: "Ajustes",
  } as const;
  return (
    <button
      onClick={onClick}
      className={`group flex flex-col overflow-hidden rounded-xl border bg-card text-left transition-colors hover:border-foreground/40 ${
        status ? toneMap[status] : "border-border/60"
      }`}
    >
      <div className="relative aspect-[4/5] w-full bg-muted">
        {post.cover_url ? (
          <img src={post.cover_url} alt={post.title ?? ""} className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full place-items-center text-muted-foreground">
            <ImageIcon className="h-8 w-8" />
          </div>
        )}
        {status && (
          <div className="absolute right-2 top-2 rounded-full bg-background/90 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest">
            {labelMap[status]}
          </div>
        )}
      </div>
      <div className="space-y-1 p-3">
        <div className="line-clamp-1 text-sm font-semibold">{post.title ?? "Sem título"}</div>
        <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          <span>{post.format ?? "post"}</span>
          <span>
            {post.scheduled_at ? format(parseISO(post.scheduled_at), "dd/MM · HH'h'mm", { locale: ptBR }) : "sem data"}
          </span>
        </div>
      </div>
    </button>
  );
}

function PostDrawer({
  token, postId, identity, onClose, onIdentifyRequest,
}: {
  token: string; postId: string | null; identity: string;
  onClose: () => void; onIdentifyRequest: () => void;
}) {
  const qc = useQueryClient();
  const fn = useServerFn(getPortalPostFn);
  const decide = useServerFn(decidePortalApprovalFn);
  const q = useQuery({
    queryKey: ["portal-post", token, postId],
    queryFn: () => fn({ data: { token, postId: postId! } }),
    enabled: !!postId,
  });
  const [note, setNote] = useState("");
  const [action, setAction] = useState<null | "adjust" | "rejected" | "comment">(null);
  useEffect(() => {
    if (!postId) { setNote(""); setAction(null); }
  }, [postId]);

  const mut = useMutation({
    mutationFn: (decision: "approved" | "rejected" | "adjust" | "comment") =>
      decide({ data: { token, postId: postId!, decision, note: note || undefined, identity } }),
    onSuccess: (_d, decision) => {
      const labels = { approved: "Aprovado", rejected: "Rejeitado", adjust: "Ajustes enviados", comment: "Comentário enviado" };
      toast.success(labels[decision]);
      qc.invalidateQueries({ queryKey: ["portal-metrics", token] });
      qc.invalidateQueries({ queryKey: ["portal-approvals", token] });
      qc.invalidateQueries({ queryKey: ["portal-post", token, postId] });
      setNote(""); setAction(null);
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function runDecision(decision: "approved" | "rejected" | "adjust" | "comment") {
    if (!identity.trim()) {
      onIdentifyRequest();
      return;
    }
    if (decision !== "approved" && !action) { setAction(decision); return; }
    mut.mutate(decision);
  }

  const post = q.data?.post;
  const media = q.data?.media ?? [];

  return (
    <Sheet open={!!postId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader className="mb-4">
          <SheetTitle>{post?.title ?? "Conteúdo"}</SheetTitle>
        </SheetHeader>
        {q.isLoading ? (
          <Skeleton className="h-72 w-full" />
        ) : !post ? (
          <div className="text-sm text-muted-foreground">Não foi possível carregar este conteúdo.</div>
        ) : (
          <div className="space-y-5">
            <div className="grid gap-2">
              {media.length > 0 ? (
                media.map((m, i) => (
                  <img key={i} src={m.url} alt="" className="w-full rounded-lg border border-border/60 object-contain" />
                ))
              ) : post.cover_url ? (
                <img src={post.cover_url as string} alt="" className="w-full rounded-lg border border-border/60" />
              ) : (
                <div className="grid aspect-[4/5] w-full place-items-center rounded-lg border border-dashed border-border/60 bg-muted text-muted-foreground">
                  <ImageIcon className="h-10 w-10" />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 rounded-lg border border-border/60 bg-card p-3 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              <div><span className="text-foreground">{post.format ?? "post"}</span><div>formato</div></div>
              <div>
                <span className="text-foreground">
                  {post.scheduled_at ? format(parseISO(post.scheduled_at as string), "dd/MM · HH'h'mm", { locale: ptBR }) : "sem data"}
                </span>
                <div>agendado</div>
              </div>
            </div>

            {post.copy && (
              <div>
                <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">legenda</div>
                <div className="whitespace-pre-line rounded-lg border border-border/60 bg-card p-4 text-sm leading-relaxed">
                  {post.copy}
                </div>
              </div>
            )}

            {action && (
              <div>
                <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {action === "adjust" ? "descreva os ajustes" : action === "rejected" ? "motivo da rejeição" : "seu comentário"}
                </div>
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Escreva aqui…"
                  className="min-h-[100px]"
                />
              </div>
            )}

            <div className="sticky bottom-0 -mx-6 -mb-6 grid grid-cols-2 gap-2 border-t border-border/60 bg-background/95 p-4 backdrop-blur sm:grid-cols-4">
              <Button
                onClick={() => runDecision("approved")}
                disabled={mut.isPending}
                className="bg-emerald-600 text-white hover:bg-emerald-500"
              >
                <Check className="mr-1.5 h-4 w-4" /> Aprovar
              </Button>
              <Button variant="outline" onClick={() => runDecision("adjust")} disabled={mut.isPending}>
                <MessageSquareWarning className="mr-1.5 h-4 w-4" /> Ajustes
              </Button>
              <Button variant="outline" onClick={() => runDecision("rejected")} disabled={mut.isPending}>
                <X className="mr-1.5 h-4 w-4" /> Rejeitar
              </Button>
              <Button variant="outline" onClick={() => runDecision("comment")} disabled={mut.isPending}>
                <MessageCircle className="mr-1.5 h-4 w-4" /> Comentar
              </Button>
            </div>
            {action && (
              <p className="text-center text-xs text-muted-foreground">
                Confirme clicando novamente em <strong>{action === "adjust" ? "Ajustes" : action === "rejected" ? "Rejeitar" : "Comentar"}</strong>.
              </p>
            )}
            {!identity && (
              <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2 text-center text-xs text-amber-600">
                Identifique-se antes de decidir. <button className="underline" onClick={onIdentifyRequest}>Adicionar meu nome</button>
              </p>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
