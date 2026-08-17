import { useEffect, useMemo, useState } from "react";
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
import {
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
import { disconnectMeta, startMetaOAuth } from "@/lib/meta/meta.functions";
import {
  applyMetaReconnectFn,
  inspectMetaConnectionFn,
  type InspectResult,
} from "@/lib/meta/reconnect.functions";
import {
  listChannelHistoryFn,
  recordChannelEventFn,
} from "@/lib/channels-center.functions";
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

const STATE_META: Record<
  ChannelState,
  { label: string; hint: string; className: string }
> = {
  ready: {
    label: "Pronto",
    hint: "Autorizado para publicar",
    className: "border-health-good/30 bg-health-good/10 text-health-good",
  },
  auth: {
    label: "Atenção",
    hint: "Autorização precisa ser renovada",
    className:
      "border-severity-warning/30 bg-severity-warning/10 text-severity-warning",
  },
  unavailable: {
    label: "Não disponível",
    hint: "A Meta não está aceitando esta conta agora",
    className:
      "border-severity-critical/30 bg-severity-critical/10 text-severity-critical",
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

  const [tab, setTab] = useState<"channels" | "accounts" | "history">("channels");
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<"all" | ChannelState>("all");
  const [connectOpen, setConnectOpen] = useState(false);
  const [connecting, setConnecting] = useState<null | "facebook" | "instagram">(null);
  const [portfolioSessionId, setPortfolioSessionId] = useState<string | null>(null);
  const [portfolioOpen, setPortfolioOpen] = useState(false);
  const [portfolioChannel, setPortfolioChannel] = useState<
    "facebook" | "instagram" | null
  >(null);
  const [manage, setManage] = useState<WorkspaceChannel | null>(null);
  const [linkTarget, setLinkTarget] = useState<WorkspaceChannel | null>(null);
  const [reconnectTarget, setReconnectTarget] = useState<WorkspaceChannel | null>(null);

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

  const { data: clients = [] } = useQuery({
    queryKey: ["clients", brandId],
    queryFn: () => clientsFn({ data: { brandId: brandId! } }),
    enabled: !!brandId,
    staleTime: 60_000,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["workspace-channels", brandId] });
    qc.invalidateQueries({ queryKey: ["channel-history", brandId] });
    qc.invalidateQueries({ queryKey: ["meta-connections", brandId] });
    qc.invalidateQueries({ queryKey: ["connections", brandId] });
  };

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
      if (d.ok && d.sessionId) {
        toast.success("Autorização concluída. Selecione as contas para conectar.");
        setConnectOpen(false);
        setPortfolioSessionId(d.sessionId);
        setPortfolioChannel(d.channel ?? null);
        setPortfolioOpen(true);
      } else if (d.error) {
        toast.error("Não foi possível concluir a autorização. Tente novamente.");
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  async function connectMeta(channel: "facebook" | "instagram") {
    if (!brandId) return;
    setConnecting(channel);
    // O popup precisa abrir de forma síncrona no clique.
    const popup = window.open(
      "",
      "meta-oauth",
      "width=760,height=820,resizable=yes,scrollbars=yes",
    );
    try {
      const { authorizeUrl } = await startMetaFn({
        data: { brandId, channel, forceReauth: true },
      });
      if (popup) popup.location.href = authorizeUrl;
      else window.location.href = authorizeUrl;
    } catch {
      setConnecting(null);
      popup?.close();
      toast.error("Não foi possível abrir a autorização da Meta. Tente novamente.");
    }
  }

  /* ---------------------------------- dados --------------------------------- */

  const connected = useMemo(
    () => channels.filter((c) => c.status === "active" || c.status === "attention"),
    [channels],
  );
  const available = useMemo(
    () => connected.filter((c) => c.clients.length === 0),
    [connected],
  );
  const attention = useMemo(
    () => channels.filter((c) => channelState(c) !== "ready"),
    [channels],
  );
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Central de canais</h2>
          <p className="text-xs text-muted-foreground">
            As contas são autorizadas no workspace e cada canal atende um cliente
            específico. Nenhuma publicação usa uma conta sem vínculo.
          </p>
        </div>
        {canManage ? (
          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setConnectOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            Conectar canal
          </Button>
        ) : null}
      </div>

      <PageKpiGrid columns={4}>
        <PageKpi
          label="Canais conectados"
          value={connected.length}
          icon={<Radio className="h-3.5 w-3.5" />}
          status={connected.length ? "success" : "neutral"}
          description="Contas autorizadas e operacionais"
          onClick={() => {
            setTab("channels");
            setStateFilter("all");
          }}
          active={tab === "channels" && stateFilter === "all"}
        />
        <PageKpi
          label="Contas disponíveis"
          value={available.length}
          icon={<Link2 className="h-3.5 w-3.5" />}
          status={available.length ? "info" : "neutral"}
          description="Prontas para vincular a um cliente"
          onClick={() => setTab("accounts")}
          active={tab === "accounts"}
        />
        <PageKpi
          label="Com atenção"
          value={attention.length}
          icon={<AlertTriangle className="h-3.5 w-3.5" />}
          status={attention.length ? "warning" : "success"}
          description="Precisam de reconexão ou autorização"
          onClick={() => {
            setTab("channels");
            setStateFilter(stateFilter === "auth" ? "all" : "auth");
          }}
          active={tab === "channels" && stateFilter === "auth"}
        />
        <PageKpi
          label="Clientes atendidos"
          value={servedClients}
          icon={<Users className="h-3.5 w-3.5" />}
          status="neutral"
          description="Clientes com pelo menos um canal"
        />
      </PageKpiGrid>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="space-y-3">
        <TabsList className="h-8">
          <TabsTrigger value="channels" className="h-6 text-xs">
            Canais
          </TabsTrigger>
          <TabsTrigger value="accounts" className="h-6 text-xs">
            Contas disponíveis
            {available.length ? (
              <span className="ml-1.5 text-[10px] text-muted-foreground">
                {available.length}
              </span>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="history" className="h-6 text-xs">
            Histórico
          </TabsTrigger>
        </TabsList>

        {/* --------------------------------- canais -------------------------------- */}
        <TabsContent value="channels" className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por conta, cliente ou ID"
                className="h-8 pl-8 text-xs"
              />
            </div>
            <Select
              value={stateFilter}
              onValueChange={(v) => setStateFilter(v as typeof stateFilter)}
            >
              <SelectTrigger className="h-8 w-[170px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="ready">Pronto</SelectItem>
                <SelectItem value="auth">Atenção</SelectItem>
                <SelectItem value="unavailable">Não disponível</SelectItem>
                <SelectItem value="disconnected">Desconectado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-[168px] w-full rounded-xl" />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <EmptyChannels
              hasAny={channels.length > 0}
              canManage={canManage}
              onConnect={() => setConnectOpen(true)}
            />
          ) : (
            <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
              {visible.map((c) => (
                <ChannelCard
                  key={c.connectionId}
                  row={c}
                  canManage={canManage}
                  onManage={() => setManage(c)}
                  onReconnect={() => setReconnectTarget(c)}
                  onLink={() => setLinkTarget(c)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ---------------------------- contas disponíveis --------------------------- */}
        <TabsContent value="accounts" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Contas autorizadas na Meta que ainda não atendem nenhum cliente. Cada
              conta pode atender apenas um cliente por vez.
            </p>
            {canManage ? (
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 text-xs"
                onClick={() => setConnectOpen(true)}
              >
                <Plus className="h-3.5 w-3.5" />
                Buscar contas na Meta
              </Button>
            ) : null}
          </div>

          {available.length === 0 ? (
            <Card className="border-dashed p-5 text-xs text-muted-foreground">
              Nenhuma conta disponível. Todas as contas autorizadas já estão
              vinculadas a um cliente.
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Conta</TableHead>
                    <TableHead className="text-xs">Canal</TableHead>
                    <TableHead className="text-xs">Identificador</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="w-[140px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {available.map((c) => {
                    const def = channelDef(c.channel);
                    const Icon = def.icon;
                    return (
                      <TableRow key={c.connectionId}>
                        <TableCell className="text-xs font-medium">
                          {c.accountLabel}
                          {c.handle ? (
                            <span className="ml-1 text-muted-foreground">
                              @{c.handle.replace(/^@/, "")}
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-xs">
                          <span className="inline-flex items-center gap-1.5">
                            <Icon className={cn("h-3.5 w-3.5", def.tone)} />
                            {def.label}
                          </span>
                        </TableCell>
                        <TableCell>
                          <CopyableId
                            label={c.channel === "instagram" ? "IG" : "Page"}
                            value={
                              c.channel === "instagram"
                                ? (c.instagramBusinessId ?? c.externalId)
                                : (c.pageId ?? c.externalId)
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <StatusBadge state={channelState(c)} />
                        </TableCell>
                        <TableCell className="text-right">
                          {canManage ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 gap-1.5 text-xs"
                              onClick={() => setLinkTarget(c)}
                            >
                              <Link2 className="h-3.5 w-3.5" />
                              Vincular cliente
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        {/* -------------------------------- histórico ------------------------------- */}
        <TabsContent value="history" className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Vínculos, reconexões e remoções registrados neste workspace, além de
            contas que a Meta deixou de aceitar.
          </p>
          {loadingHistory ? (
            <Skeleton className="h-40 w-full rounded-xl" />
          ) : history.length === 0 ? (
            <Card className="border-dashed p-5 text-xs text-muted-foreground">
              Ainda não há eventos registrados. Vínculos, reconexões e remoções
              feitos a partir de agora aparecem aqui.
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Quando</TableHead>
                    <TableHead className="text-xs">Evento</TableHead>
                    <TableHead className="text-xs">Conta</TableHead>
                    <TableHead className="text-xs">Cliente</TableHead>
                    <TableHead className="text-xs">Detalhe</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {new Date(h.at).toLocaleString("pt-BR")}
                      </TableCell>
                      <TableCell className="text-xs font-medium">
                        {h.actionLabel}
                      </TableCell>
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
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* -------------------------------- diálogos -------------------------------- */}

      <Dialog open={connectOpen} onOpenChange={setConnectOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Conectar canal</DialogTitle>
            <DialogDescription className="text-xs">
              A autorização é feita na tela oficial da Meta. Depois você escolhe
              quais contas conectar e a qual cliente cada uma atende.
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
                  <Icon className={cn("h-4 w-4", def.tone)} />
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
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Em breve
            </p>
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

      <ReconnectDialog
        row={reconnectTarget}
        brandId={brandId}
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
    <Card className="flex flex-col items-start gap-2 border-dashed p-5">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Radio className="h-4 w-4 text-muted-foreground" />
        {hasAny ? "Nenhum canal com este filtro" : "Nenhum canal conectado"}
      </div>
      <p className="text-xs text-muted-foreground">
        {hasAny
          ? "Ajuste a busca ou o status para ver os demais canais."
          : "Conecte uma conta da Meta para publicar e medir resultados. Depois vincule cada conta ao cliente que ela atende."}
      </p>
      {!hasAny && canManage ? (
        <Button size="sm" className="mt-1 h-8 gap-1.5 text-xs" onClick={onConnect}>
          <Plus className="h-3.5 w-3.5" />
          Conectar canal
        </Button>
      ) : null}
    </Card>
  );
}

function ChannelCard({
  row,
  canManage,
  onManage,
  onReconnect,
  onLink,
}: {
  row: WorkspaceChannel;
  canManage: boolean;
  onManage: () => void;
  onReconnect: () => void;
  onLink: () => void;
}) {
  const def = channelDef(row.channel);
  const Icon = def.icon;
  const state = channelState(row);
  const client = row.clients[0] ?? null;

  return (
    <Card className="flex flex-col gap-2.5 p-3.5">
      <div className="flex items-start gap-2.5">
        <Avatar className="h-9 w-9 shrink-0">
          <AvatarImage src={row.avatarUrl ?? undefined} alt={row.accountLabel} />
          <AvatarFallback className="text-[10px] uppercase">
            {row.channel.slice(0, 2)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Icon className={cn("h-3.5 w-3.5 shrink-0", def.tone)} />
            <span className="truncate text-sm font-medium">{row.accountLabel}</span>
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {def.label}
            {row.handle ? ` · @${row.handle.replace(/^@/, "")}` : ""}
          </p>
        </div>
        <StatusBadge state={state} />
      </div>

      <div className="space-y-1 rounded-lg bg-muted/40 px-2 py-1.5">
        <CopyableId
          label={row.channel === "instagram" ? "IG" : "Page"}
          value={
            row.channel === "instagram"
              ? (row.instagramBusinessId ?? row.externalId)
              : (row.pageId ?? row.externalId)
          }
        />
        {row.channel === "instagram" && row.pageId ? (
          <CopyableId label="Page" value={row.pageId} />
        ) : null}
      </div>

      <div className="flex min-w-0 items-center gap-1.5 text-xs">
        <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        {client ? (
          <span className="truncate">{client.name}</span>
        ) : (
          <span className="text-severity-warning">Sem cliente vinculado</span>
        )}
      </div>

      {state !== "ready" ? (
        <p className="line-clamp-2 rounded-md bg-severity-warning/10 px-2 py-1 text-[11px] text-severity-warning">
          {STATE_META[state].hint}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-2 border-t pt-2.5">
        <span className="truncate text-[11px] text-muted-foreground">
          Sincronizado {formatRelative(row.lastSyncedAt)}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          {canManage && !client ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={onLink}
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
              onClick={onReconnect}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Reconectar
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1.5 px-2 text-xs"
            onClick={onManage}
          >
            <Settings2 className="h-3.5 w-3.5" />
            Gerenciar
          </Button>
        </div>
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
        e instanceof Error
          ? e.message
          : "Não foi possível vincular esta conta ao cliente.",
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
            {def.label} · {row.accountLabel}. Uma conta atende apenas um cliente por
            vez — isso garante o isolamento de dados e de publicações.
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
  onOpenChange,
  onChanged,
}: {
  row: WorkspaceChannel | null;
  brandId: string | null;
  onOpenChange: (v: boolean) => void;
  onChanged: () => void;
}) {
  const inspectFn = useServerFn(inspectMetaConnectionFn);
  const applyFn = useServerFn(applyMetaReconnectFn);
  const recordFn = useServerFn(recordChannelEventFn);
  const [result, setResult] = useState<InspectResult | null>(null);

  useEffect(() => {
    setResult(null);
  }, [row?.connectionId]);

  const inspectMut = useMutation({
    mutationFn: () =>
      inspectFn({ data: { brandId: brandId!, connectionId: row!.connectionId } }),
    onSuccess: (r) => setResult(r),
    onError: () =>
      toast.error("Não foi possível verificar esta conexão agora. Tente novamente."),
  });

  useEffect(() => {
    if (row && brandId && !result && !inspectMut.isPending) inspectMut.mutate();
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
        toast.error(
          res.message?.description ?? "Não foi possível atualizar a conexão.",
        );
        return;
      }
      toast.success("Conexão atualizada.");
      onOpenChange(false);
      onChanged();
    },
    onError: () => toast.error("Não foi possível atualizar a conexão."),
  });

  if (!row) return null;
  const def = channelDef(row.channel);

  return (
    <Dialog open={!!row} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">Reconectar canal</DialogTitle>
          <DialogDescription className="text-xs">
            {def.label} · {row.accountLabel}. Verificamos a conta antes de gravar
            qualquer alteração — nenhuma conta é substituída sem a sua confirmação.
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
              A Meta está devolvendo uma conta diferente da que está configurada.
              Confirme antes de trocar — a troca afeta publicações e métricas do
              cliente vinculado.
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <AccountBox title="Conta atual" snap={result.current} />
              <AccountBox title="Conta encontrada agora" snap={result.found} />
            </div>
          </div>
        ) : (
          <div className="rounded-lg border p-3 text-xs text-muted-foreground">
            A conta continua a mesma. Podemos revalidar a autorização e reativar o
            canal.
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
                {applyMut.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : null}
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

function AccountBox({
  title,
  snap,
}: {
  title: string;
  snap: InspectResult["current"] | null;
}) {
  return (
    <div className="space-y-1 rounded-lg border p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
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
            <Icon className={cn("h-4 w-4", def.tone)} />
            {row.accountLabel}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {def.label}
            {row.handle ? ` · @${row.handle.replace(/^@/, "")}` : ""}
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
                {STATE_META[state].hint} · sincronizado{" "}
                {formatRelative(row.lastSyncedAt)}
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
              A Meta recusou a última operação desta conta. Reconecte para renovar a
              autorização.
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
