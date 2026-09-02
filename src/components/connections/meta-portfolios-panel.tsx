import { Fragment, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  Building2,
  ChevronDown,
  ChevronRight,
  Loader2,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Unlink,
  Unplug,
} from "lucide-react";
import { toast } from "sonner";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AvailableAccountsTable } from "@/components/connections/available-accounts-table";
import { formatRelative } from "@/components/connections/channel-meta";
import type { MetaPortfolioSummary } from "@/lib/meta/authorization-state";
import type { DiscoveredAccountsResult } from "@/lib/meta/discovery.functions";
import { disconnectMetaPortfolioFn } from "@/lib/meta/portfolio-admin.functions";
import { cn } from "@/lib/utils";

/**
 * Painel secundário "Portfólios Meta e ativos disponíveis".
 *
 * Camada 100% de apresentação, com a MESMA linguagem de tabela da seção
 * "Clientes e canais": uma linha por portfólio, badges de status, ações rápidas
 * e área secundária expansível com os ativos. Nenhuma regra de OAuth,
 * descoberta, vínculo ou revogação vive aqui — as ações reaproveitam os
 * callbacks e server functions existentes.
 */

type Account = DiscoveredAccountsResult["accounts"][number];

function portfolioKey(p: MetaPortfolioSummary) {
  return p.businessId ?? `user:${p.ownerExternalId ?? "unknown"}`;
}

function portfolioName(p: MetaPortfolioSummary) {
  return p.businessName ?? p.ownerName ?? "Portfólio sem nome na Meta";
}

type PortfolioState = "connected" | "attention" | "error";

function portfolioState(p: MetaPortfolioSummary): PortfolioState {
  if (!p.authorized) return "error";
  return p.attentionCount ? "attention" : "connected";
}

const STATE_STYLE: Record<PortfolioState, { label: string; dot: string; chip: string }> = {
  connected: {
    label: "Conectado",
    dot: "bg-health-good",
    chip: "border-health-good/30 bg-health-good/10 text-health-good",
  },
  attention: {
    label: "Atenção",
    dot: "bg-severity-warning",
    chip: "border-severity-warning/30 bg-severity-warning/10 text-severity-warning",
  },
  error: {
    label: "Erro",
    dot: "bg-severity-critical",
    chip: "border-severity-critical/30 bg-severity-critical/10 text-severity-critical",
  },
};

const STATE_WEIGHT: Record<PortfolioState, number> = { error: 0, attention: 1, connected: 2 };

function StateBadge({ state }: { state: PortfolioState }) {
  const m = STATE_STYLE[state];
  return (
    <Badge
      variant="outline"
      className={cn("h-5 shrink-0 gap-1 px-1.5 text-[11px] font-medium", m.chip)}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", m.dot)} />
      {m.label}
    </Badge>
  );
}

