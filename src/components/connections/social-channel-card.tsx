import { useEffect, useMemo, useState, type ComponentType } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, Plus, RefreshCw, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { DashboardPanelSurface } from "@/components/ui/dashboard-primitives";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

import {
  disconnectMeta,
  refreshMetaConnection,
  startMetaOAuth,
} from "@/lib/meta/meta.functions";
import { upsertChannel } from "@/lib/connections.functions";

export type SocialAccount = {
  id: string;
  name: string;
  handle?: string | null;
  avatarUrl?: string | null;
  updatedAt?: string | null;
  status?: "active" | "attention" | "disconnected" | string;
  lastError?: string | null;
};

export type SocialChannelDef = {
  id:
    | "instagram"
    | "facebook"
    | "tiktok"
    | "youtube"
    | "linkedin"
    | "twitter"
    | "threads";
  name: string;
  hint: string;
  icon: ComponentType<{ className?: string }>;
  tone: string;
  handleLabel: string;
  handlePlaceholder: string;
};

type Kind = "meta" | "manual";

function fmtSync(iso: string | null | undefined): string {
  if (!iso) return "nunca";
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ptBR });
  } catch {
    return "—";
  }
}

function overallStatus(accounts: SocialAccount[]): "connected" | "attention" | "disconnected" {
  if (accounts.length === 0) return "disconnected";
  const anyErr = accounts.some((a) => a.status && a.status !== "active");
  return anyErr ? "attention" : "connected";
}

function StatusPill({
  status,
  count,
}: {
  status: "connected" | "attention" | "disconnected";
  count: number;
}) {
  if (status === "connected") {
    return (
      <Badge
        variant="outline"
        className="border-emerald-500/30 bg-emerald-500/10 font-mono text-[10px] text-emerald-700 dark:text-emerald-300"
      >
        <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
        {count} {count === 1 ? "conta" : "contas"}
      </Badge>
    );
  }
  if (status === "attention") {
    return (
      <Badge
        variant="outline"
        className="border-amber-500/40 bg-amber-500/10 font-mono text-[10px] text-amber-700 dark:text-amber-300"
      >
        <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
        Atenção · {count}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground">
      <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
      Desconectado
    </Badge>
  );
}

export function SocialChannelCard({
  channel,
  accounts,
  brandId,
  brandLabel,
  onChanged,
}: {
  channel: SocialChannelDef;
  accounts: SocialAccount[];
  brandId: string;
  brandLabel: string;
  onChanged: () => void;
}) {
  const kind: Kind = channel.id === "instagram" || channel.id === "facebook" ? "meta" : "manual";
  const Icon = channel.icon;
  const status = overallStatus(accounts);
  const primary = accounts[0];
  const [sheetOpen, setSheetOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);

  return (
    <DashboardPanelSurface className="p-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "grid h-10 w-10 place-items-center rounded-lg border border-border/60 bg-background/60",
              channel.tone,
            )}
          >
            <Icon className="h-5 w-5" />
          </span>
          <div>
            <div className="text-sm font-semibold">{channel.name}</div>
            <div className="font-mono text-[10px] text-muted-foreground">{channel.hint}</div>
          </div>
        </div>
        <StatusPill status={status} count={accounts.length} />
      </div>

      <div className="mt-4 min-h-[54px] rounded-lg border border-border/60 bg-background/60 p-3">
        {primary ? (
          <div className="flex items-start gap-2">
            <Avatar className="h-8 w-8">
              <AvatarImage src={primary.avatarUrl ?? undefined} alt={primary.name} />
              <AvatarFallback className={cn("text-[10px]", channel.tone)}>
                <Icon className="h-3.5 w-3.5" />
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium">
                {primary.name}
                {accounts.length > 1 && (
                  <span className="ml-1 text-muted-foreground">
                    +{accounts.length - 1}
                  </span>
                )}
              </div>
              <div className="truncate font-mono text-[10px] text-muted-foreground">
                {brandLabel} · sync {fmtSync(primary.updatedAt)}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-center font-mono text-[10px] text-muted-foreground">
            Nenhuma conta conectada
          </div>
        )}
      </div>

      <Separator className="my-4" />

      <div className="flex gap-2">
        {accounts.length === 0 ? (
          <ConnectButton
            kind={kind}
            channel={channel}
            brandId={brandId}
            manualOpen={manualOpen}
            setManualOpen={setManualOpen}
            onChanged={onChanged}
          />
        ) : (
          <>
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={() => setSheetOpen(true)}
            >
              Gerenciar
            </Button>
            <ConnectButton
              kind={kind}
              channel={channel}
              brandId={brandId}
              manualOpen={manualOpen}
              setManualOpen={setManualOpen}
              onChanged={onChanged}
              iconOnly
            />
          </>
        )}
      </div>

      <ManageSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        channel={channel}
        kind={kind}
        accounts={accounts}
        brandId={brandId}
        brandLabel={brandLabel}
        onChanged={onChanged}
        onAddNew={() => {
          setSheetOpen(false);
          setManualOpen(true);
        }}
      />
    </DashboardPanelSurface>
  );
}

