import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Home, CheckSquare, CalendarDays, Images, FolderOpen, FileText,
  Check, X, MessageSquareWarning, MessageCircle, ExternalLink,
  Download, Search, Clock, Loader2, ChevronLeft, ImageIcon, User2, CalendarClock,
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
            {tab === "approvals" && <ApprovalsTab token={token} identity={identity.value} onIdentityChange={identity.save} />}
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

function ApprovalsTab({ token, identity, onIdentityChange }: { token: string; identity: string; onIdentityChange: (v: string) => void }) {
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
          onIdentityChange={onIdentityChange}
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
          {post.scheduled_at ? <><span>·</span><span>{formatDate(post.scheduled_at as string)}</span></> : null}
        </div>
      </div>
    </button>
  );
}

function ApprovalDialog({
  token, postId, identity, onIdentityChange, onClose,
}: { token: string; postId: string; identity: string; onIdentityChange: (v: string) => void; onClose: () => void }) {
  const qc = useQueryClient();
  const getPost = useServerFn(getPortalPostFn);
  const decide = useServerFn(decidePortalApprovalFn);
  const q = useQuery({
    queryKey: ["portal", "post", token, postId],
    queryFn: () => getPost({ data: { token, postId } }),
  });
  const [note, setNote] = useState("");
  const [mode, setMode] = useState<null | "reject" | "adjust" | "comment">(null);
  const [activeMedia, setActiveMedia] = useState(0);
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
  const post = q.data?.post;
  const approval = q.data?.approval;
  const media = q.data?.media ?? [];
  const gallery = useMemo(() => {
    const list: Array<{ url: string; type: string }> = [];
    if (post?.cover_url) list.push({ url: post.cover_url as string, type: "image" });
    for (const m of media) {
      if (m.url && m.url !== post?.cover_url) list.push(m);
    }
    return list;
  }, [post?.cover_url, media]);
  const current = gallery[activeMedia] ?? gallery[0];
  const statusLabel: Record<string, string> = {
    approved: "Aprovado", rejected: "Rejeitado", adjust: "Ajustes solicitados",
    changes_requested: "Ajustes solicitados", pending: "Aguardando decisão",
  };
  const statusTone: Record<string, string> = {
    approved: "border-emerald-500/40 text-emerald-600 bg-emerald-500/10",
    rejected: "border-rose-500/40 text-rose-600 bg-rose-500/10",
    adjust: "border-amber-500/40 text-amber-600 bg-amber-500/10",
    changes_requested: "border-amber-500/40 text-amber-600 bg-amber-500/10",
    pending: "border-border/60 text-muted-foreground bg-muted/40",
  };
  const currentStatus = (approval?.status ?? "pending") as string;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl gap-0 overflow-hidden p-0">
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
          {/* Media column */}
          <div className="relative flex flex-col bg-muted/40">
            <div className="relative flex aspect-[4/5] w-full items-center justify-center overflow-hidden md:aspect-auto md:flex-1">
              {current?.url ? (
                <img src={current.url} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <ImageIcon className="h-8 w-8 opacity-40" />
                  <span className="font-mono text-[10px] uppercase tracking-widest">sem preview</span>
                </div>
              )}
              <Badge
                variant="outline"
                className={`absolute left-3 top-3 border backdrop-blur ${statusTone[currentStatus] ?? statusTone.pending}`}
              >
                {statusLabel[currentStatus] ?? "Aguardando"}
              </Badge>
            </div>
            {gallery.length > 1 && (
              <div className="flex gap-2 overflow-x-auto border-t border-border/60 bg-background/60 p-2">
                {gallery.map((g, i) => (
                  <button
                    key={g.url + i}
                    type="button"
                    onClick={() => setActiveMedia(i)}
                    className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-md border transition ${
                      i === activeMedia ? "border-primary ring-2 ring-primary/30" : "border-border/60 opacity-70 hover:opacity-100"
                    }`}
                  >
                    <img src={g.url} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Content column */}
          <div className="flex max-h-[88vh] min-w-0 flex-col">
            <DialogHeader className="space-y-2 border-b border-border/60 px-5 py-4 text-left">
              <DialogTitle className="pr-8 text-base font-semibold leading-snug">
                {post?.title ?? "Post"}
              </DialogTitle>
              <div className="flex flex-wrap items-center gap-1.5">
                {(post?.format) && (
                  <Badge variant="secondary" className="rounded-md font-mono text-[10px] uppercase tracking-wider">
                    {post.format}
                  </Badge>
                )}
                {(post?.channels ?? []).map((c) => (
                  <Badge key={c} variant="outline" className="rounded-md font-mono text-[10px] uppercase tracking-wider">
                    {c}
                  </Badge>
                ))}
                {post?.scheduled_at && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                    <CalendarClock className="h-3 w-3" />
                    {formatDate(post.scheduled_at as string)}
                  </span>
                )}
              </div>
            </DialogHeader>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 text-sm">
              {q.isLoading ? (
                <>
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-32 w-full" />
                </>
              ) : (
                <>
                  {approval && approval.status !== "pending" && (
                    <div className={`rounded-md border px-3 py-2 text-xs ${statusTone[approval.status] ?? statusTone.pending}`}>
                      <div className="font-medium">{statusLabel[approval.status] ?? approval.status}</div>
                      {approval.notes && <div className="mt-1 opacity-80">{approval.notes}</div>}
                      {approval.decided_by_name && (
                        <div className="mt-1 inline-flex items-center gap-1 opacity-70">
                          <User2 className="h-3 w-3" />
                          {approval.decided_by_name}
                          {approval.decided_at && <> · {formatDate(approval.decided_at)}</>}
                        </div>
                      )}
                    </div>
                  )}
                  <section className="space-y-1.5">
                    <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Legenda</div>
                    <div className="whitespace-pre-line rounded-md border border-border/60 bg-muted/40 p-3 leading-relaxed">
                      {(post?.copy as string) || "—"}
                    </div>
                  </section>
                  {post?.script && (
                    <section className="space-y-1.5">
                      <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Roteiro</div>
                      <div className="whitespace-pre-line rounded-md border border-border/60 bg-muted/40 p-3 leading-relaxed">
                        {post.script}
                      </div>
                    </section>
                  )}
                  {mode && (
                    <section className="space-y-1.5">
                      <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                        {mode === "reject" ? "Motivo da rejeição" : mode === "adjust" ? "Descreva o ajuste desejado" : "Seu comentário"}
                      </div>
                      <Textarea
                        autoFocus
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder={mode === "comment" ? "Deixe uma observação para a equipe…" : "Seja específico para acelerar a revisão…"}
                        className="min-h-[110px] resize-none"
                      />
                    </section>
                  )}
                </>
              )}
            </div>

            {/* Sticky footer */}
            <div className="space-y-3 border-t border-border/60 bg-card/70 px-5 py-4">
              {disabled && (
                <div className="space-y-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                    <User2 className="h-3 w-3" /> Identifique-se para decidir
                  </div>
                  <Input
                    autoFocus
                    value={identity}
                    onChange={(e) => onIdentityChange(e.target.value)}
                    placeholder="Seu nome"
                    className="h-8 text-sm"
                  />
                </div>
              )}
              {mode ? (
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" className="flex-1" onClick={() => { setMode(null); setNote(""); }}>
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1"
                    variant={mode === "reject" ? "destructive" : "default"}
                    disabled={disabled || m.isPending || (mode !== "comment" && !note.trim())}
                    onClick={() =>
                      m.mutate({
                        decision: mode === "reject" ? "rejected" : mode,
                        note: note.trim() || undefined,
                      })
                    }
                  >
                    {m.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : mode === "reject" ? "Confirmar rejeição"
                      : mode === "adjust" ? "Solicitar ajuste"
                      : "Enviar comentário"}
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <Button
                    size="sm"
                    className="w-full bg-emerald-600 text-white hover:bg-emerald-600/90"
                    disabled={disabled || m.isPending}
                    onClick={() => m.mutate({ decision: "approved" })}
                  >
                    {m.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}
                    Aprovar publicação
                  </Button>
                  <div className="grid grid-cols-3 gap-2">
                    <Button size="sm" variant="outline" disabled={disabled} onClick={() => setMode("adjust")}>
                      <MessageSquareWarning className="mr-1 h-4 w-4" /> Ajustar
                    </Button>
                    <Button size="sm" variant="outline" disabled={disabled} onClick={() => setMode("reject")}>
                      <X className="mr-1 h-4 w-4" /> Rejeitar
                    </Button>
                    <Button size="sm" variant="ghost" disabled={disabled} onClick={() => setMode("comment")}>
                      <MessageCircle className="mr-1 h-4 w-4" /> Comentar
                    </Button>
                  </div>
                </div>
              )}
            </div>
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

