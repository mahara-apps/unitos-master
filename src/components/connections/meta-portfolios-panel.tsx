import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  Building2,
  ChevronDown,
  Facebook,
  Instagram,
  Link2,
  Loader2,
  Megaphone,
  MoreHorizontal,
  Plus,
  RefreshCw,
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { AvailableAccountsTable } from "@/components/connections/available-accounts-table";
import { formatRelative } from "@/components/connections/channel-meta";
import type { MetaPortfolioSummary } from "@/lib/meta/authorization-state";
import type { DiscoveredAccountsResult } from "@/lib/meta/discovery.functions";
import { disconnectMetaPortfolioFn } from "@/lib/meta/meta.functions";
import { cn } from "@/lib/utils";

/**
 * Painel secundário "Portfólios Meta e ativos disponíveis".
 *
 * Camada 100% de apresentação: recebe portfólios (autorização) e os ativos que
 * a descoberta atual devolveu, e apenas organiza a leitura em cards compactos +
 * drawer de gerenciamento. Nenhuma regra de OAuth, descoberta, vínculo ou
 * revogação vive aqui — as ações reaproveitam os callbacks e server functions
 * existentes.
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

const STATE_STYLE: Record<PortfolioState, { label: string; className: string }> = {
  connected: {
    label: "Conectado",
    className: "border-health-good/30 bg-health-good/10 text-health-good",
  },
  attention: {
    label: "Atenção",
    className: "border-severity-warning/30 bg-severity-warning/10 text-severity-warning",
  },
  error: {
    label: "Erro",
    className: "border-severity-critical/30 bg-severity-critical/10 text-severity-critical",
  },
};

function StateBadge({ state }: { state: PortfolioState }) {
  const m = STATE_STYLE[state];
  return (
    <Badge
      variant="outline"
      className={cn("h-5 shrink-0 gap-1 px-1.5 text-[11px] font-medium", m.className)}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {m.label}
    </Badge>
  );
}

function Metric({
  icon: Icon,
  value,
  label,
  tone,
}: {
  icon: typeof Facebook;
  value: number;
  label: string;
  tone?: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-1.5" title={`${value} ${label}`}>
      <Icon className={cn("h-3.5 w-3.5 shrink-0", tone ?? "text-muted-foreground")} />
      <span className="text-xs font-semibold tabular-nums">{value}</span>
      <span className="truncate text-[11px] text-muted-foreground">{label}</span>
    </div>
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
  const [manageKey, setManageKey] = useState<string | null>(null);
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

  /** Ativos por portfólio (fallback: todos, quando a identidade é legada). */
  const assetsOf = useMemo(() => {
    const anyBusiness = accounts.some((a) => a.businessId);
    return (p: MetaPortfolioSummary) => {
      if (!p.businessId) return anyBusiness ? [] : accounts;
      return accounts.filter((a) => a.businessId === p.businessId);
    };
  }, [accounts]);

  const managed = portfolios.find((p) => portfolioKey(p) === manageKey) ?? null;
  const managedAssets = managed ? assetsOf(managed) : [];

  if (loading) {
    return (
      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
      </div>
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
    <div className="space-y-2.5">
      <MetaIssuesAlert
        error={discovery?.error ?? null}
        warnings={discovery?.warnings ?? []}
        restrictedCount={discovery?.warnings?.length ? accounts.length : 0}
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

      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {portfolios.map((p) => {
          const assets = assetsOf(p);
          const pages = assets.filter((a) => a.channel === "facebook").length;
          const igs = assets.filter((a) => a.channel === "instagram").length;
          const state = portfolioState(p);
          return (
            <Card key={portfolioKey(p)} className="flex flex-col gap-2.5 p-3">
              <div className="flex min-w-0 items-start gap-2.5">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border bg-muted/40">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-semibold">{portfolioName(p)}</span>
                    <StateBadge state={state} />
                  </div>
                  <div className="truncate font-mono text-[10px] text-muted-foreground">
                    {p.businessId
                      ? `ID ${p.businessId}`
                      : p.ownerExternalId
                        ? `Usuário Meta ${p.ownerExternalId}`
                        : "identidade legada"}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                <Metric icon={Facebook} value={pages} label="páginas" tone="text-sky-600" />
                <Metric icon={Instagram} value={igs} label="Instagram" tone="text-pink-500" />
                <Metric icon={Megaphone} value={0} label="Ads" />
                <Metric icon={Link2} value={p.channelCount} label="vinculados" />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2">
                <span className="truncate text-[10px] text-muted-foreground">
                  Sincronizado {formatRelative(discovery?.discoveredAt ?? p.connectedAt)}
                </span>
                {canManage ? (
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-7 gap-1.5 px-2 text-[11px]"
                      onClick={() => setManageKey(portfolioKey(p))}
                    >
                      <Settings2 className="h-3 w-3" />
                      Gerenciar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 gap-1.5 px-2 text-[11px]"
                      disabled={fetchingDiscovery || !!discovery?.needsAuthorization}
                      onClick={onRefresh}
                    >
                      {fetchingDiscovery ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3 w-3" />
                      )}
                      Sincronizar
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                          <MoreHorizontal className="h-3.5 w-3.5" />
                          <span className="sr-only">Mais ações do portfólio</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52">
                        <DropdownMenuItem className="text-xs" onClick={onSwitch} disabled={busy}>
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
                          onClick={() => setTarget(p)}
                        >
                          <Unlink className="mr-2 h-3.5 w-3.5" />
                          Desconectar portfólio
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ) : null}
              </div>
            </Card>
          );
        })}
      </div>

      {/* ------------------------- drawer de ativos ------------------------- */}
      <Dialog open={!!managed} onOpenChange={(v) => !v && setManageKey(null)}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle className="text-base">
              Ativos de {managed ? portfolioName(managed) : ""}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Contas devolvidas pela Meta neste portfólio e ainda não vinculadas. Use a busca e os
              filtros para encontrar o ativo e vincular ao cliente.
            </DialogDescription>
          </DialogHeader>

          {loadingDiscovery ? (
            <Skeleton className="h-48 w-full rounded-xl" />
          ) : (
            <AvailableAccountsTable
              accounts={managedAssets}
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
                    disabled={fetchingDiscovery || !!discovery?.needsAuthorization}
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
        </DialogContent>
      </Dialog>

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