/** Alerta compacto de atenção; o detalhe técnico só existe ao expandir. */
function MetaIssuesAlert({
  error,
  warnings,
  restrictedCount,
  onRetry,
  retrying,
}: {
  error: string | null;
  warnings: string[];
  restrictedCount: number;
  onRetry: () => void;
  retrying: boolean;
}) {
  const [open, setOpen] = useState(false);
  const details = [error, ...warnings].filter(Boolean) as string[];
  if (!details.length) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card
        className={cn(
          "border-severity-warning/30 bg-severity-warning/5 px-3 py-2.5",
          error && "border-severity-critical/30 bg-severity-critical/5",
        )}
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <AlertTriangle
            className={cn(
              "h-4 w-4 shrink-0",
              error ? "text-severity-critical" : "text-severity-warning",
            )}
          />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium">Algumas contas não puderam ser carregadas</div>
            <p className="text-[11px] text-muted-foreground">
              {restrictedCount > 0
                ? `${restrictedCount} ativo${restrictedCount === 1 ? "" : "s"} restringido${
                    restrictedCount === 1 ? "" : "s"
                  } pela Meta.`
                : "A Meta restringiu parte da leitura de ativos."}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-[11px]">
                Ver detalhes
                <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
              </Button>
            </CollapsibleTrigger>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 px-2 text-[11px]"
              disabled={retrying}
              onClick={onRetry}
            >
              {retrying ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
              Tentar novamente
            </Button>
          </div>
        </div>
        <CollapsibleContent>
          <ul className="mt-2 space-y-1 border-t pt-2 text-[11px] leading-relaxed text-muted-foreground">
            {details.map((d, i) => (
              <li key={i} className="break-words font-mono">
                {d}
              </li>
            ))}
          </ul>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

export function MetaPortfoliosPanel({
  brandId,
  canManage,
  loading,
  loadingDiscovery,
  fetchingDiscovery,
  portfolios,
  accounts,
  discovery,
  clientByExternalId,
  busy,
  revoking,
  onConnect,
  onSwitch,
  onRefresh,
  onRevokeAll,
  onLinkAccount,
  onChanged,
}: {
  brandId: string | null;
  canManage: boolean;
  loading: boolean;
  loadingDiscovery: boolean;
  fetchingDiscovery: boolean;
  portfolios: MetaPortfolioSummary[];
  accounts: Account[];
  discovery: DiscoveredAccountsResult | null | undefined;
  clientByExternalId: Map<string, string>;
  busy: boolean;
  revoking: boolean;
  onConnect: () => void;
  onSwitch: () => void;
  onRefresh: () => void;
  onRevokeAll: () => void;
  onLinkAccount: (a: Account) => void;
  onChanged: () => void;
}) {
  const disconnectFn = useServerFn(disconnectMetaPortfolioFn);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [target, setTarget] = useState<MetaPortfolioSummary | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | PortfolioState>("all");
  const [sort, setSort] = useState<"name" | "status" | "assets">("status");
  const [page, setPage] = useState(1);

  const PAGE_SIZE = 10;

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

  /** Ativos por portfólio (fallback: todos, quando a identidade é legada). */
  const assetsOf = useMemo(() => {
    const anyBusiness = accounts.some((a) => a.businessId);
    return (p: MetaPortfolioSummary) => {
      if (!p.businessId) return anyBusiness ? [] : accounts;
      return accounts.filter((a) => a.businessId === p.businessId);
    };
  }, [accounts]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = portfolios.map((p) => {
      const assets = assetsOf(p);
      return {
        p,
        key: portfolioKey(p),
        name: portfolioName(p),
        state: portfolioState(p),
        pages: assets.filter((a) => a.channel === "facebook").length,
        igs: assets.filter((a) => a.channel === "instagram").length,
        assets,
      };
    });
    const filtered = list.filter((r) => {
      if (statusFilter !== "all" && r.state !== statusFilter) return false;
      if (!q) return true;
      return `${r.name} ${r.p.businessId ?? ""} ${r.p.ownerExternalId ?? ""}`
        .toLowerCase()
        .includes(q);
    });
    return [...filtered].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name, "pt-BR");
      if (sort === "assets") return b.assets.length - a.assets.length;
      return STATE_WEIGHT[a.state] - STATE_WEIGHT[b.state];
    });
  }, [portfolios, assetsOf, search, statusFilter, sort]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = useMemo(
    () => rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [rows, safePage],
  );

  /** Volta para a primeira página sempre que os filtros mudam. */
  const resetPage = () => setPage(1);

  if (loading) {
    return (
      <Card className="space-y-2 p-4">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-9 w-full rounded-lg" />
        ))}
      </Card>
    );
  }

  if (!portfolios.length) {
    return (
      <Card className="flex flex-wrap items-center justify-between gap-3 border-dashed px-3.5 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-medium">
            <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
            Nenhum portfólio Meta autorizado
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Autorize um Business Portfolio para descobrir Páginas, Instagram e contas de Ads.
          </p>
        </div>
        {canManage ? (
          <Button
            size="sm"
            className="h-8 shrink-0 gap-1.5 text-xs"
            disabled={busy}
            onClick={onConnect}
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            Conectar Meta
          </Button>
        ) : null}
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <MetaIssuesAlert
        error={discovery?.error ?? null}
        warnings={discovery?.warnings ?? []}
        restrictedCount={discovery?.warnings?.length ?? 0}
        onRetry={onRefresh}
        retrying={fetchingDiscovery}
      />

      {discovery?.needsAuthorization ? (
        <Card className="flex flex-wrap items-center justify-between gap-3 border-dashed px-3.5 py-2.5">
          <p className="min-w-0 text-[11px] text-muted-foreground">
            Nenhuma autorização válida agora. Refaça o login na Meta mantendo todas as Páginas e
            contas do Instagram marcadas.
          </p>
          {canManage ? (
            <Button size="sm" className="h-7 shrink-0 gap-1.5 text-[11px]" onClick={onConnect}>
              <Plus className="h-3 w-3" />
              Autorizar na Meta
            </Button>
          ) : null}
        </Card>
      ) : null}

      {/* -------------------------------- controles ------------------------------- */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              resetPage();
            }}
            placeholder="Buscar portfólio ou Business ID"
            className="h-9 pl-8 text-xs"
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v as typeof statusFilter);
            resetPage();
          }}
        >
          <SelectTrigger className="h-9 w-[152px] text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">
              Todos os status
            </SelectItem>
            {(["connected", "attention", "error"] as PortfolioState[]).map((s) => (
              <SelectItem key={s} value={s} className="text-xs">
                {STATE_STYLE[s].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={sort}
          onValueChange={(v) => {
            setSort(v as typeof sort);
            resetPage();
          }}
        >
          <SelectTrigger className="h-9 w-[176px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="status" className="text-xs">
              Status (críticos primeiro)
            </SelectItem>
            <SelectItem value="name" className="text-xs">
              Nome (A–Z)
            </SelectItem>
            <SelectItem value="assets" className="text-xs">
              Mais ativos
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="text-[11px] text-muted-foreground">
        {rows.length} de {portfolios.length} portfólio(s)
        {rows.length > PAGE_SIZE ? ` · página ${safePage} de ${pageCount}` : ""}
      </div>

      {/* ---------------------------------- tabela --------------------------------- */}
      {rows.length === 0 ? (
        <Card className="flex flex-col items-start gap-2 border-dashed p-6">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            Nenhum portfólio com esses filtros
          </div>
          <p className="text-xs text-muted-foreground">
            Ajuste a busca ou o status para ver os demais portfólios.
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-8" />
                  <TableHead className="min-w-[220px] text-xs">Portfólio</TableHead>
                  <TableHead className="w-[110px] text-xs">Status</TableHead>
                  <TableHead className="w-[76px] text-center text-xs">Páginas</TableHead>
                  <TableHead className="w-[86px] text-center text-xs">Instagram</TableHead>
                  <TableHead className="w-[64px] text-center text-xs">Ads</TableHead>
                  <TableHead className="w-[96px] text-center text-xs">Clientes</TableHead>
                  <TableHead className="w-[132px] text-xs">Sincronização</TableHead>
                  <TableHead className="w-[150px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const isOpen = expanded === r.key;
                  return (
                    <Fragment key={r.key}>
                      <TableRow
                        className="cursor-pointer"
                        onClick={() => setExpanded(isOpen ? null : r.key)}
                      >
                        <TableCell className="py-2 pr-0">
                          <ChevronRight
                            className={cn(
                              "h-3.5 w-3.5 text-muted-foreground transition-transform",
                              isOpen && "rotate-90",
                            )}
                          />
                        </TableCell>
                        <TableCell className="py-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md border bg-muted/40">
                              <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                            </span>
                            <div className="min-w-0">
                              <div className="truncate text-xs font-medium">{r.name}</div>
                              <div className="truncate font-mono text-[11px] text-muted-foreground">
                                {r.p.businessId
                                  ? `ID ${r.p.businessId}`
                                  : r.p.ownerExternalId
                                    ? `Usuário Meta ${r.p.ownerExternalId}`
                                    : "identidade legada"}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="py-2">
                          <StateBadge state={r.state} />
                        </TableCell>
                        <TableCell className="py-2 text-center text-xs tabular-nums">
                          {r.pages}
                        </TableCell>
                        <TableCell className="py-2 text-center text-xs tabular-nums">
                          {r.igs}
                        </TableCell>
                        <TableCell
                          className="py-2 text-center text-xs text-muted-foreground"
                          title="A descoberta atual não retorna contas de Ads"
                        >
                          —
                        </TableCell>
                        <TableCell className="py-2 text-center text-xs tabular-nums">
                          {r.p.clientCount}
                        </TableCell>
                        <TableCell className="py-2 text-[11px] text-muted-foreground">
                          {formatRelative(discovery?.discoveredAt ?? r.p.connectedAt)}
                        </TableCell>
                        <TableCell className="py-2" onClick={(e) => e.stopPropagation()}>
                          {canManage ? (
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                size="sm"
                                variant="secondary"
                                className="h-7 gap-1.5 px-2 text-[11px]"
                                onClick={() => setExpanded(isOpen ? null : r.key)}
                              >
                                <Settings2 className="h-3 w-3" />
                                Gerenciar
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0"
                                title="Sincronizar"
                                disabled={fetchingDiscovery || !!discovery?.needsAuthorization}
                                onClick={onRefresh}
                              >
                                {fetchingDiscovery ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <RefreshCw className="h-3.5 w-3.5" />
                                )}
                                <span className="sr-only">Sincronizar</span>
                              </Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                                    <MoreHorizontal className="h-3.5 w-3.5" />
                                    <span className="sr-only">Mais ações do portfólio</span>
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-52">
                                  <DropdownMenuItem
                                    className="text-xs"
                                    onClick={onSwitch}
                                    disabled={busy}
                                  >
                                    <RefreshCw className="mr-2 h-3.5 w-3.5" />
                                    Reconectar / trocar portfólio
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className="text-xs"
                                    onClick={onRevokeAll}
                                    disabled={revoking}
                                  >
                                    <Unplug className="mr-2 h-3.5 w-3.5" />
                                    Revogar autorização
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-xs text-destructive focus:text-destructive"
                                    onClick={() => setTarget(r.p)}
                                  >
                                    <Unlink className="mr-2 h-3.5 w-3.5" />
                                    Desconectar portfólio
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          ) : null}
                        </TableCell>
                      </TableRow>

                      {isOpen ? (
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={9} className="bg-muted/20 p-3">
                            {loadingDiscovery ? (
                              <Skeleton className="h-32 w-full rounded-lg" />
                            ) : (
                              <AvailableAccountsTable
                                accounts={r.assets}
                                canManage={canManage}
                                clientByExternalId={clientByExternalId}
                                onLink={onLinkAccount}
                                emptyDescription={`A Meta devolveu ${
                                  discovery?.alreadyLinked ?? 0
                                } conta(s) e todas já existem neste workspace (conectadas ou no histórico). Use “Sincronizar” após alterar permissões na Meta.`}
                                actions={
                                  canManage ? (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-9 gap-1.5 text-xs"
                                      disabled={
                                        fetchingDiscovery || !!discovery?.needsAuthorization
                                      }
                                      onClick={onRefresh}
                                    >
                                      {fetchingDiscovery ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      ) : (
                                        <RefreshCw className="h-3.5 w-3.5" />
                                      )}
                                      Sincronizar
                                    </Button>
                                  ) : null
                                }
                              />
                            )}
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      <AlertDialog open={!!target} onOpenChange={(v) => !v && setTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Desconectar o portfólio {target ? portfolioName(target) : ""}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Os ativos deste portfólio deixarão de estar disponíveis e {target?.channelCount ?? 0}{" "}
              canal(is) param de publicar. Nenhum dado histórico de clientes é apagado — apenas a
              autorização é revogada. Você pode reconectar depois.
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
    </div>
  );
}
