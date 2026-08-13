import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Link2, Loader2, Plus, RefreshCw, Settings2, Trash2, Users } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { MetaPortfolioDialog } from "@/components/connections/meta-portfolio-dialog";
import {
  CONNECTABLE_CHANNELS,
  UPCOMING_CHANNELS,
  channelDef,
  formatRelative,
  normalizeStatus,
  StatusDot,
} from "@/components/connections/channel-meta";
import {
  listWorkspaceChannelsFn,
  type WorkspaceChannel,
} from "@/lib/client-channels.functions";
import {
  disconnectMeta,
  getActiveMetaSession,
  refreshMetaConnection,
  startMetaOAuth,
} from "@/lib/meta/meta.functions";

/**
 * Canais conectados no NÍVEL DO WORKSPACE (social_connections) + fluxo de
 * conexão de novo canal + drawer de gerenciamento.
 *
 * Os clientes exibidos vêm do vínculo `client_social_accounts` (fonte de
 * verdade). Esta tela não cria vínculos — isso acontece no perfil do cliente.
 */
export function ConnectedChannelsSection({
  brandId,
  canManage,
}: {
  brandId: string | null;
  canManage: boolean;
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(listWorkspaceChannelsFn);
  const startMetaFn = useServerFn(startMetaOAuth);
  const sessionFn = useServerFn(getActiveMetaSession);

  const [connectOpen, setConnectOpen] = useState(false);
  const [connecting, setConnecting] = useState<null | "facebook" | "instagram">(null);
  const [portfolioSessionId, setPortfolioSessionId] = useState<string | null>(null);
  const [portfolioOpen, setPortfolioOpen] = useState(false);
  const [portfolioChannel, setPortfolioChannel] = useState<"facebook" | "instagram" | null>(null);
  const [manage, setManage] = useState<WorkspaceChannel | null>(null);

  const queryKey = ["workspace-channels", brandId] as const;
  const { data = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => listFn({ data: { brandId: brandId! } }),
    enabled: !!brandId,
    staleTime: 30_000,
  });

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
        toast.warning(`Permissões negadas: ${d.scopes.join(", ")}.`, { duration: 8000 });
        return;
      }
      setConnecting(null);
      if (d.ok && d.sessionId) {
        toast.success(d.message ?? "Meta conectada");
        setConnectOpen(false);
        setPortfolioSessionId(d.sessionId);
        setPortfolioChannel(d.channel ?? null);
        setPortfolioOpen(true);
      } else if (d.error) {
        toast.error(d.error);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  async function connectMeta(channel: "facebook" | "instagram") {
    if (!brandId) return;
    setConnecting(channel);
    try {
      const existing = await sessionFn({ data: { brandId } });
      if (existing.sessionId) {
        setConnectOpen(false);
        setPortfolioSessionId(existing.sessionId);
        setPortfolioChannel(channel);
        setPortfolioOpen(true);
        setConnecting(null);
        return;
      }
    } catch {
      // segue para o OAuth
    }
    const popup = window.open(
      "",
      "meta-oauth",
      "width=760,height=820,resizable=yes,scrollbars=yes",
    );
    try {
      const { authorizeUrl } = await startMetaFn({ data: { brandId, channel } });
      if (popup) popup.location.href = authorizeUrl;
      else window.location.href = authorizeUrl;
    } catch (e) {
      setConnecting(null);
      popup?.close();
      toast.error(e instanceof Error ? e.message : "Falha ao iniciar OAuth da Meta");
    }
  }

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["workspace-channels", brandId] });
    qc.invalidateQueries({ queryKey: ["meta-connections", brandId] });
    qc.invalidateQueries({ queryKey: ["connections", brandId] });
  };

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">
          {data.length
            ? `${data.length} ${data.length === 1 ? "canal conectado" : "canais conectados"}`
            : "Nenhum canal conectado"}
        </div>
        {canManage ? (
          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setConnectOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            Conectar canal
          </Button>
        ) : null}
      </div>

      {isLoading ? (
        <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[104px] w-full rounded-xl" />
          ))}
        </div>
      ) : data.length === 0 ? (
        <Card className="flex flex-col items-start gap-2 border-dashed p-5">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Link2 className="h-4 w-4 text-muted-foreground" />
            Nenhum canal conectado
          </div>
          <p className="text-xs text-muted-foreground">
            Conecte uma conta Meta para publicar e medir resultados. Depois vincule
            o canal aos clientes no perfil de cada cliente.
          </p>
          {canManage ? (
            <Button size="sm" className="mt-1 h-8 gap-1.5 text-xs" onClick={() => setConnectOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              Conectar canal
            </Button>
          ) : null}
        </Card>
      ) : (
        <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
          {data.map((c) => (
            <ChannelCard key={c.connectionId} row={c} onManage={() => setManage(c)} />
          ))}
        </div>
      )}

      {/* Conectar canal */}
      <Dialog open={connectOpen} onOpenChange={setConnectOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Conectar canal</DialogTitle>
            <DialogDescription className="text-xs">
              A conexão é do workspace. O vínculo com clientes é feito depois, no
              perfil de cada cliente.
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
                  <Icon className={`h-4 w-4 ${def.tone}`} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{def.label}</div>
                    <div className="text-xs text-muted-foreground">Meta · OAuth</div>
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

      <ManageChannelSheet
        row={manage}
        brandId={brandId}
        canManage={canManage}
        onOpenChange={(v) => !v && setManage(null)}
        onChanged={invalidate}
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */

function ChannelCard({
  row,
  onManage,
}: {
  row: WorkspaceChannel;
  onManage: () => void;
}) {
  const def = channelDef(row.channel);
  const Icon = def.icon;
  const status = normalizeStatus(row.status);

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
            <Icon className={`h-3.5 w-3.5 shrink-0 ${def.tone}`} />
            <span className="truncate text-sm font-medium">{def.label}</span>
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {row.handle ? `@${row.handle.replace(/^@/, "")}` : row.accountLabel}
          </p>
        </div>
        <StatusDot status={status} className="shrink-0" />
      </div>

      <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
        <Users className="h-3.5 w-3.5 shrink-0" />
        {row.clients.length === 0 ? (
          <span>Sem cliente vinculado</span>
        ) : row.clients.length === 1 ? (
          <span className="truncate">Vinculado a {row.clients[0]!.name}</span>
        ) : (
          <span className="truncate">Vinculado a {row.clients.length} clientes</span>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t pt-2.5">
        <span className="truncate text-[11px] text-muted-foreground">
          Sincronizado {formatRelative(row.lastSyncedAt)}
        </span>
        <Button size="sm" variant="ghost" className="h-7 gap-1.5 px-2 text-xs" onClick={onManage}>
          <Settings2 className="h-3.5 w-3.5" />
          Gerenciar
        </Button>
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

function ManageChannelSheet({
  row,
  brandId,
  canManage,
  onOpenChange,
  onChanged,
}: {
  row: WorkspaceChannel | null;
  brandId: string | null;
  canManage: boolean;
  onOpenChange: (v: boolean) => void;
  onChanged: () => void;
}) {
  const refreshFn = useServerFn(refreshMetaConnection);
  const disconnectFn = useServerFn(disconnectMeta);

  const refreshMut = useMutation({
    mutationFn: () =>
      refreshFn({ data: { brandId: brandId!, connectionId: row!.connectionId } }),
    onSuccess: () => {
      toast.success("Conexão reconectada");
      onChanged();
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Falha ao reconectar"),
  });

  const disconnectMut = useMutation({
    mutationFn: () =>
      disconnectFn({ data: { brandId: brandId!, connectionId: row!.connectionId } }),
    onSuccess: () => {
      toast.success("Canal desconectado");
      onOpenChange(false);
      onChanged();
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Falha ao desconectar"),
  });

  if (!row) return null;
  const def = channelDef(row.channel);
  const Icon = def.icon;
  const status = normalizeStatus(row.status);

  return (
    <Sheet open={!!row} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader className="space-y-0 pb-2">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Icon className={`h-4 w-4 ${def.tone}`} />
            {def.label}
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-5 pt-2">
          <div className="flex items-center gap-3">
            <Avatar className="h-11 w-11">
              <AvatarImage src={row.avatarUrl ?? undefined} alt={row.accountLabel} />
              <AvatarFallback className="text-xs uppercase">
                {row.channel.slice(0, 2)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{row.accountLabel}</p>
              <p className="truncate text-xs text-muted-foreground">
                {row.handle ? `@${row.handle.replace(/^@/, "")}` : "—"}
              </p>
              <StatusDot status={status} className="mt-0.5" />
            </div>
          </div>

          <Field label="Última sincronização" value={formatRelative(row.lastSyncedAt)} />
          {row.lastError ? (
            <Field label="Último erro" value={row.lastError} />
          ) : null}

          <div className="space-y-1.5">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Clientes vinculados
            </p>
            {row.clients.length ? (
              <div className="flex flex-wrap gap-1.5">
                {row.clients.map((c) => (
                  <Badge key={c.id} variant="secondary" className="text-[11px]">
                    {c.name}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Nenhum cliente. Vincule no perfil do cliente &gt; Canais.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Permissões
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
              <p className="text-xs text-muted-foreground">Não informadas.</p>
            )}
          </div>

          {canManage ? (
            <div className="space-y-1.5 rounded-lg border bg-muted/30 p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Identificadores oficiais
              </p>
              <IdRow label="Page ID" value={row.pageId ?? row.externalId} />
              <IdRow label="Instagram Business ID" value={row.instagramBusinessId} />
              <IdRow label="Connection ID" value={row.connectionId} />
            </div>
          ) : null}

          {canManage ? (
            <div className="flex flex-wrap gap-2 border-t pt-4">
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 text-xs"
                disabled={refreshMut.isPending}
                onClick={() => refreshMut.mutate()}
              >
                {refreshMut.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                Reconectar
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 gap-1.5 text-xs text-destructive hover:text-destructive"
                disabled={disconnectMut.isPending}
                onClick={() => disconnectMut.mutate()}
              >
                {disconnectMut.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                Desconectar
              </Button>
            </div>
          ) : (
            <p className="border-t pt-4 text-xs text-muted-foreground">
              Somente owner, manager ou super admin podem reconectar ou
              desconectar canais.
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm">{value}</p>
    </div>
  );
}

function IdRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate font-mono text-[11px]">{value ?? "—"}</span>
    </div>
  );
}
