import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  Copy,
  History,
  Link2,
  Loader2,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Settings2,
  Unlink,
  Unplug,
  Users,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageKpi, PageKpiGrid } from "@/components/ui/page-kpi";
import { MetaPortfolioDialog } from "@/components/connections/meta-portfolio-dialog";
import { AvailableAccountsTable } from "@/components/connections/available-accounts-table";

import {
  CHANNEL_ICON_SIZE,
  CONNECTABLE_CHANNELS,
  UPCOMING_CHANNELS,
  channelDef,
  formatRelative,
} from "@/components/connections/channel-meta";
import {
  listWorkspaceChannelsFn,
  toggleClientChannelFn,
  type WorkspaceChannel,
} from "@/lib/client-channels.functions";
import { listClients } from "@/lib/workspace.functions";
import { WhatsappCenter } from "./whatsapp-center";
import { disconnectMeta, startMetaOAuth } from "@/lib/meta/meta.functions";
import {
  applyMetaReconnectFn,
  inspectMetaConnectionFn,
  type InspectResult,
} from "@/lib/meta/reconnect.functions";
import {
  listDiscoveredMetaAccountsFn,
  reconcileMetaConnectionFn,
  type DiscoveredAccountsResult,
} from "@/lib/meta/discovery.functions";
import { linkMetaAccount } from "@/lib/meta/portfolio.functions";
import {
  disconnectMetaPortfolioFn,
  getMetaPortfolioStatusFn,
  type MetaPortfolioSummary,
} from "@/lib/meta/portfolio-admin.functions";
import { listChannelHistoryFn, recordChannelEventFn } from "@/lib/channels-center.functions";
import { cn } from "@/lib/utils";


/**
 * Central de Canais (Integrações → Canais).
 *
 * Apresentação e orquestração de UI apenas: banco, RLS, OAuth, criptografia e
 * workers permanecem intocados. As regras de negócio continuam nos server
 * functions existentes (`toggleClientChannelFn` para vínculo exclusivo,
 * `disconnectMeta` para remoção, `applyMetaReconnectFn` para reconexão
 * explícita — que nunca troca a conta sem confirmação do usuário).
 */

/* --------------------------------- status -------------------------------- */

type ChannelState = "ready" | "auth" | "unavailable" | "disconnected";

const STATE_META: Record<ChannelState, { label: string; hint: string; className: string }> = {
  ready: {
    label: "Pronto",
    hint: "Autorizado para publicar",
    className: "border-health-good/30 bg-health-good/10 text-health-good",
  },
  auth: {
    label: "Atenção",
    hint: "Autorização precisa ser renovada",
    className: "border-severity-warning/30 bg-severity-warning/10 text-severity-warning",
  },
  unavailable: {
    label: "Não disponível",
    hint: "A Meta não está aceitando esta conta agora",
    className: "border-severity-critical/30 bg-severity-critical/10 text-severity-critical",
  },
  disconnected: {
    label: "Desconectado",
    hint: "Sem conexão ativa",
    className: "border-border bg-muted/40 text-muted-foreground",
  },
};

function channelState(row: WorkspaceChannel): ChannelState {
  if (row.status === "active") return row.lastError ? "auth" : "ready";
  if (row.status === "attention" || row.status === "expired") return "auth";
  if (row.status === "revoked" || row.status === "error") return "unavailable";
  return "disconnected";
}

function StatusBadge({ state }: { state: ChannelState }) {
  const m = STATE_META[state];
  return (
    <Badge
      variant="outline"
      title={m.hint}
      className={cn("h-5 gap-1 px-1.5 text-[11px] font-medium", m.className)}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {m.label}
    </Badge>
  );
}

function CopyableId({ label, value }: { label: string; value: string | null }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  return (
    <button
      type="button"
      className="group flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
      onClick={(e) => {
        e.stopPropagation();
        void navigator.clipboard.writeText(value);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1200);
      }}
      title={`${label}: ${value}`}
    >
      <span className="shrink-0 uppercase tracking-wide">{label}</span>
      <span className="truncate font-mono">{value}</span>
      {copied ? (
        <Check className="h-3 w-3 shrink-0 text-health-good" />
      ) : (
        <Copy className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
      )}
    </button>
  );
}

/* --------------------------------- center -------------------------------- */

/** Tipo da conta (complemento discreto, nunca o nome do canal). */
function accountTypeLabel(channel: string): string {
  if (channel === "instagram") return "Instagram Business";
  if (channel === "facebook") return "Página do Facebook";
  return channelDef(channel).label;
}

