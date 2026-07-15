import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Home, CheckSquare, CalendarDays, Images, FolderOpen, FileText,
  Check, X, MessageSquareWarning, MessageCircle, ExternalLink,
  Download, Search, Clock, Loader2, ChevronLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
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
  component: PortalShell,
  head: () => ({
    meta: [
      { title: "Portal do cliente" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

type TabId = "home" | "approvals" | "calendar" | "feed" | "files" | "briefing";
const TABS: Array<{ id: TabId; label: string; icon: typeof Home }> = [
  { id: "home", label: "Início", icon: Home },
  { id: "approvals", label: "Aprovações", icon: CheckSquare },
  { id: "calendar", label: "Calendário", icon: CalendarDays },
  { id: "feed", label: "Feed", icon: Images },
  { id: "files", label: "Arquivos", icon: FolderOpen },
  { id: "briefing", label: "Briefing", icon: FileText },
];

function useIdentity(clientId: string | null) {
  const key = clientId ? `portal.identity.${clientId}` : null;
  const [value, setValue] = useState("");
  useEffect(() => {
    if (!key) return;
    setValue(localStorage.getItem(key) ?? "");
  }, [key]);
  const save = (v: string) => {
    setValue(v);
    if (key) localStorage.setItem(key, v);
  };
  return { value, save };
}

function PortalShell() {
  const { token } = Route.useParams();
  const resolve = useServerFn(resolvePortalTokenFn);
  const sessionQ = useQuery({
    queryKey: ["portal", "session", token],
    queryFn: () => resolve({ data: { token } }),
    retry: false,
    staleTime: 5 * 60_000,
  });
  const [tab, setTab] = useState<TabId>("home");
  const identity = useIdentity(sessionQ.data?.clientId ?? null);

  if (sessionQ.isLoading) return <FullScreenLoader />;
  if (sessionQ.error || !sessionQ.data?.client) return <TokenError message={(sessionQ.error as Error)?.message} />;

  const client = sessionQ.data.client;
  const brand = sessionQ.data.brand;
  const accent = client.color || "#6366F1";
  const initials = (client.name || "?")
    .split(" ")
    .map((w: string) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="min-h-screen bg-background text-foreground" style={{ ["--portal-accent" as string]: accent }}>
      <div className="flex min-h-screen">
        {/* White-label sidebar */}
        <aside className="hidden w-64 shrink-0 flex-col border-r border-border/60 bg-card lg:flex">
          <div className="flex items-center gap-3 border-b border-border/60 px-5 py-5">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl text-sm font-semibold text-white shadow-sm"
              style={{ background: `linear-gradient(135deg, ${accent}, ${accent}cc)` }}
            >
              {initials}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold tracking-tight">{client.name}</div>
              <div className="truncate font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Portal do cliente
              </div>
            </div>
          </div>
          <nav className="flex-1 space-y-0.5 px-3 py-4">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                    active
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                  }`}
                >
                  <Icon className={`h-4 w-4 ${active ? "" : "text-muted-foreground/70"}`} />
                  <span className="truncate">{t.label}</span>
                </button>
              );
            })}
          </nav>
          <div className="border-t border-border/60 px-5 py-4 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            {brand?.name ? `por ${brand.name}` : "portal white-label"}
          </div>
        </aside>

        {/* Content */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Mobile top nav */}
          <div className="flex items-center gap-1 overflow-x-auto border-b border-border/60 bg-card px-3 py-2 lg:hidden">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs transition-colors ${
                    active ? "bg-accent text-accent-foreground" : "text-muted-foreground"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" /> {t.label}
                </button>
              );
            })}
          </div>

          {/* Header */}
          <header className="flex flex-col gap-3 border-b border-border/60 bg-background px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">{TABS.find((t) => t.id === tab)?.label}</h1>
              <p className="text-xs text-muted-foreground">Área privada de {client.name}. Todas as ações ficam registradas.</p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                value={identity.value}
                onChange={(e) => identity.save(e.target.value)}
                placeholder="Seu nome (para registrar decisões)"
                className="h-9 w-64"
              />
            </div>
          </header>

          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
            {tab === "home" && <HomeTab token={token} setTab={setTab} />}
            {tab === "approvals" && <ApprovalsTab token={token} identity={identity.value} />}
            {tab === "calendar" && <CalendarTab token={token} />}
            {tab === "feed" && <FeedTab token={token} />}
            {tab === "files" && <FilesTab token={token} />}
            {tab === "briefing" && <BriefingTab token={token} />}
          </main>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------- HOME ---------------------------------- */

function HomeTab({ token, setTab }: { token: string; setTab: (t: TabId) => void }) {
  const fn = useServerFn(getPortalMetricsFn);
  const q = useQuery({
    queryKey: ["portal", "metrics", token],
    queryFn: () => fn({ data: { token } }),
    staleTime: 30_000,
  });
  const m = q.data;
  const cards = [
    { label: "Aguardando você", value: m?.pending ?? 0, tone: "amber", tab: "approvals" as TabId },
    { label: "Aprovados no mês", value: m?.approvedThisMonth ?? 0, tone: "emerald", tab: "feed" as TabId },
    { label: "Agendados", value: m?.scheduled ?? 0, tone: "sky", tab: "calendar" as TabId },
    { label: "Total de posts", value: m?.total ?? 0, tone: "neutral", tab: "feed" as TabId },
  ];
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <button
            key={c.label}
            onClick={() => setTab(c.tab)}
            className="group rounded-xl border border-border/60 bg-card p-4 text-left transition-colors hover:border-border"
          >
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{c.label}</div>
            <div className="mt-3 flex items-end justify-between">
              <div className="text-3xl font-semibold tabular-nums tracking-tight">{q.isLoading ? "—" : c.value}</div>
              <div className={`h-2 w-2 rounded-full bg-${c.tone}-500`} />
            </div>
          </button>
        ))}
      </div>
      <div className="rounded-xl border border-border/60 bg-card p-6">
        <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">bem-vindo</div>
        <h2 className="mt-2 text-lg font-semibold">Tudo o que sua marca está publicando, em um só lugar.</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Use as abas ao lado para <b>aprovar posts</b>, ver o <b>calendário</b> do mês, explorar o <b>feed</b> planejado,
          acessar <b>arquivos</b> compartilhados e <b>preencher briefings</b> quando solicitado pela equipe.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setTab("approvals")}>Revisar aprovações</Button>
          <Button size="sm" variant="outline" onClick={() => setTab("calendar")}>Ver calendário</Button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------- APPROVALS ------------------------------- */

function ApprovalsTab({ token, identity }: { token: string; identity: string }) {
  const list = useServerFn(listPortalApprovalsFn);
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "adjust">("pending");
  const [openId, setOpenId] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["portal", "approvals", token, filter],
    queryFn: () => list({ data: { token, status: filter } }),
  });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 rounded-lg border border-border/60 bg-card p-1">
        {(["pending", "all", "approved", "adjust"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-md px-3 py-1.5 text-xs transition-colors ${
              filter === f ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {f === "pending" ? "Pendentes" : f === "all" ? "Todos" : f === "approved" ? "Aprovados" : "Ajustes"}
          </button>
        ))}
      </div>
      {q.isLoading ? (
        <GridSkeleton />
      ) : !q.data?.length ? (
        <EmptyState icon={CheckSquare} title="Nada por aqui" description="Nenhum post neste filtro." />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {q.data.map((p) => (
            <ApprovalCard key={p.id as string} post={p} onOpen={() => setOpenId(p.id as string)} />
          ))}
        </div>
      )}
      {openId && (
        <ApprovalDialog
          token={token}
          postId={openId}
          identity={identity}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
}

function ApprovalCard({ post, onOpen }: { post: Record<string, unknown>; onOpen: () => void }) {
  const status = ((post.approval as { status: string } | undefined)?.status ?? "pending") as
    | "pending" | "approved" | "rejected" | "adjust";
  const tone: Record<typeof status, string> = {
    pending: "border-amber-500/40 text-amber-500",
    approved: "border-emerald-500/40 text-emerald-500",
    rejected: "border-rose-500/40 text-rose-500",
    adjust: "border-sky-500/40 text-sky-500",
  };
  const label = { pending: "Aguardando", approved: "Aprovado", rejected: "Rejeitado", adjust: "Ajustes" }[status];
  return (
    <button
      onClick={onOpen}
      className="group overflow-hidden rounded-xl border border-border/60 bg-card text-left transition-colors hover:border-border"
    >
      <div className="relative aspect-[4/5] w-full overflow-hidden bg-muted">
        {post.cover_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.cover_url as string}
            alt=""
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
            sem preview
          </div>
        )}
        <Badge variant="outline" className={`absolute left-2 top-2 border bg-background/80 backdrop-blur ${tone[status]}`}>
          {label}
        </Badge>
      </div>
      <div className="space-y-1 p-3">
        <div className="truncate text-sm font-medium">{(post.title as string) || "Sem título"}</div>
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          <span>{(post.format as string) || "—"}</span>
          {post.scheduled_at && <><span>·</span><span>{formatDate(post.scheduled_at as string)}</span></>}
        </div>
      </div>
    </button>
  );
}

function ApprovalDialog({
  token, postId, identity, onClose,
}: { token: string; postId: string; identity: string; onClose: () => void }) {
  const qc = useQueryClient();
  const getPost = useServerFn(getPortalPostFn);
  const decide = useServerFn(decidePortalApprovalFn);
  const q = useQuery({
    queryKey: ["portal", "post", token, postId],
    queryFn: () => getPost({ data: { token, postId } }),
  });
  const [note, setNote] = useState("");
  const [mode, setMode] = useState<null | "reject" | "adjust" | "comment">(null);
  const m = useMutation({
    mutationFn: (payload: { decision: "approved" | "rejected" | "adjust" | "comment"; note?: string }) =>
      decide({ data: { token, postId, identity, ...payload } }),
    onSuccess: (_r, vars) => {
      toast.success(
        vars.decision === "approved" ? "Post aprovado" :
        vars.decision === "rejected" ? "Post rejeitado" :
        vars.decision === "adjust" ? "Ajustes solicitados" : "Comentário enviado",
      );
      qc.invalidateQueries({ queryKey: ["portal", "approvals", token] });
      qc.invalidateQueries({ queryKey: ["portal", "metrics", token] });
      qc.invalidateQueries({ queryKey: ["portal", "post", token, postId] });
      setNote(""); setMode(null);
      if (vars.decision !== "comment") onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const disabled = !identity.trim();

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl overflow-hidden p-0">
        <div className="grid grid-cols-1 md:grid-cols-[1.15fr_1fr]">
          <div className="relative aspect-[4/5] bg-muted md:aspect-auto">
            {q.data?.post?.cover_url ? (
              <img src={q.data.post.cover_url as string} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">sem preview</div>
            )}
          </div>
          <div className="flex max-h-[85vh] flex-col">
            <DialogHeader className="border-b border-border/60 px-5 py-4">
              <DialogTitle className="truncate">{q.data?.post?.title ?? "Post"}</DialogTitle>
              <div className="mt-1 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                <span>{(q.data?.post?.format as string) || "—"}</span>
                {q.data?.post?.scheduled_at && (
                  <><span>·</span><span>{formatDate(q.data.post.scheduled_at as string)}</span></>
                )}
              </div>
            </DialogHeader>
            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 text-sm">
              {q.isLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : (
                <>
                  <div>
                    <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">legenda</div>
                    <div className="whitespace-pre-line rounded-md border border-border/60 bg-muted/40 p-3">
                      {(q.data?.post?.copy as string) || "—"}
                    </div>
                  </div>
                  {mode && (
                    <div className="space-y-1">
                      <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                        {mode === "reject" ? "motivo da rejeição" : mode === "adjust" ? "descreva o ajuste" : "seu comentário"}
                      </div>
                      <Textarea value={note} onChange={(e) => setNote(e.target.value)} className="min-h-[100px]" />
                    </div>
                  )}
                </>
              )}
            </div>
            <DialogFooter className="flex-col gap-2 border-t border-border/60 bg-card/60 px-5 py-4 sm:flex-row">
              {disabled && (
                <span className="w-full text-center text-[11px] text-amber-500 sm:text-left">
                  Preencha seu nome no topo para decidir.
                </span>
              )}
              {mode ? (
                <div className="flex w-full gap-2">
                  <Button variant="ghost" className="flex-1" onClick={() => { setMode(null); setNote(""); }}>
                    Cancelar
                  </Button>
                  <Button
                    className="flex-1"
                    disabled={disabled || m.isPending}
                    onClick={() =>
                      m.mutate({
                        decision: mode === "reject" ? "rejected" : mode,
                        note: note.trim() || undefined,
                      })
                    }
                  >
                    {m.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enviar"}
                  </Button>
                </div>
              ) : (
                <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4">
                  <Button size="sm" disabled={disabled || m.isPending} onClick={() => m.mutate({ decision: "approved" })}>
                    <Check className="mr-1 h-4 w-4" /> Aprovar
                  </Button>
                  <Button size="sm" variant="outline" disabled={disabled} onClick={() => setMode("adjust")}>
                    <MessageSquareWarning className="mr-1 h-4 w-4" /> Ajustes
                  </Button>
                  <Button size="sm" variant="outline" disabled={disabled} onClick={() => setMode("reject")}>
                    <X className="mr-1 h-4 w-4" /> Rejeitar
                  </Button>
                  <Button size="sm" variant="ghost" disabled={disabled} onClick={() => setMode("comment")}>
                    <MessageCircle className="mr-1 h-4 w-4" /> Comentar
                  </Button>
                </div>
              )}
            </DialogFooter>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------- CALENDAR -------------------------------- */

function CalendarTab({ token }: { token: string }) {
  const [ym, setYm] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const fn = useServerFn(listPortalCalendarFn);
  const q = useQuery({
    queryKey: ["portal", "calendar", token, ym],
    queryFn: () => fn({ data: { token, month: ym } }),
  });
  const days = useMemo(() => buildMonthGrid(ym), [ym]);
  const byDay = useMemo(() => {
    const map = new Map<string, Array<Record<string, unknown>>>();
    for (const p of q.data ?? []) {
      if (!p.scheduled_at) continue;
      const k = (p.scheduled_at as string).slice(0, 10);
      const arr = map.get(k) ?? [];
      arr.push(p as Record<string, unknown>);
      map.set(k, arr);
    }
    return map;
  }, [q.data]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setYm(shiftYm(ym, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="rounded-md border border-border/60 bg-card px-3 py-1.5 text-sm font-medium capitalize">
            {formatMonth(ym)}
          </div>
          <Button size="icon" variant="outline" className="h-8 w-8 rotate-180" onClick={() => setYm(shiftYm(ym, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border border-border/60 bg-card">
        <div className="grid grid-cols-7 border-b border-border/60 bg-muted/40">
          {["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"].map((d) => (
            <div key={d} className="px-2 py-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d, i) => {
            const key = d?.toISOString().slice(0, 10);
            const items = key ? byDay.get(key) ?? [] : [];
            return (
              <div
                key={i}
                className={`min-h-[92px] border-b border-r border-border/60 p-2 text-xs ${d ? "" : "bg-muted/20"}`}
              >
                {d && (
                  <>
                    <div className="mb-1 text-[11px] font-medium text-muted-foreground">{d.getDate()}</div>
                    <div className="space-y-1">
                      {items.slice(0, 3).map((p) => (
                        <div
                          key={p.id as string}
                          className="truncate rounded border border-border/60 bg-background px-1.5 py-1 text-[10px]"
                          title={p.title as string}
                        >
                          {(p.title as string) || "Post"}
                        </div>
                      ))}
                      {items.length > 3 && (
                        <div className="text-[10px] text-muted-foreground">+{items.length - 3}</div>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {q.isLoading && <Skeleton className="h-4 w-32" />}
    </div>
  );
}

/* ---------------------------------- FEED ---------------------------------- */

function FeedTab({ token }: { token: string }) {
  const fn = useServerFn(listPortalFeedFn);
  const q = useQuery({ queryKey: ["portal", "feed", token], queryFn: () => fn({ data: { token } }) });
  if (q.isLoading) return <GridSkeleton />;
  if (!q.data?.length) return <EmptyState icon={Images} title="Feed vazio" description="Nenhum post aprovado ou publicado ainda." />;
  return (
    <div className="grid grid-cols-3 gap-1 sm:gap-2">
      {q.data.map((p) => (
        <div key={p.id as string} className="relative aspect-square overflow-hidden bg-muted">
          {p.cover_url ? (
            <img src={p.cover_url as string} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">sem preview</div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------- FILES --------------------------------- */

function FilesTab({ token }: { token: string }) {
  const [search, setSearch] = useState("");
  const fn = useServerFn(listPortalFilesFn);
  const q = useQuery({
    queryKey: ["portal", "files", token, search],
    queryFn: () => fn({ data: { token, search } }),
  });
  return (
    <div className="space-y-4">
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar arquivos" className="h-9 pl-9" />
      </div>
      {q.isLoading ? (
        <ListSkeleton />
      ) : !q.data?.length ? (
        <EmptyState icon={FolderOpen} title="Sem arquivos" description="A equipe ainda não compartilhou documentos." />
      ) : (
        <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60 bg-card">
          {q.data.map((f) => (
            <div key={f.id as string} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{f.name}</div>
                <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  <span>{formatBytes(f.size_bytes as number | null)}</span>
                  <Clock className="h-3 w-3" />
                  <span>{formatDate(f.created_at as string)}</span>
                </div>
              </div>
              {f.url && (
                <a href={f.url as string} target="_blank" rel="noreferrer">
                  <Button size="sm" variant="outline" className="gap-1.5">
                    <Download className="h-3.5 w-3.5" /> Baixar
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

/* -------------------------------- BRIEFING -------------------------------- */

function BriefingTab({ token }: { token: string }) {
  const fn = useServerFn(listPortalBriefingsFn);
  const q = useQuery({ queryKey: ["portal", "briefings", token], queryFn: () => fn({ data: { token } }) });
  if (q.isLoading) return <ListSkeleton />;
  if (!q.data?.length) return <EmptyState icon={FileText} title="Sem briefings ativos" description="A equipe irá compartilhar aqui quando precisar de novas respostas." />;
  return (
    <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60 bg-card">
      {q.data.map((b) => {
        const revoked = !!b.revoked_at;
        const submitted = !!b.submitted_at;
        const expired = b.expires_at && new Date(b.expires_at).getTime() < Date.now();
        const state = revoked ? "revogado" : submitted ? "respondido" : expired ? "expirado" : "aberto";
        const stateTone =
          state === "aberto" ? "text-emerald-500" :
          state === "respondido" ? "text-sky-500" :
          state === "expirado" ? "text-amber-500" : "text-muted-foreground";
        return (
          <div key={b.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{b.label ?? "Briefing"}</div>
              <div className={`font-mono text-[10px] uppercase tracking-widest ${stateTone}`}>{state}</div>
            </div>
            {state === "aberto" && (
              <a href={`/p/briefing/${b.token}`} target="_blank" rel="noreferrer">
                <Button size="sm" variant="outline" className="gap-1.5">
                  Abrir <ExternalLink className="h-3.5 w-3.5" />
                </Button>
              </a>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* --------------------------------- UTILS --------------------------------- */

function FullScreenLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}
function TokenError({ message }: { message?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="max-w-md rounded-xl border border-border/60 bg-card p-6 text-center">
        <h1 className="text-lg font-semibold">Link indisponível</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {message === "token_expired" ? "Este link expirou." :
           message === "token_revoked" ? "Este link foi revogado." :
           "Este link não é válido. Peça um novo para sua equipe."}
        </p>
      </div>
    </div>
  );
}
function EmptyState({ icon: Icon, title, description }: { icon: typeof Home; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/60 bg-card px-6 py-16 text-center">
      <Icon className="h-6 w-6 text-muted-foreground" />
      <div className="text-sm font-medium">{title}</div>
      <div className="text-xs text-muted-foreground">{description}</div>
    </div>
  );
}
function GridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="aspect-[4/5] w-full" />)}
    </div>
  );
}
function ListSkeleton() {
  return <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>;
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}
function formatMonth(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}
function shiftYm(ym: string, delta: number) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function buildMonthGrid(ym: string): Array<Date | null> {
  const [y, m] = ym.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const last = new Date(y, m, 0);
  const cells: Array<Date | null> = [];
  for (let i = 0; i < first.getDay(); i++) cells.push(null);
  for (let d = 1; d <= last.getDate(); d++) cells.push(new Date(y, m - 1, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}
function formatBytes(n: number | null) {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

const SLIDES = [
  { title: "3 erros de LGPD", sub: "que podem custar caro", tone: "from-emerald-900 via-emerald-950 to-black" },
  { title: "Erro #1", sub: "Prontuários em pastas compartilhadas", tone: "from-teal-900 via-emerald-950 to-black" },
  { title: "Erro #2", sub: "Consentimento genérico e mal registrado", tone: "from-emerald-800 via-emerald-950 to-black" },
];

const CAPTION =
  "A maioria das clínicas ainda armazena prontuários em pastas compartilhadas — e isso já rendeu autuações de R$ 50k+ em 2025.\n\nNo carrossel: os 3 erros mais comuns, o que a ANPD fiscaliza primeiro e o checklist gratuito que a nossa equipe montou.\n\nSalve esse post — você vai precisar dele antes da próxima auditoria.";

const HISTORY = [
  { who: "Marina (Copy)", role: "copywriter", when: "há 2h", action: "criou a versão v1 da legenda" },
  { who: "Rafa (Design)", role: "designer", when: "há 1h", action: "atualizou a arte do slide 1 (nova hierarquia)" },
  { who: "Você", role: "cliente", when: "há 12min", action: "abriu o post para revisão" },
];

function PortalPage() {
  const [identity, setIdentity] = useState("");
  const [modal, setModal] = useState<null | "reject" | "comment">(null);
  const [drawer, setDrawer] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [info, setInfo] = useState(false);
  const [status, setStatus] = useState<"pending" | "approved" | "rejected" | "adjust">("pending");
  const [note, setNote] = useState("");
  const [selected, setSelected] = useState<string>("");
  const [slide, setSlide] = useState(0);
  const s = SLIDES[slide];
  const disabled = !identity.trim();

  return (
    <div className="min-h-screen bg-zinc-950 text-foreground">
      {/* White-label header */}
      <header className="border-b border-white/10 bg-neutral-950/60 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-gradient-to-br from-emerald-500/30 to-teal-500/10 text-emerald-300">
              <span className="text-sm font-bold">V</span>
            </div>
            <div>
              <div className="text-sm font-semibold tracking-tight">Vitta Saúde</div>
              <div className="font-mono text-[10px] text-muted-foreground">portal de aprovação</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 sm:flex">
              <User2 className="h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={identity}
                onChange={(e) => setIdentity(e.target.value)}
                placeholder="Identifique-se para decidir"
                className="h-8 w-64 border-white/10 bg-white/[0.02] text-xs focus-visible:ring-emerald-500/40"
              />
            </div>
            <Badge variant="outline" className="border-white/10 bg-white/[0.02] font-mono text-[10px] text-muted-foreground">
              link único · 7 dias
            </Badge>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-6 py-8 lg:grid-cols-[1fr_320px]">
        {/* Media viewer */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">post 04 · semana 28</div>
              <h1 className="mt-1 text-xl font-semibold tracking-tight">Revise antes da publicação</h1>
            </div>
            <button
              onClick={() => setInfo(!info)}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.02] px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground transition-colors duration-200 hover:border-white/20 hover:text-foreground"
            >
              <Info className="h-3 w-3" /> {info ? "esconder" : "info"}
            </button>
          </div>

          <div className="overflow-hidden rounded-2xl border border-white/10 bg-neutral-950/60">
            {/* Lightbox-style stage */}
            <div className="relative aspect-[4/5] w-full">
              <div className={`absolute inset-0 bg-gradient-to-br ${s.tone}`} />
              <div className="absolute inset-0 flex flex-col justify-between p-10">
                <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-emerald-300/70">Vitta · educativo</div>
                <div>
                  <div className="text-4xl font-bold leading-[1.05] text-emerald-50">{s.title}</div>
                  <div className="mt-3 text-base text-emerald-100/70">{s.sub}</div>
                </div>
              </div>

              {/* Carousel controls */}
              <button
                onClick={() => setSlide((slide - 1 + SLIDES.length) % SLIDES.length)}
                className="absolute left-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/50 text-white/80 backdrop-blur transition-colors duration-200 hover:bg-black/70 hover:text-white"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => setSlide((slide + 1) % SLIDES.length)}
                className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/50 text-white/80 backdrop-blur transition-colors duration-200 hover:bg-black/70 hover:text-white"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <button
                onClick={() => setZoom(true)}
                className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-black/50 text-white/80 backdrop-blur transition-colors duration-200 hover:bg-black/70 hover:text-white"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </button>

              {/* Dots */}
              <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-1.5">
                {SLIDES.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setSlide(i)}
                    className={`h-1.5 rounded-full transition-all duration-200 ${
                      i === slide ? "w-6 bg-white" : "w-1.5 bg-white/30 hover:bg-white/50"
                    }`}
                  />
                ))}
              </div>

              {/* Info overlay */}
              {info && (
                <div className="absolute left-3 bottom-3 rounded-lg border border-white/10 bg-black/70 p-3 font-mono text-[10px] backdrop-blur">
                  <div className="mb-1 uppercase tracking-widest text-white/50">technical</div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-white/80">
                    <span>format</span><span>carousel · 6</span>
                    <span>ratio</span><span>4:5 · 1080×1350</span>
                    <span>slide</span><span>{slide + 1} / {SLIDES.length}</span>
                    <span>schedule</span><span>qui 09/07 · 09h</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Decision desk */}
          {status === "pending" ? (
            <div className="mt-4 rounded-2xl border border-white/10 bg-neutral-950/60 p-3">
              <div className="mb-2 flex items-center justify-between px-2">
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">mesa de decisões</span>
                {disabled && (
                  <span className="font-mono text-[10px] text-amber-300">↑ identifique-se para liberar</span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <DecisionButton
                  disabled={disabled}
                  onClick={() => setStatus("approved")}
                  tone="emerald"
                  icon={<Check className="h-4 w-4" />}
                  label="Aprovar"
                />
                <DecisionButton
                  disabled={disabled}
                  onClick={() => setDrawer(true)}
                  tone="amber"
                  icon={<MessageSquareWarning className="h-4 w-4" />}
                  label="Pedir ajustes"
                />
                <DecisionButton
                  disabled={disabled}
                  onClick={() => setModal("reject")}
                  tone="red"
                  icon={<X className="h-4 w-4" />}
                  label="Rejeitar"
                />
                <DecisionButton
                  disabled={disabled}
                  onClick={() => setModal("comment")}
                  tone="slate"
                  icon={<MessageCircle className="h-4 w-4" />}
                  label="Comentar"
                />
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-white/10 bg-neutral-950/60 p-6 text-center">
              <div className="text-sm">
                {status === "approved" && <span className="text-emerald-400">✓ Post aprovado — a equipe foi notificada.</span>}
                {status === "rejected" && <span className="text-red-400">✗ Post rejeitado — vamos preparar uma nova versão.</span>}
                {status === "adjust" && <span className="text-amber-300">↻ Ajustes solicitados — voltamos em breve com a revisão.</span>}
              </div>
              <Button variant="ghost" size="sm" className="mt-2 text-xs" onClick={() => setStatus("pending")}>
                Voltar
              </Button>
            </div>
          )}
        </section>

        {/* Sidebar: history + meta */}
        <aside className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-neutral-950/60 p-4">
            <div className="mb-3 flex items-center gap-2">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">publicação prevista</span>
            </div>
            <div className="text-lg font-semibold">qui, 09/07 · 09h00</div>
            <div className="mt-1 font-mono text-[10px] text-muted-foreground">Instagram · @vitta.saude</div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-neutral-950/60 p-4">
            <div className="mb-3 flex items-center gap-2">
              <History className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">histórico de decisões</span>
            </div>
            <div className="space-y-2 font-mono text-[11px]">
              {HISTORY.map((h, i) => (
                <div key={i} className="flex gap-2 border-l border-white/10 pl-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-foreground">{h.who}</span>
                      <span className="rounded border border-white/10 bg-white/[0.03] px-1 py-px text-[9px] uppercase text-muted-foreground">
                        {h.role}
                      </span>
                    </div>
                    <div className="text-muted-foreground">{h.action}</div>
                    <div className="text-[10px] text-muted-foreground/70">{h.when}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </main>

      {/* Zoom lightbox */}
      <Dialog open={zoom} onOpenChange={setZoom}>
        <DialogContent className="max-w-3xl border-white/10 bg-neutral-950 p-2">
          <div className={`aspect-[4/5] w-full bg-gradient-to-br ${s.tone} flex flex-col justify-between rounded-lg p-12`}>
            <div className="font-mono text-xs uppercase tracking-[0.2em] text-emerald-300/70">Vitta · educativo</div>
            <div className="text-6xl font-bold text-emerald-50">{s.title}</div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reject / Comment modal */}
      <Dialog open={modal !== null} onOpenChange={(o) => !o && setModal(null)}>
        <DialogContent className="border-white/10 bg-neutral-950 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{modal === "reject" ? "Motivo da rejeição" : "Deixar comentário"}</DialogTitle>
          </DialogHeader>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={
              modal === "reject"
                ? "Ex.: 'Precisamos alinhar o tom antes de publicar.'"
                : "Compartilhe qualquer observação com a equipe…"
            }
            className="min-h-[120px] border-white/10 bg-white/[0.02]"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setModal(null)}>Cancelar</Button>
            <Button
              onClick={() => {
                if (modal === "reject") setStatus("rejected");
                setModal(null);
                setNote("");
              }}
            >
              Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Adjustments Drawer */}
      <Sheet open={drawer} onOpenChange={setDrawer}>
        <SheetContent side="right" className="w-full border-white/10 bg-neutral-950 sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Pedir ajustes</SheetTitle>
            <SheetDescription>
              Selecione um trecho da legenda ou escreva um feedback geral.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-5">
            <div>
              <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                legenda original · selecione um trecho
              </div>
              <div
                onMouseUp={() => {
                  const sel = window.getSelection()?.toString() ?? "";
                  if (sel) setSelected(sel);
                }}
                className="max-h-64 overflow-auto whitespace-pre-line rounded-lg border border-white/10 bg-white/[0.02] p-4 text-sm leading-relaxed selection:bg-amber-300/40 selection:text-amber-50"
              >
                {CAPTION}
              </div>
              {selected && (
                <div className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/[0.06] p-2 text-xs">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-amber-300">selecionado</span>
                  <div className="mt-1 italic text-amber-100/90">"{selected}"</div>
                </div>
              )}
            </div>

            <div>
              <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">seu feedback</div>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ex.: 'A legenda ficou longa, poderia ter um CTA mais forte no final.'"
                className="min-h-[120px] border-white/10 bg-white/[0.02]"
              />
            </div>

            <Button
              className="w-full bg-amber-500 text-black transition-colors duration-200 hover:bg-amber-400"
              onClick={() => {
                setStatus("adjust");
                setDrawer(false);
                setNote("");
                setSelected("");
              }}
            >
              Enviar solicitação de ajustes
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function DecisionButton({
  onClick, disabled, tone, icon, label,
}: {
  onClick: () => void;
  disabled: boolean;
  tone: "emerald" | "amber" | "red" | "slate";
  icon: React.ReactNode;
  label: string;
}) {
  const toneMap = {
    emerald:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20 hover:border-emerald-500/50 hover:glow-good",
    amber:
      "border-amber-500/30 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20 hover:border-amber-500/50 hover:glow-warn",
    red:
      "border-red-500/30 bg-red-500/10 text-red-200 hover:bg-red-500/20 hover:border-red-500/50 hover:glow-bad",
    slate:
      "border-white/10 bg-white/[0.03] text-foreground hover:bg-white/[0.06] hover:border-white/20",
  } as const;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`group flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-medium transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-40 ${toneMap[tone]}`}
    >
      <span className="transition-transform duration-200 group-hover:scale-110">{icon}</span>
      {label}
    </button>
  );
}