function ConnectButton({
  kind,
  channel,
  brandId,
  hasExisting,
  existingLabel,
  manualOpen,
  setManualOpen,
  onChanged,
  iconOnly,
}: {
  kind: Kind;
  channel: SocialChannelDef;
  brandId: string;
  hasExisting: boolean;
  existingLabel?: string | null;
  manualOpen: boolean;
  setManualOpen: (v: boolean) => void;
  onChanged: () => void;
  iconOnly?: boolean;
}) {
  const qc = useQueryClient();
  const startFn = useServerFn(startMetaOAuth);
  const [connecting, setConnecting] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);

  // Listen for Meta OAuth popup postMessage.
  useEffect(() => {
    if (kind !== "meta") return;
    function onMsg(ev: MessageEvent) {
      const d = ev.data as { source?: string; ok?: boolean; error?: string; message?: string };
      if (!d || d.source !== "meta-oauth") return;
      setConnecting(false);
      if (d.ok) {
        toast.success(d.message ?? "Meta conectada");
        qc.invalidateQueries({ queryKey: ["meta-connections", brandId] });
        onChanged();
      } else if (d.error) {
        toast.error(d.error);
      }
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [kind, brandId, qc, onChanged]);

  async function handleMetaConnect() {
    const popup = window.open("", "meta-oauth", "width=640,height=760");
    setConnecting(true);
    try {
      const { authorizeUrl } = await startFn({ data: { brandId } });
      if (popup) popup.location.href = authorizeUrl;
      else window.location.href = authorizeUrl;
    } catch (e) {
      setConnecting(false);
      popup?.close();
      toast.error(e instanceof Error ? e.message : "Falha ao iniciar OAuth");
    }
  }

  const label = connecting ? "Conectando…" : iconOnly ? "" : "Conectar";

  return (
    <>
      <Button
        size="sm"
        variant={iconOnly ? "ghost" : "default"}
        className={iconOnly ? "" : "flex-1"}
        disabled={connecting}
        onClick={() => {
          if (kind === "meta") {
            if (hasExisting) setReplaceOpen(true);
            else handleMetaConnect();
          } else setManualOpen(true);
        }}
        title={iconOnly ? "Adicionar conta" : undefined}
      >
        {iconOnly ? <Plus className="h-4 w-4" /> : label}
        {!iconOnly && !connecting ? null : null}
      </Button>

      {kind === "manual" && (
        <ManualConnectDialog
          open={manualOpen}
          onOpenChange={setManualOpen}
          channel={channel}
          brandId={brandId}
          onChanged={onChanged}
        />
      )}

      <Dialog open={replaceOpen} onOpenChange={setReplaceOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Substituir conexão de {channel.name}?</DialogTitle>
            <DialogDescription>
              Já existe uma conta ativa deste canal para esta marca
              {existingLabel ? ` (${existingLabel})` : ""}. Continuar irá
              substituir a conexão existente pela nova conta autorizada.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReplaceOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                setReplaceOpen(false);
                handleMetaConnect();
              }}
            >
              Substituir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ManualConnectDialog({
  open,
  onOpenChange,
  channel,
  brandId,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  channel: SocialChannelDef;
  brandId: string;
  onChanged: () => void;
}) {
  const [handle, setHandle] = useState("");
  const fn = useServerFn(upsertChannel);
  const saveMut = useMutation({
    mutationFn: () =>
      fn({ data: { brandId, channel: channel.id, handle: handle.trim(), connected: true } }),
    onSuccess: () => {
      toast.success(`${channel.name} conectado`);
      onOpenChange(false);
      setHandle("");
      onChanged();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Falha ao salvar"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Conectar {channel.name}</DialogTitle>
          <DialogDescription>
            Informe o identificador da conta para exibir na página de conexões.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor={`handle-${channel.id}`}>{channel.handleLabel}</Label>
          <Input
            id={`handle-${channel.id}`}
            placeholder={channel.handlePlaceholder}
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending || handle.trim().length === 0}
          >
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ManageSheet({
  open,
  onOpenChange,
  channel,
  kind,
  accounts,
  brandId,
  brandLabel,
  onChanged,
  onAddNew,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  channel: SocialChannelDef;
  kind: Kind;
  accounts: SocialAccount[];
  brandId: string;
  brandLabel: string;
  onChanged: () => void;
  onAddNew: () => void;
}) {
  const qc = useQueryClient();
  const Icon = channel.icon;

  const refreshFn = useServerFn(refreshMetaConnection);
  const disconnectMetaFn = useServerFn(disconnectMeta);
  const upsertFn = useServerFn(upsertChannel);

  const invalidateMeta = () =>
    qc.invalidateQueries({ queryKey: ["meta-connections", brandId] });

  const refreshMut = useMutation({
    mutationFn: (id: string) => refreshFn({ data: { connectionId: id, brandId } }),
    onSuccess: () => {
      toast.success("Conexão atualizada");
      invalidateMeta();
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message ?? "Falha ao atualizar"),
  });

  const disconnectMut = useMutation({
    mutationFn: async (acc: SocialAccount) => {
      if (kind === "meta") {
        await disconnectMetaFn({ data: { connectionId: acc.id, brandId } });
      } else {
        await upsertFn({ data: { brandId, channel: channel.id, connected: false } });
      }
    },
    onSuccess: () => {
      toast.success("Conta desconectada");
      invalidateMeta();
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message ?? "Falha ao desconectar"),
  });

  const startOAuthFn = useServerFn(startMetaOAuth);
  async function handleAddMeta() {
    const popup = window.open("", "meta-oauth", "width=640,height=760");
    try {
      const { authorizeUrl } = await startOAuthFn({ data: { brandId } });
      if (popup) popup.location.href = authorizeUrl;
    } catch (e) {
      popup?.close();
      toast.error(e instanceof Error ? e.message : "Falha ao iniciar OAuth");
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <span
              className={cn(
                "grid h-8 w-8 place-items-center rounded-md border border-border/60 bg-background/60",
                channel.tone,
              )}
            >
              <Icon className="h-4 w-4" />
            </span>
            {channel.name}
          </SheetTitle>
          <SheetDescription>
            Contas de {channel.name} vinculadas ao workspace <b>{brandLabel}</b>.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-2">
          {accounts.length === 0 ? (
            <p className="rounded-md border border-dashed border-border/60 p-6 text-center text-xs text-muted-foreground">
              Nenhuma conta conectada.
            </p>
          ) : (
            accounts.map((acc) => {
              const isRefreshing = refreshMut.isPending && refreshMut.variables === acc.id;
              const isDisconnecting =
                disconnectMut.isPending && (disconnectMut.variables as SocialAccount)?.id === acc.id;
              const active = !acc.status || acc.status === "active";
              return (
                <div
                  key={acc.id}
                  className="rounded-lg border border-border/60 bg-card/50 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={acc.avatarUrl ?? undefined} alt={acc.name} />
                        <AvatarFallback className={cn(channel.tone)}>
                          <Icon className="h-4 w-4" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">{acc.name}</span>
                          {active ? (
                            <Badge
                              variant="outline"
                              className="h-5 gap-1 border-emerald-500/30 bg-emerald-500/10 px-1.5 text-[10px] text-emerald-600 dark:text-emerald-400"
                            >
                              <CheckCircle2 className="h-3 w-3" /> Conectado
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
                              {acc.status}
                            </Badge>
                          )}
                        </div>
                        {acc.handle && (
                          <div className="truncate text-[11px] text-muted-foreground">
                            {acc.handle}
                          </div>
                        )}
                        <p className="text-[10px] text-muted-foreground">
                          Última sincronização: {fmtSync(acc.updatedAt)}
                        </p>
                        {acc.lastError && (
                          <p
                            className="truncate text-[10px] text-destructive"
                            title={acc.lastError}
                          >
                            {acc.lastError}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {kind === "meta" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 gap-1 px-2 text-[11px]"
                          disabled={isRefreshing}
                          onClick={() => refreshMut.mutate(acc.id)}
                        >
                          <RefreshCw
                            className={`h-3 w-3 ${isRefreshing ? "animate-spin" : ""}`}
                          />
                          Reconectar
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 gap-1 px-2 text-[11px] text-destructive hover:text-destructive"
                        disabled={isDisconnecting}
                        onClick={() => disconnectMut.mutate(acc)}
                      >
                        <Trash2 className="h-3 w-3" />
                        Desconectar
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <Separator className="my-4" />
        <Button
          className="w-full"
          variant="outline"
          onClick={() => {
            if (kind === "meta") handleAddMeta();
            else onAddNew();
          }}
        >
          <Plus className="mr-2 h-4 w-4" /> Adicionar conta
        </Button>
      </SheetContent>
    </Sheet>
  );
}