export function ChannelsCenter({
  brandId,
  canManage,
}: {
  brandId: string | null;
  canManage: boolean;
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(listWorkspaceChannelsFn);
  const historyFn = useServerFn(listChannelHistoryFn);
  const clientsFn = useServerFn(listClients);
  const startMetaFn = useServerFn(startMetaOAuth);

  const [tab, setTab] = useState<"channels" | "accounts" | "whatsapp" | "history">("channels");
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<"all" | ChannelState>("all");
  const [connectOpen, setConnectOpen] = useState(false);
  const [connecting, setConnecting] = useState<null | "facebook" | "instagram">(null);
  const [portfolioSessionId, setPortfolioSessionId] = useState<string | null>(null);
  const [portfolioOpen, setPortfolioOpen] = useState(false);
  const [portfolioChannel, setPortfolioChannel] = useState<"facebook" | "instagram" | null>(null);
  const [manage, setManage] = useState<WorkspaceChannel | null>(null);
  const [linkTarget, setLinkTarget] = useState<WorkspaceChannel | null>(null);
  const [reconnectTarget, setReconnectTarget] = useState<WorkspaceChannel | null>(null);
  const [linkDiscovered, setLinkDiscovered] = useState<
    DiscoveredAccountsResult["accounts"][number] | null
  >(null);
  const reauthRef = useRef(false);
  const discoverFn = useServerFn(listDiscoveredMetaAccountsFn);

  const { data: channels = [], isLoading } = useQuery({
    queryKey: ["workspace-channels", brandId],
    queryFn: () => listFn({ data: { brandId: brandId! } }),
    enabled: !!brandId,
    staleTime: 30_000,
  });

  const { data: history = [], isLoading: loadingHistory } = useQuery({
    queryKey: ["channel-history", brandId],
    queryFn: () => historyFn({ data: { brandId: brandId! } }),
    enabled: !!brandId && tab === "history",
    staleTime: 60_000,
  });

  const {
    data: discovery,
    isLoading: loadingDiscovery,
    isFetching: fetchingDiscovery,
  } = useQuery({
    queryKey: ["meta-discovered-accounts", brandId],
    queryFn: () => discoverFn({ data: { brandId: brandId! } }),
    enabled: !!brandId,
    staleTime: 120_000,
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["clients", brandId],
    queryFn: () => clientsFn({ data: { brandId: brandId! } }),
    enabled: !!brandId,
    staleTime: 60_000,
  });

  const portfolioStatusFn = useServerFn(getMetaPortfolioStatusFn);
  const { data: portfolioStatus, isLoading: loadingPortfolio } = useQuery({
    queryKey: ["meta-portfolio-status", brandId],
    queryFn: () => portfolioStatusFn({ data: { brandId: brandId! } }),
    enabled: !!brandId,
    staleTime: 30_000,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["workspace-channels", brandId] });
    qc.invalidateQueries({ queryKey: ["channel-history", brandId] });
    qc.invalidateQueries({ queryKey: ["meta-connections", brandId] });
    qc.invalidateQueries({ queryKey: ["connections", brandId] });
    qc.invalidateQueries({ queryKey: ["meta-discovered-accounts", brandId] });
    qc.invalidateQueries({ queryKey: ["meta-portfolio-status", brandId] });
  };


  /**
   * Revoga a autorização Meta do workspace mesmo quando nenhum canal foi
   * vinculado. Sem isso, as contas descobertas pela autorização anterior
   * continuariam listadas como "disponíveis".
   */
  const revokeAuthFn = useServerFn(disconnectMetaPortfolioFn);
  const revokeAuthMut = useMutation({
    mutationFn: () => revokeAuthFn({ data: { brandId: brandId!, ownerExternalId: null } }),
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success("Autorização Meta revogada.", { description: res.message });
      invalidate();
    },
    onError: () => toast.error("Não foi possível revogar a autorização Meta."),
  });

  /** Nova varredura na Meta (mesma operação de antes, agora reutilizável). */
  function refreshDiscovery() {
    void qc
      .fetchQuery({
        queryKey: ["meta-discovered-accounts", brandId, "refresh"],
        queryFn: () => discoverFn({ data: { brandId: brandId!, refresh: true } }),
      })
      .then((r) => {
        qc.setQueryData(["meta-discovered-accounts", brandId], r);
        if (r.error)
          toast.error("A Meta recusou a consulta.", {
            description: r.error,
            duration: 12000,
          });
        else toast.success(`${r.accounts.length} conta(s) disponível(is).`);
      })
      .catch((e) =>
        toast.error("Não foi possível consultar a Meta.", {
          description: e instanceof Error ? e.message : undefined,
          duration: 12000,
        }),
      );
  }

  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      const d = ev.data as {
        source?: string;
        type?: string;
        ok?: boolean;
        error?: string;
        message?: string;
        sessionId?: string | null;
        channel?: "facebook" | "instagram" | null;
        scopes?: string[];
      };
      if (!d || d.source !== "meta-oauth") return;
      if (d.type === "missing-scopes" && d.scopes?.length) {
        toast.warning(
          "Algumas permissões não foram concedidas. Refaça a autorização marcando todas as páginas e contas desejadas.",
          { duration: 8000 },
        );
        return;
      }
      setConnecting(null);
      if (d.ok && d.sessionId && reauthRef.current) return;
      if (d.ok && d.sessionId) {
        toast.success("Autorização concluída. Selecione as contas para conectar.");
        setConnectOpen(false);
        setPortfolioSessionId(d.sessionId);
        setPortfolioChannel(d.channel ?? null);
        setPortfolioOpen(true);
      } else if (d.error) {
        console.warn("[meta-oauth] falha na autorização:", d.error);
        toast.error("Não foi possível concluir a autorização.", {
          description: d.error,
          duration: 12000,
        });
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  async function connectMeta(channel: "facebook" | "instagram", forceReauth = false) {
    if (!brandId) return;
    setConnecting(channel);
    // O popup precisa abrir de forma síncrona no clique.
    const popup = window.open(
      "",
      "meta-oauth",
      "width=760,height=820,resizable=yes,scrollbars=yes",
    );
    try {
      const { authorizeUrl, redirectUri } = await startMetaFn({
        // Fluxo normal: reutiliza a sessão Meta e solicita novamente apenas
        // permissões recusadas. Reautenticação forçada fica restrita às ações
        // explícitas de trocar portfólio / reconectar uma conta.
        data: { brandId, channel, ...(forceReauth ? { forceReauth: true } : {}) },
      });

      console.info("[meta-oauth] redirect_uri em uso:", redirectUri);
      if (popup) popup.location.href = authorizeUrl;
      else window.location.href = authorizeUrl;
    } catch (err) {
      setConnecting(null);
      popup?.close();
      console.warn("[meta-oauth] falha ao iniciar autorização:", err);
      toast.error("Não foi possível abrir a autorização da Meta.", {
        description: err instanceof Error ? err.message : undefined,
        duration: 10000,
      });
    }
  }

  /* ---------------------------------- dados --------------------------------- */

  const connected = useMemo(
    () => channels.filter((c) => c.status === "active" || c.status === "attention"),
    [channels],
  );
  /**
   * "Contas disponíveis" = contas realmente devolvidas pela Meta na autorização
   * atual e ainda não salvas neste workspace. Nunca derivado do histórico.
   */
  const available = useMemo(() => discovery?.accounts ?? [], [discovery]);
  const attention = useMemo(() => channels.filter((c) => channelState(c) !== "ready"), [channels]);
  const servedClients = useMemo(() => {
    const ids = new Set<string>();
    for (const c of channels) for (const cl of c.clients) ids.add(cl.id);
    return ids.size;
  }, [channels]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return channels.filter((c) => {
      if (stateFilter !== "all" && channelState(c) !== stateFilter) return false;
      if (!q) return true;
      return [
        c.accountLabel,
        c.handle ?? "",
        c.externalId,
        c.pageId ?? "",
        c.instagramBusinessId ?? "",
        ...c.clients.map((cl) => cl.name),
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [channels, search, stateFilter]);

  /* ----------------------------------- ui ----------------------------------- */

  /* ------------------------------- portfólios ------------------------------- */

  const portfolios = portfolioStatus?.portfolios ?? [];
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const activePortfolio =
    portfolios.find((p) => portfolioKey(p) === selectedKey) ?? portfolios[0] ?? null;

  /** Ativos do portfólio selecionado (fallback: todos, em identidade legada). */
  const portfolioAssets = useMemo(() => {
    const bid = activePortfolio?.businessId ?? null;
    if (!bid) return available;
    const matching = available.filter((a) => a.businessId === bid);
    return matching.length || available.some((a) => a.businessId) ? matching : available;
  }, [available, activePortfolio]);

  /** Canais realmente operacionais (histórico/revogados não entram aqui). */
  const operational = useMemo(
    () => channels.filter((c) => c.status !== "revoked" && c.status !== "disconnected"),
    [channels],
  );

  const operationalVisible = useMemo(
    () => visible.filter((c) => c.status !== "revoked" && c.status !== "disconnected"),
    [visible],
  );

  const linkedByExternalId = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of channels) {
      const name = c.clients[0]?.name;
      if (name) m.set(c.externalId, name);
    }
    return m;
  }, [channels]);

  return (
    <div className="space-y-4">
      {/* ---------------------------------- header --------------------------------- */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Conexões</h2>
          <p className="text-xs text-muted-foreground">
            Gerencie aqui os portfólios Meta autorizados no workspace e os canais que atendem cada
            cliente.
          </p>
        </div>
        {canManage ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setConnectOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              Conectar Meta
            </Button>
            {portfolios.length ? (
              <Button
                size="sm"
                variant="ghost"
                className="h-8 gap-1.5 text-xs text-muted-foreground"
                disabled={connecting !== null}
                onClick={() => void connectMeta("facebook", true)}
              >
                <Plus className="h-3.5 w-3.5" />
                Adicionar outro portfólio
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="space-y-4">
        <TabsList className="h-8">
          <TabsTrigger value="meta" className="h-6 text-xs">
            Meta
          </TabsTrigger>
          <TabsTrigger value="whatsapp" className="h-6 text-xs">
            WhatsApp
          </TabsTrigger>
        </TabsList>

        <TabsContent value="whatsapp" className="space-y-3">
          <WhatsappCenter brandId={brandId} canManage={canManage} />
        </TabsContent>

        <TabsContent value="meta" className="space-y-4">
          {/* ---------------------- 1. portfólio Meta selecionado ---------------------- */}
          <PortfolioSection
            brandId={brandId}
            canManage={canManage}
            loading={loadingPortfolio}
            authorized={portfolioStatus?.authorized ?? false}
            authorizedAt={portfolioStatus?.authorizedAt ?? null}
            metaUserName={portfolioStatus?.metaUserName ?? null}
            portfolios={portfolios}
            active={activePortfolio}
            assetCount={portfolioAssets.length}
            busy={connecting !== null}
            onSelect={setSelectedKey}
            onConnect={() => void connectMeta("facebook")}
            onSwitch={() => void connectMeta("facebook", true)}
            onManage={() => {
              document.getElementById("assets-section")?.scrollIntoView({ behavior: "smooth" });
            }}
            onRevokeAll={() => revokeAuthMut.mutate()}
            revoking={revokeAuthMut.isPending}
            onChanged={invalidate}
          />

          {/* ------------------------- 2. ativos disponíveis -------------------------- */}
          <section id="assets-section" className="space-y-2.5">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold">Ativos disponíveis</h3>
                <p className="text-xs text-muted-foreground">
                  Contas encontradas neste portfólio e ainda não conectadas.
                  {discovery?.discoveredAt ? (
                    <span className="ml-1">Verificado {formatRelative(discovery.discoveredAt)}.</span>
                  ) : null}
                </p>
              </div>
              <Badge variant="outline" className="h-6 text-[11px]">
                {portfolioAssets.length} ativo{portfolioAssets.length === 1 ? "" : "s"}
              </Badge>
            </div>

            {discovery?.error ? (
              <Card className="flex flex-wrap items-center justify-between gap-2 border-severity-critical/30 bg-severity-critical/10 p-3 text-xs text-severity-critical">
                <span className="min-w-0">{discovery.error}</span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1.5 text-xs"
                  onClick={() => refreshDiscovery()}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Tentar novamente
                </Button>
              </Card>
            ) : null}
            {discovery?.warnings?.length ? (
              <Card className="border-severity-warning/30 bg-severity-warning/10 p-3 text-[11px] text-severity-warning">
                {discovery.warnings.slice(0, 3).join(" · ")}
              </Card>
            ) : null}

            {loadingDiscovery ? (
              <Skeleton className="h-40 w-full rounded-xl" />
            ) : discovery?.needsAuthorization ? (
              <Card className="flex flex-col items-start gap-2 border-dashed p-4">
                <div className="text-sm font-medium">Autorize a Meta para listar ativos</div>
                <p className="text-xs text-muted-foreground">
                  Nenhuma autorização válida neste workspace. Faça o login na Meta mantendo todas as
                  Páginas e contas do Instagram marcadas.
                </p>
                {canManage ? (
                  <Button
                    size="sm"
                    className="mt-1 h-8 gap-1.5 text-xs"
                    onClick={() => setConnectOpen(true)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Conectar Meta
                  </Button>
                ) : null}
              </Card>
            ) : (
              <AvailableAccountsTable
                accounts={portfolioAssets}
                canManage={canManage}
                clientByExternalId={linkedByExternalId}
                onLink={(a) => setLinkDiscovered(a)}
                emptyDescription={`A Meta devolveu ${discovery?.alreadyLinked ?? 0} conta(s) e todas já existem neste workspace (conectadas ou no histórico). Use “Sincronizar com a Meta” após alterar permissões.`}
                actions={
                  canManage ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9 gap-1.5 text-xs"
                      disabled={fetchingDiscovery || !!discovery?.needsAuthorization}
                      onClick={() => refreshDiscovery()}
                    >
                      {fetchingDiscovery ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5" />
                      )}
                      Sincronizar com a Meta
                    </Button>
                  ) : null
                }
              />
            )}
          </section>

          {/* -------------------------- 3. canais conectados -------------------------- */}
          <section className="space-y-2.5">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold">Canais conectados</h3>
                <p className="text-xs text-muted-foreground">
                  Canais operacionais do Unitos, cada um atendendo um cliente.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[200px]">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar conta, cliente ou ID"
                    className="h-8 pl-8 text-xs"
                  />
                </div>
                <Select
                  value={stateFilter}
                  onValueChange={(v) => setStateFilter(v as typeof stateFilter)}
                >
                  <SelectTrigger className="h-8 w-[160px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os status</SelectItem>
                    <SelectItem value="ready">Pronto</SelectItem>
                    <SelectItem value="auth">Atenção</SelectItem>
                    <SelectItem value="unavailable">Não disponível</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {isLoading ? (
              <Skeleton className="h-32 w-full rounded-xl" />
            ) : operationalVisible.length === 0 ? (
              <EmptyChannels
                hasAny={operational.length > 0}
                canManage={canManage}
                onConnect={() => setConnectOpen(true)}
              />
            ) : (
              <ConnectedChannelsTable
                rows={operationalVisible}
                canManage={canManage}
                onManage={setManage}
                onReconnect={setReconnectTarget}
                onLink={setLinkTarget}
              />
            )}
          </section>

          {/* ------------------------------ 4. histórico ------------------------------ */}
          <Collapsible
            open={historyOpen}
            onOpenChange={(v) => {
              setHistoryOpen(v);
              if (v) qc.invalidateQueries({ queryKey: ["channel-history", brandId] });
            }}
          >
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-full justify-between px-2 text-xs text-muted-foreground"
              >
                <span className="flex items-center gap-1.5">
                  <History className="h-3.5 w-3.5" />
                  Histórico de conexões
                </span>
                <ChevronDown
                  className={cn("h-3.5 w-3.5 transition-transform", historyOpen && "rotate-180")}
                />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              {loadingHistory ? (
                <Skeleton className="h-32 w-full rounded-xl" />
              ) : history.length === 0 ? (
                <Card className="border-dashed p-4 text-xs text-muted-foreground">
                  Ainda não há eventos registrados. Vínculos, reconexões e remoções feitos a partir
                  de agora aparecem aqui.
                </Card>
              ) : (
                <Card className="overflow-hidden">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Quando</TableHead>
                          <TableHead className="text-xs">Evento</TableHead>
                          <TableHead className="text-xs">Ativo</TableHead>
                          <TableHead className="text-xs">Cliente</TableHead>
                          <TableHead className="text-xs">Resultado</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {history.map((h) => (
                          <TableRow key={h.id}>
                            <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                              {new Date(h.at).toLocaleString("pt-BR")}
                            </TableCell>
                            <TableCell className="text-xs font-medium">{h.actionLabel}</TableCell>
                            <TableCell className="text-xs">
                              {h.accountLabel}
                              {h.externalId ? (
                                <span className="ml-1 font-mono text-[11px] text-muted-foreground">
                                  {h.externalId}
                                </span>
                              ) : null}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {h.clientName ?? "—"}
                            </TableCell>
                            <TableCell className="max-w-[280px] truncate text-xs text-muted-foreground">
                              {h.detail ?? "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </Card>
              )}
            </CollapsibleContent>
          </Collapsible>
        </TabsContent>
      </Tabs>

      {/* -------------------------------- diálogos -------------------------------- */}

      <Dialog open={connectOpen} onOpenChange={setConnectOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Conectar canal</DialogTitle>
            <DialogDescription className="text-xs">
              A autorização é feita na tela oficial da Meta. Depois você escolhe quais contas
              conectar e a qual cliente cada uma atende.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            {CONNECTABLE_CHANNELS.map((def) => {
              const Icon = def.icon;
              return (
                <button
                  key={def.key}
                  type="button"
                  disabled={!!connecting}
                  onClick={() => connectMeta(def.key as "facebook" | "instagram")}
                  className="flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-accent disabled:opacity-60"
                >
                  <Icon className={cn(CHANNEL_ICON_SIZE, def.tone)} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{def.label}</div>
                    <div className="text-xs text-muted-foreground">Meta · autorização oficial</div>
                  </div>
                  {connecting === def.key ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  ) : null}
                </button>
              );
            })}
          </div>
          <div className="space-y-1.5 border-t pt-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Em breve</p>
            <div className="flex flex-wrap gap-1.5">
              {UPCOMING_CHANNELS.map((def) => (
                <Badge
                  key={def.key}
                  variant="outline"
                  className="gap-1 text-[11px] font-normal text-muted-foreground"
                >
                  <def.icon className="h-3 w-3" />
                  {def.label}
                </Badge>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {portfolioSessionId ? (
        <MetaPortfolioDialog
          open={portfolioOpen}
          onOpenChange={(v) => {
            setPortfolioOpen(v);
            if (!v) {
              setPortfolioSessionId(null);
              invalidate();
            }
          }}
          sessionId={portfolioSessionId}
          brandId={brandId ?? ""}
          channel={portfolioChannel}
        />
      ) : null}

      <LinkClientDialog
        row={linkTarget}
        brandId={brandId}
        clients={clients.map((c) => ({ id: c.id as string, name: c.name as string }))}
        onOpenChange={(v) => !v && setLinkTarget(null)}
        onChanged={invalidate}
      />

      <LinkDiscoveredDialog
        account={linkDiscovered}
        brandId={brandId}
        sessionId={discovery?.sessionId ?? null}
        clients={clients.map((c) => ({ id: c.id as string, name: c.name as string }))}
        onOpenChange={(v) => !v && setLinkDiscovered(null)}
        onChanged={invalidate}
      />

      <ReconnectDialog
        row={reconnectTarget}
        brandId={brandId}
        reauthRef={reauthRef}
        onOpenChange={(v) => !v && setReconnectTarget(null)}
        onChanged={invalidate}
      />

      <ManageChannelDialog
        row={manage}
        brandId={brandId}
        canManage={canManage}
        onOpenChange={(v) => !v && setManage(null)}
        onChanged={invalidate}
        onReconnect={(row) => {
          setManage(null);
          setReconnectTarget(row);
        }}
        onLink={(row) => {
          setManage(null);
          setLinkTarget(row);
        }}
      />
    </div>
  );
}

/* --------------------------------- pedaços -------------------------------- */

/** Identidade estável de um portfólio (Business ID, ou usuário Meta legado). */
function portfolioKey(p: MetaPortfolioSummary) {
  return p.businessId ?? `user:${p.ownerExternalId ?? "unknown"}`;
}

function portfolioName(p: MetaPortfolioSummary) {
  return p.businessName ?? p.ownerName ?? "Portfólio sem nome na Meta";
}

type PortfolioState = "connected" | "attention" | "disconnected";

function portfolioState(p: MetaPortfolioSummary): PortfolioState {
  if (!p.authorized) return "disconnected";
  return p.attentionCount ? "attention" : "connected";
}

function PortfolioStatusDot({ state }: { state: PortfolioState }) {
  const map: Record<PortfolioState, { label: string; className: string }> = {
    connected: {
      label: "Conectado",
      className: "border-health-good/30 bg-health-good/10 text-health-good",
    },
    attention: {
      label: "Atenção",
      className: "border-severity-warning/30 bg-severity-warning/10 text-severity-warning",
    },
    disconnected: {
      label: "Desconectado",
      className: "border-border bg-muted/40 text-muted-foreground",
    },
  };
  const m = map[state];
  return (
    <Badge
      variant="outline"
      className={cn("h-5 gap-1 px-1.5 text-[11px] font-medium", m.className)}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {m.label}
    </Badge>
  );
}

/**
 * Seção 1 — resumo de alto destaque do portfólio Meta selecionado.
 * Nenhuma regra de negócio aqui: reaproveita `disconnectMetaPortfolioFn`
 * (desconexão granular por Business Portfolio) e o OAuth existente.
 */
function PortfolioSection({
  brandId,
  canManage,
  loading,
  authorized,
  authorizedAt,
  metaUserName,
  portfolios,
  active,
  assetCount,
  busy,
  onSelect,
  onConnect,
  onSwitch,
  onManage,
  onRevokeAll,
  revoking,
  onChanged,
}: {
  brandId: string | null;
  canManage: boolean;
  loading: boolean;
  authorized: boolean;
  authorizedAt: string | null;
  metaUserName: string | null;
  portfolios: MetaPortfolioSummary[];
  active: MetaPortfolioSummary | null;
  assetCount: number;
  busy: boolean;
  onSelect: (key: string) => void;
  onConnect: () => void;
  onSwitch: () => void;
  onManage: () => void;
  onRevokeAll: () => void;
  revoking: boolean;
  onChanged: () => void;
}) {
  const disconnectFn = useServerFn(disconnectMetaPortfolioFn);
  const [target, setTarget] = useState<MetaPortfolioSummary | null>(null);

  const disconnectMut = useMutation({
    mutationFn: (p: MetaPortfolioSummary) =>
      disconnectFn({
        data: {
          brandId: brandId!,
          businessId: p.businessId,
          ownerExternalId: p.legacyIdentity ? p.ownerExternalId : null,
        },
      }),
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success("Portfólio desconectado.", { description: res.message });
      setTarget(null);
      onChanged();
    },
    onError: () => toast.error("Não foi possível desconectar este portfólio."),
  });

  if (loading) {
    return (
      <Card className="p-4">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="mt-2 h-3 w-72" />
      </Card>
    );
  }

  if (!active) {
    return (
      <Card className="flex flex-col items-start gap-2 border-dashed p-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          Nenhum portfólio Meta conectado
        </div>
        <p className="text-xs text-muted-foreground">
          Conecte um Business Portfolio da Meta para descobrir Páginas e contas do Instagram e
          vinculá-las aos seus clientes.
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {canManage ? (
            <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={busy} onClick={onConnect}>
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              Conectar Meta
            </Button>
          ) : null}
          {canManage && authorized ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 gap-1.5 text-xs text-destructive hover:text-destructive"
              disabled={revoking}
              onClick={onRevokeAll}
            >
              {revoking ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Unplug className="h-3.5 w-3.5" />
              )}
              Revogar autorização
            </Button>
          ) : null}
        </div>
      </Card>
    );
  }

  const state = portfolioState(active);

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border bg-muted/40">
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </span>
            {portfolios.length > 1 ? (
              <Select value={portfolioKey(active)} onValueChange={onSelect}>
                <SelectTrigger className="h-8 min-w-[220px] max-w-[320px] text-sm font-medium">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {portfolios.map((p) => (
                    <SelectItem key={portfolioKey(p)} value={portfolioKey(p)} className="text-xs">
                      <span className="flex flex-col">
                        <span className="font-medium">{portfolioName(p)}</span>
                        <span className="text-[11px] text-muted-foreground">
                          {p.authorized ? "Autorizado" : "Sem autorização"} ·{" "}
                          {p.businessId ? `ID ${p.businessId.slice(0, 8)}…` : "identidade legada"} ·{" "}
                          {p.channelCount} canal(is)
                          {p.connectedAt ? ` · ${formatRelative(p.connectedAt)}` : ""}
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <span className="truncate text-sm font-semibold">{portfolioName(active)}</span>
            )}
            <PortfolioStatusDot state={state} />
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <CopyableId label="Business ID" value={active.businessId} />
            {!active.businessId && active.ownerExternalId ? (
              <CopyableId label="Usuário Meta" value={active.ownerExternalId} />
            ) : null}
            <span>Autorizado por {active.ownerName ?? metaUserName ?? "—"}</span>
            {authorizedAt ? <span>Autorização {formatRelative(authorizedAt)}</span> : null}
            {active.authorizedByMetaUserIds.length > 1 ? (
              <span>{active.authorizedByMetaUserIds.length} administradores Meta</span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-0.5 text-xs">
            <Badge variant="outline" className="h-5 gap-1 px-1.5 text-[11px]">
              {assetCount} ativo{assetCount === 1 ? "" : "s"} encontrado
              {assetCount === 1 ? "" : "s"}
            </Badge>
            <Badge variant="outline" className="h-5 gap-1 px-1.5 text-[11px]">
              {active.channelCount} canal(is) vinculado(s)
            </Badge>
            <Badge variant="outline" className="h-5 gap-1 px-1.5 text-[11px]">
              {active.clientCount} cliente(s)
            </Badge>
          </div>
        </div>

        {canManage ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {portfolios.length > 1 ? null : (
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 text-xs"
                disabled={busy}
                onClick={onSwitch}
              >
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                Trocar portfólio
              </Button>
            )}
            <Button size="sm" variant="secondary" className="h-8 gap-1.5 text-xs" onClick={onManage}>
              <Settings2 className="h-3.5 w-3.5" />
              Gerenciar
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="sr-only">Mais ações do portfólio</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem className="text-xs" onClick={onSwitch} disabled={busy}>
                  <RefreshCw className="mr-2 h-3.5 w-3.5" />
                  Reconectar
                </DropdownMenuItem>
                <DropdownMenuItem className="text-xs" onClick={onSwitch} disabled={busy}>
                  <Plus className="mr-2 h-3.5 w-3.5" />
                  Trocar portfólio
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-xs text-destructive focus:text-destructive"
                  onClick={() => setTarget(active)}
                >
                  <Unlink className="mr-2 h-3.5 w-3.5" />
                  Desconectar portfólio
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : null}
      </div>

      {state === "disconnected" ? (
        <p className="mt-3 rounded-md bg-muted/50 px-2.5 py-1.5 text-[11px] text-muted-foreground">
          Este portfólio não tem autorização ativa. Os ativos permanecem indisponíveis até uma nova
          autorização na Meta; o histórico dos clientes é preservado.
        </p>
      ) : null}

      <AlertDialog open={!!target} onOpenChange={(v) => !v && setTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Desconectar o portfólio {target ? portfolioName(target) : ""}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Os ativos deste portfólio deixarão de estar disponíveis para uso e{" "}
              {target?.channelCount ?? 0} canal(is) param de publicar. Nenhum dado histórico de
              clientes é apagado — apenas a autorização é revogada e os ativos ficam indisponíveis.
              Você pode reconectar depois.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={disconnectMut.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (target) disconnectMut.mutate(target);
              }}
            >
              {disconnectMut.isPending ? "Desconectando…" : "Desconectar portfólio"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function EmptyChannels({
  hasAny,
  canManage,
  onConnect,
}: {
  hasAny: boolean;
  canManage: boolean;
  onConnect: () => void;
}) {
  return (
    <Card className="flex flex-col items-start gap-2 border-dashed p-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Radio className="h-4 w-4 text-muted-foreground" />
        {hasAny ? "Nenhum canal com este filtro" : "Nenhum canal conectado"}
      </div>
      <p className="text-xs text-muted-foreground">
        {hasAny
          ? "Ajuste a busca ou o status para ver os demais canais."
          : "Vincule um ativo disponível a um cliente para começar a publicar e medir resultados."}
      </p>
      {!hasAny && canManage ? (
        <Button size="sm" className="mt-1 h-8 gap-1.5 text-xs" onClick={onConnect}>
          <Plus className="h-3.5 w-3.5" />
          Conectar Meta
        </Button>
      ) : null}
    </Card>
  );
}

/** Seção 3 — tabela compacta dos canais operacionais do Unitos. */
function ConnectedChannelsTable({
  rows,
  canManage,
  onManage,
  onReconnect,
  onLink,
}: {
  rows: WorkspaceChannel[];
  canManage: boolean;
  onManage: (row: WorkspaceChannel) => void;
  onReconnect: (row: WorkspaceChannel) => void;
  onLink: (row: WorkspaceChannel) => void;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[160px] text-xs">Cliente</TableHead>
              <TableHead className="text-xs">Canal</TableHead>
              <TableHead className="min-w-[180px] text-xs">Conta</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              <TableHead className="text-xs">Sincronização</TableHead>
              <TableHead className="w-[150px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const def = channelDef(row.channel);
              const Icon = def.icon;
              const state = channelState(row);
              const client = row.clients[0] ?? null;
              return (
                <TableRow key={row.connectionId}>
                  <TableCell className="py-2 text-xs">
                    {client ? (
                      <span className="truncate font-medium">{client.name}</span>
                    ) : (
                      <span className="text-severity-warning">Sem cliente vinculado</span>
                    )}
                  </TableCell>
                  <TableCell className="py-2 text-xs">
                    <span className="inline-flex items-center gap-1.5">
                      <Icon className={cn(CHANNEL_ICON_SIZE, def.tone)} />
                      {def.label}
                    </span>
                  </TableCell>
                  <TableCell className="py-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <Avatar className="h-6 w-6 shrink-0">
                        <AvatarImage src={row.avatarUrl ?? undefined} alt={row.accountLabel} />
                        <AvatarFallback className="text-[9px] uppercase">
                          {row.channel.slice(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="truncate text-xs font-medium">{row.accountLabel}</div>
                        <div className="truncate text-[11px] text-muted-foreground">
                          {row.handle
                            ? `@${row.handle.replace(/^@/, "")}`
                            : accountTypeLabel(row.channel)}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="py-2">
                    <StatusBadge state={state} />
                  </TableCell>
                  <TableCell className="py-2 whitespace-nowrap text-[11px] text-muted-foreground">
                    {formatRelative(row.lastSyncedAt)}
                  </TableCell>
                  <TableCell className="py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {canManage && !client ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 gap-1.5 px-2 text-xs"
                          onClick={() => onLink(row)}
                        >
                          <Link2 className="h-3.5 w-3.5" />
                          Vincular
                        </Button>
                      ) : null}
                      {canManage && state !== "ready" ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 gap-1.5 px-2 text-xs"
                          onClick={() => onReconnect(row)}
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                          Reconectar
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 gap-1.5 px-2 text-xs"
                        onClick={() => onManage(row)}
                      >
                        <Settings2 className="h-3.5 w-3.5" />
                        Gerenciar
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}


/* ------------------------------ vincular cliente --------------------------- */

function LinkClientDialog({
  row,
  brandId,
  clients,
  onOpenChange,
  onChanged,
}: {
  row: WorkspaceChannel | null;
  brandId: string | null;
  clients: Array<{ id: string; name: string }>;
  onOpenChange: (v: boolean) => void;
  onChanged: () => void;
}) {
  const toggleFn = useServerFn(toggleClientChannelFn);
  const recordFn = useServerFn(recordChannelEventFn);
  const [clientId, setClientId] = useState<string>("");

  useEffect(() => {
    setClientId(row?.clients[0]?.id ?? "");
  }, [row?.connectionId, row?.clients]);

  const linkMut = useMutation({
    mutationFn: async () => {
      if (!row || !brandId || !clientId) return;
      await toggleFn({
        data: { brandId, clientId, connectionId: row.connectionId, assigned: true },
      });
      await recordFn({
        data: {
          brandId,
          connectionId: row.connectionId,
          clientId,
          verb: "channel_linked" as const,
          channel: row.channel,
          accountLabel: row.accountLabel,
          externalId: row.externalId,
          clientName: clients.find((c) => c.id === clientId)?.name ?? null,
          detail: null,
        },
      });
    },
    onSuccess: () => {
      toast.success("Canal vinculado ao cliente.");
      onOpenChange(false);
      onChanged();
    },
    onError: (e) =>
      toast.error(
        e instanceof Error ? e.message : "Não foi possível vincular esta conta ao cliente.",
      ),
  });

  if (!row) return null;
  const def = channelDef(row.channel);

  return (
    <Dialog open={!!row} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Vincular a um cliente</DialogTitle>
          <DialogDescription className="text-xs">
            {def.label}
            {row.handle ? ` · @${row.handle.replace(/^@/, "")}` : ""}. Uma conta atende apenas um
            cliente por vez — isso
            garante o isolamento de dados e de publicações.
          </DialogDescription>
        </DialogHeader>

        <Select value={clientId} onValueChange={setClientId}>
          <SelectTrigger className="h-9 text-sm">
            <SelectValue placeholder="Selecione o cliente" />
          </SelectTrigger>
          <SelectContent>
            {clients.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <DialogFooter>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            size="sm"
            className="h-8 gap-1.5 text-xs"
            disabled={!clientId || linkMut.isPending}
            onClick={() => linkMut.mutate()}
          >
            {linkMut.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Link2 className="h-3.5 w-3.5" />
            )}
            Vincular
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* --------------------------------- reconectar ------------------------------ */

function ReconnectDialog({
  row,
  brandId,
  reauthRef,
  onOpenChange,
  onChanged,
}: {
  row: WorkspaceChannel | null;
  brandId: string | null;
  reauthRef: React.MutableRefObject<boolean>;
  onOpenChange: (v: boolean) => void;
  onChanged: () => void;
}) {
  const inspectFn = useServerFn(inspectMetaConnectionFn);
  const startMetaFn = useServerFn(startMetaOAuth);
  const reconcileFn = useServerFn(reconcileMetaConnectionFn);
  const [reauthorizing, setReauthorizing] = useState(false);
  const applyFn = useServerFn(applyMetaReconnectFn);
  const recordFn = useServerFn(recordChannelEventFn);
  const [result, setResult] = useState<InspectResult | null>(null);

  useEffect(() => {
    setResult(null);
  }, [row?.connectionId]);

  const inspectMut = useMutation({
    mutationFn: () => inspectFn({ data: { brandId: brandId!, connectionId: row!.connectionId } }),
    onSuccess: (r) => setResult(r),
    onError: () => toast.error("Não foi possível verificar esta conexão agora. Tente novamente."),
  });

  useEffect(() => {
    if (row && brandId && !result && !inspectMut.isPending) inspectMut.mutate();

    // Handler do popup OAuth: religado apenas quando a conexão/marca muda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row?.connectionId, brandId]);

  const applyMut = useMutation({
    mutationFn: async (acceptNewAccount: boolean) => {
      const res = await applyFn({
        data: {
          brandId: brandId!,
          connectionId: row!.connectionId,
          acceptNewAccount,
        },
      });
      if (res.ok && row && brandId) {
        await recordFn({
          data: {
            brandId,
            connectionId: row.connectionId,
            clientId: row.clients[0]?.id ?? null,
            verb: acceptNewAccount
              ? ("channel_account_changed" as const)
              : ("channel_reconnected" as const),
            channel: row.channel,
            accountLabel: row.accountLabel,
            externalId: row.externalId,
            clientName: row.clients[0]?.name ?? null,
            detail: acceptNewAccount ? "Conta substituída com confirmação" : null,
          },
        });
      }
      return res;
    },
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(res.message?.description ?? "Não foi possível atualizar a conexão.");
        return;
      }
      toast.success("Conexão atualizada.");
      onOpenChange(false);
      onChanged();
    },
    onError: () => toast.error("Não foi possível atualizar a conexão."),
  });

  /**
   * Reconexão real: nova autorização na Meta + nova descoberta. A conta só volta
   * a ficar ativa se a Meta continuar devolvendo o mesmo ID externo.
   */
  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      const d = ev.data as {
        source?: string;
        type?: string;
        ok?: boolean;
        error?: string;
        sessionId?: string | null;
      };
      if (!d || d.source !== "meta-oauth" || d.type === "missing-scopes") return;
      if (!reauthRef.current) return;
      if (!d.ok || !d.sessionId) {
        reauthRef.current = false;
        setReauthorizing(false);
        if (d.error)
          toast.error("A Meta não concluiu a autorização.", {
            description: d.error,
            duration: 12000,
          });
        return;
      }
      const sessionId = d.sessionId;
      void (async () => {
        try {
          const res = await reconcileFn({
            data: { brandId: brandId!, connectionId: row!.connectionId, sessionId },
          });
          if (res.ok) {
            toast.success(res.message.title, { description: res.message.description });
            onOpenChange(false);
            onChanged();
          } else {
            toast.error(res.message.title, {
              description: res.message.description,
              duration: 12000,
            });
            onChanged();
          }
        } catch (e) {
          toast.error("Não foi possível concluir a reconexão.", {
            description: e instanceof Error ? e.message : undefined,
            duration: 12000,
          });
        } finally {
          reauthRef.current = false;
          setReauthorizing(false);
        }
      })();
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [row?.connectionId, brandId]);

  async function startReauth() {
    if (!row || !brandId) return;
    reauthRef.current = true;
    setReauthorizing(true);
    const popup = window.open(
      "",
      "meta-oauth",
      "width=760,height=820,resizable=yes,scrollbars=yes",
    );
    try {
      const { authorizeUrl } = await startMetaFn({
        data: {
          brandId,
          channel: row.channel as "facebook" | "instagram",
          forceReauth: true,
        },
      });
      if (popup) popup.location.href = authorizeUrl;
      else window.location.href = authorizeUrl;
    } catch (err) {
      reauthRef.current = false;
      setReauthorizing(false);
      popup?.close();
      toast.error("Não foi possível abrir a autorização da Meta.", {
        description: err instanceof Error ? err.message : undefined,
        duration: 10000,
      });
    }
  }

  if (!row) return null;
  const def = channelDef(row.channel);

  return (
    <Dialog open={!!row} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">Reconectar canal</DialogTitle>
          <DialogDescription className="text-xs">
            {def.label}
            {row.handle ? ` · @${row.handle.replace(/^@/, "")}` : ""}. Verificamos a conta antes de
            gravar qualquer alteração
            — nenhuma conta é substituída sem a sua confirmação.
          </DialogDescription>
        </DialogHeader>

        {inspectMut.isPending || !result ? (
          <div className="flex items-center gap-2 py-6 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Verificando a conta na Meta…
          </div>
        ) : !result.ok ? (
          <div className="space-y-1 rounded-lg border border-severity-warning/30 bg-severity-warning/10 p-3">
            <p className="text-sm font-medium text-severity-warning">
              {result.message?.title ?? "Não foi possível verificar"}
            </p>
            <p className="text-xs text-muted-foreground">
              {result.message?.description ??
                "Autorize novamente esta conta na Meta para voltar a publicar."}
            </p>
          </div>
        ) : result.changed ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-severity-warning/30 bg-severity-warning/10 p-3 text-xs text-severity-warning">
              A Meta está devolvendo uma conta diferente da que está configurada. Confirme antes de
              trocar — a troca afeta publicações e métricas do cliente vinculado.
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <AccountBox title="Conta atual" snap={result.current} />
              <AccountBox title="Conta encontrada agora" snap={result.found} />
            </div>
          </div>
        ) : (
          <div className="rounded-lg border p-3 text-xs text-muted-foreground">
            A conta continua a mesma. Podemos revalidar a autorização e reativar o canal.
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs"
            disabled={reauthorizing}
            onClick={() => void startReauth()}
          >
            {reauthorizing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Nova autorização na Meta
          </Button>
          {result?.ok && result.changed ? (
            <>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                disabled={applyMut.isPending}
                onClick={() => applyMut.mutate(false)}
              >
                Manter conta atual
              </Button>
              <Button
                size="sm"
                className="h-8 gap-1.5 text-xs"
                disabled={applyMut.isPending}
                onClick={() => applyMut.mutate(true)}
              >
                {applyMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Usar a nova conta
              </Button>
            </>
          ) : result?.ok ? (
            <Button
              size="sm"
              className="h-8 gap-1.5 text-xs"
              disabled={applyMut.isPending}
              onClick={() => applyMut.mutate(false)}
            >
              {applyMut.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Reconectar
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AccountBox({ title, snap }: { title: string; snap: InspectResult["current"] | null }) {
  return (
    <div className="space-y-1 rounded-lg border p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{title}</p>
      <p className="truncate text-sm font-medium">{snap?.pageName ?? "—"}</p>
      <p className="truncate font-mono text-[11px] text-muted-foreground">
        Page {snap?.pageId ?? "—"}
      </p>
      <p className="truncate font-mono text-[11px] text-muted-foreground">
        IG {snap?.instagramUsername ?? snap?.instagramBusinessId ?? "—"}
      </p>
    </div>
  );
}

/* --------------------------------- gerenciar ------------------------------- */

function ManageChannelDialog({
  row,
  brandId,
  canManage,
  onOpenChange,
  onChanged,
  onReconnect,
  onLink,
}: {
  row: WorkspaceChannel | null;
  brandId: string | null;
  canManage: boolean;
  onOpenChange: (v: boolean) => void;
  onChanged: () => void;
  onReconnect: (row: WorkspaceChannel) => void;
  onLink: (row: WorkspaceChannel) => void;
}) {
  const disconnectFn = useServerFn(disconnectMeta);
  const toggleFn = useServerFn(toggleClientChannelFn);
  const recordFn = useServerFn(recordChannelEventFn);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  useEffect(() => {
    setConfirmDisconnect(false);
  }, [row?.connectionId]);

  const unlinkMut = useMutation({
    mutationFn: async (client: { id: string; name: string }) => {
      await toggleFn({
        data: {
          brandId: brandId!,
          clientId: client.id,
          connectionId: row!.connectionId,
          assigned: false,
        },
      });
      await recordFn({
        data: {
          brandId: brandId!,
          connectionId: row!.connectionId,
          clientId: client.id,
          verb: "channel_unlinked" as const,
          channel: row!.channel,
          accountLabel: row!.accountLabel,
          externalId: row!.externalId,
          clientName: client.name,
          detail: null,
        },
      });
    },
    onSuccess: () => {
      toast.success("Canal desvinculado do cliente.");
      onChanged();
      onOpenChange(false);
    },
    onError: () => toast.error("Não foi possível desvincular este canal."),
  });

  const disconnectMut = useMutation({
    mutationFn: async () => {
      await recordFn({
        data: {
          brandId: brandId!,
          connectionId: row!.connectionId,
          clientId: row!.clients[0]?.id ?? null,
          verb: "channel_disconnected" as const,
          channel: row!.channel,
          accountLabel: row!.accountLabel,
          externalId: row!.externalId,
          clientName: row!.clients[0]?.name ?? null,
          detail: null,
        },
      });
      await disconnectFn({
        data: { brandId: brandId!, connectionId: row!.connectionId },
      });
    },
    onSuccess: () => {
      toast.success("Canal removido do workspace.");
      onOpenChange(false);
      onChanged();
    },
    onError: () => toast.error("Não foi possível remover este canal."),
  });

  if (!row) return null;
  const def = channelDef(row.channel);
  const Icon = def.icon;
  const state = channelState(row);

  return (
    <Dialog open={!!row} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Icon className={cn(CHANNEL_ICON_SIZE, def.tone)} />
            {def.label}
            {row.handle ? (
              <span className="text-xs font-normal text-muted-foreground">
                @{row.handle.replace(/^@/, "")}
              </span>
            ) : null}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {accountTypeLabel(row.channel)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Avatar className="h-11 w-11">
              <AvatarImage src={row.avatarUrl ?? undefined} alt={row.accountLabel} />
              <AvatarFallback className="text-xs uppercase">
                {row.channel.slice(0, 2)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 space-y-1">
              <StatusBadge state={state} />
              <p className="text-[11px] text-muted-foreground">
                {STATE_META[state].hint} · sincronizado {formatRelative(row.lastSyncedAt)}
              </p>
            </div>
          </div>

          <div className="space-y-1.5 rounded-lg border bg-muted/30 p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Identificadores oficiais
            </p>
            <CopyableId label="Page ID" value={row.pageId ?? row.externalId} />
            <CopyableId label="Instagram ID" value={row.instagramBusinessId} />
            <CopyableId label="Conexão" value={row.connectionId} />
          </div>

          <div className="space-y-1.5">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Cliente atendido
            </p>
            {row.clients.length ? (
              <div className="space-y-1.5">
                {row.clients.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5"
                  >
                    <span className="truncate text-xs">{c.name}</span>
                    {canManage ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 gap-1.5 px-2 text-xs text-destructive hover:text-destructive"
                        disabled={unlinkMut.isPending}
                        onClick={() => unlinkMut.mutate(c)}
                      >
                        <Unlink className="h-3.5 w-3.5" />
                        Desvincular
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-dashed px-2.5 py-2">
                <span className="text-xs text-muted-foreground">
                  Sem cliente vinculado — este canal não publica.
                </span>
                {canManage ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1.5 text-xs"
                    onClick={() => onLink(row)}
                  >
                    <Link2 className="h-3.5 w-3.5" />
                    Vincular
                  </Button>
                ) : null}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Permissões concedidas
            </p>
            {row.scopes.length ? (
              <div className="flex flex-wrap gap-1">
                {row.scopes.map((s) => (
                  <span
                    key={s}
                    className="rounded border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                  >
                    {s}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Nenhuma permissão registrada nesta conexão.
              </p>
            )}
          </div>

          {row.lastError ? (
            <div className="rounded-lg border border-severity-warning/30 bg-severity-warning/10 p-3 text-xs text-severity-warning">
              A Meta recusou a última operação desta conta. Reconecte para renovar a autorização.
            </div>
          ) : null}
        </div>

        {canManage ? (
          <DialogFooter className="flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 text-xs"
              onClick={() => onReconnect(row)}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Reconectar
            </Button>
            {confirmDisconnect ? (
              <Button
                size="sm"
                variant="destructive"
                className="h-8 gap-1.5 text-xs"
                disabled={disconnectMut.isPending}
                onClick={() => disconnectMut.mutate()}
              >
                {disconnectMut.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5" />
                )}
                Confirmar remoção
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                className="h-8 gap-1.5 text-xs text-destructive hover:text-destructive"
                onClick={() => setConfirmDisconnect(true)}
              >
                <History className="h-3.5 w-3.5" />
                Remover canal
              </Button>
            )}
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/* -------------------- vincular conta descoberta na Meta -------------------- */

function LinkDiscoveredDialog({
  account,
  brandId,
  sessionId,
  clients,
  onOpenChange,
  onChanged,
}: {
  account: DiscoveredAccountsResult["accounts"][number] | null;
  brandId: string | null;
  sessionId: string | null;
  clients: Array<{ id: string; name: string }>;
  onOpenChange: (v: boolean) => void;
  onChanged: () => void;
}) {
  const linkFn = useServerFn(linkMetaAccount);
  const [clientId, setClientId] = useState("");
  const [linkPair, setLinkPair] = useState(true);

  useEffect(() => {
    setClientId("");
    setLinkPair(true);
  }, [account?.externalId]);

  const mut = useMutation({
    mutationFn: async () => {
      if (!account || !brandId || !sessionId || !clientId) return;
      await linkFn({
        data: {
          brandId,
          sessionId,
          channel: account.channel,
          targetId: account.externalId,
          clientId,
          linkPair:
            account.channel === "facebook" && !!account.instagramBusinessId ? linkPair : false,
        },
      });
    },
    onSuccess: () => {
      toast.success("Conta conectada e vinculada ao cliente.");
      onOpenChange(false);
      onChanged();
    },
    onError: (e) =>
      toast.error("Não foi possível conectar esta conta.", {
        description: e instanceof Error ? e.message : undefined,
        duration: 12000,
      }),
  });

  if (!account) return null;
  const def = channelDef(account.channel);
  const canPair = account.channel === "facebook" && !!account.instagramBusinessId;

  return (
    <Dialog open={!!account} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Conectar e vincular</DialogTitle>
          <DialogDescription className="text-xs">
            {def.label} · {account.label} · ID {account.externalId}. A conta é salva no workspace e
            passa a atender apenas o cliente escolhido.
          </DialogDescription>
        </DialogHeader>

        {!sessionId ? (
          <div className="rounded-lg border border-severity-warning/30 bg-severity-warning/10 p-3 text-xs text-severity-warning">
            A autorização da Meta expirou. Autorize novamente para conectar esta conta.
          </div>
        ) : null}

        {account.status !== "ready" ? (
          <div className="rounded-lg border border-severity-warning/30 bg-severity-warning/10 p-3 text-[11px] text-severity-warning">
            A Meta ainda não liberou publicação para esta conta. Você pode vinculá-la agora, mas
            será necessário refazer a autorização marcando esta conta.
          </div>
        ) : null}

        <Select value={clientId} onValueChange={setClientId}>
          <SelectTrigger className="h-9 text-sm">
            <SelectValue placeholder="Selecione o cliente" />
          </SelectTrigger>
          <SelectContent>
            {clients.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {canPair ? (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={linkPair}
              onChange={(e) => setLinkPair(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            Conectar também o Instagram vinculado a esta Página
          </label>
        ) : null}

        <DialogFooter>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            size="sm"
            className="h-8 gap-1.5 text-xs"
            disabled={!clientId || !sessionId || mut.isPending}
            onClick={() => mut.mutate()}
          >
            {mut.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Link2 className="h-3.5 w-3.5" />
            )}
            Conectar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ----------------------------- portfólio Meta ----------------------------- */

/**
 * Painel de PORTFÓLIOS Meta conectados ao workspace.
 *
 * O portfólio (Business da Meta) é a identidade que autoriza a instalação; os
 * canais abaixo dele atendem clientes específicos. Trocar o portfólio inicia uma
 * nova autorização e o seletor de contas — nada é gravado até a seleção, então a
 * conexão atual continua íntegra se a nova autorização falhar.
 */
/* Painel legado de portfólios removido — ver `PortfolioSection`. */

