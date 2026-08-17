import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CheckCircle2,
  Facebook,
  Instagram,
  AtSign,
  BarChart3,
  RefreshCw,
  Settings2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import {
  disconnectMeta,
  listMetaConnections,
  refreshMetaConnection,
  startMetaOAuth,
} from "@/lib/meta/meta.functions";
import { MetaPortfolioDialog } from "./meta-portfolio-dialog";

type MetaMetadata = {
  page_picture_url?: string | null;
  instagram_picture_url?: string | null;
  instagram_username?: string | null;
  category?: string | null;
};

function formatSyncedAt(iso: string | null | undefined): string {
  if (!iso) return "nunca";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function MetaIntegrationCard({ brandId }: { brandId: string | null }) {
  const qc = useQueryClient();
  const [connecting, setConnecting] = useState<null | "facebook" | "instagram">(null);
  const [portfolioSessionId, setPortfolioSessionId] = useState<string | null>(null);
  const [portfolioOpen, setPortfolioOpen] = useState(false);
  const [portfolioChannel, setPortfolioChannel] = useState<"facebook" | "instagram" | null>(null);

  const listFn = useServerFn(listMetaConnections);
  const startFn = useServerFn(startMetaOAuth);
  const disconnectFn = useServerFn(disconnectMeta);
  const refreshFn = useServerFn(refreshMetaConnection);

  const { data: connections = [] } = useQuery({
    queryKey: ["meta-connections", brandId],
    queryFn: () => listFn({ data: { brandId: brandId! } }),
    enabled: !!brandId,
  });

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["meta-connections", brandId] });

  const disconnectMut = useMutation({
    mutationFn: (connectionId: string) =>
      disconnectFn({ data: { connectionId, brandId: brandId! } }),
    onSuccess: () => {
      toast.success("Página desconectada");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message ?? "Falha ao desconectar"),
  });

  const refreshMut = useMutation({
    mutationFn: (connectionId: string) =>
      refreshFn({ data: { connectionId, brandId: brandId! } }),
    onSuccess: () => {
      toast.success("Conexão atualizada");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message ?? "Falha ao atualizar"),
  });

  // Listen for popup postMessage.
  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      const d = ev.data as {
        source?: string;
        type?: string;
        scopes?: string[];
        ok?: boolean;
        error?: string;
        message?: string;
        sessionId?: string | null;
        channel?: "facebook" | "instagram" | null;
      };
      if (!d || d.source !== "meta-oauth") return;
      if (d.type === "missing-scopes" && d.scopes && d.scopes.length > 0) {
        toast.warning(
          `Algumas permissões foram negadas (${d.scopes.join(", ")}). Funcionalidades ligadas a elas ficarão limitadas.`,
          { duration: 8000 },
        );
        return;
      }
      setConnecting(null);
      if (d.ok) {
        toast.success(d.message ?? "Meta conectada");
        invalidate();
        if (d.sessionId) {
          setPortfolioSessionId(d.sessionId);
          setPortfolioChannel(d.channel ?? null);
          setPortfolioOpen(true);
        }
      } else if (d.error) {
        toast.error(d.error);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandId]);

  async function handleConnect(source: "facebook" | "instagram") {
    if (!brandId) return;
    // Pre-open synchronously so the browser doesn't block the popup.
    const popup = window.open("", "meta-oauth", "width=640,height=760");
    setConnecting(source);
    try {
      const { authorizeUrl } = await startFn({
        data: { brandId, channel: source, forceReauth: true },
      });
      if (popup) popup.location.href = authorizeUrl;
      else window.location.href = authorizeUrl;
    } catch (e) {
      setConnecting(null);
      popup?.close();
      toast.error(e instanceof Error ? e.message : "Falha ao iniciar OAuth");
    }
  }

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div>
          <CardTitle className="text-sm">Meta · Facebook & Instagram</CardTitle>
          <CardDescription className="text-xs">
            Um único login captura todo o seu portfólio. Em seguida escolha
            quais Páginas e Contas do Instagram vincular a este projeto.
          </CardDescription>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button
            size="sm"
            variant="outline"
            className="justify-start gap-2 border-[#1877F2]/40 text-[#1877F2] hover:bg-[#1877F2]/10 hover:text-[#1877F2]"
            onClick={() => handleConnect("facebook")}
            disabled={!brandId || connecting !== null}
          >
            <Facebook className="h-3.5 w-3.5" />
            {connecting === "facebook" ? "Conectando…" : "Conectar Facebook"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="justify-start gap-2 border-[#DD2A7B]/40 text-[#DD2A7B] hover:bg-[#DD2A7B]/10 hover:text-[#DD2A7B]"
            onClick={() => handleConnect("instagram")}
            disabled={!brandId || connecting !== null}
          >
            <Instagram className="h-3.5 w-3.5" />
            {connecting === "instagram" ? "Conectando…" : "Conectar Instagram"}
          </Button>
        </div>
        {portfolioSessionId && (
          <Button
            size="sm"
            variant="ghost"
            className="justify-start gap-2 text-xs"
            onClick={() => setPortfolioOpen(true)}
          >
            <Settings2 className="h-3.5 w-3.5" />
            Gerenciar contas do último login
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {connections.length === 0 ? (
          <p className="rounded-md border border-dashed border-border/60 p-4 text-center text-xs text-muted-foreground">
            Nenhuma conta conectada ainda. Autorize o acesso para publicar e ler
            insights de Facebook, Instagram, Threads e Meta Ads.
          </p>
        ) : (
          <ul className="space-y-2">
            {connections.map((c) => {
              const meta = (c.metadata ?? {}) as MetaMetadata;
              const pagePic = meta.page_picture_url ?? undefined;
              const igPic = meta.instagram_picture_url ?? undefined;
              const igUsername = c.accountUsername ?? meta.instagram_username ?? null;
              const isActive = c.status === "active";
              const isRefreshing =
                refreshMut.isPending && refreshMut.variables === c.id;
              const isDisconnecting =
                disconnectMut.isPending && disconnectMut.variables === c.id;
              const channel = (c as unknown as { channel?: string }).channel ?? "facebook";
              const ChannelIcon =
                channel === "instagram"
                  ? Instagram
                  : channel === "threads"
                    ? AtSign
                    : channel === "ads"
                      ? BarChart3
                      : Facebook;
              const iconClass =
                channel === "instagram"
                  ? "bg-gradient-to-tr from-[#F58529] via-[#DD2A7B] to-[#8134AF] text-white"
                  : channel === "threads"
                    ? "bg-foreground/10 text-foreground"
                    : channel === "ads"
                      ? "bg-blue-500/10 text-blue-500"
                      : "bg-[#1877F2]/10 text-[#1877F2]";
              return (
                <li
                  key={c.id}
                  className="rounded-lg border border-border/60 bg-card/50 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarImage
                          src={channel === "instagram" ? igPic : pagePic}
                          alt={c.externalName ?? ""}
                        />
                        <AvatarFallback className={iconClass}>
                          <ChannelIcon className="h-4 w-4" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">
                            {c.externalName ?? c.externalId}
                          </span>
                          <Badge variant="outline" className="h-5 px-1.5 text-[10px] capitalize">
                            {channel}
                          </Badge>
                          {isActive ? (
                            <Badge
                              variant="outline"
                              className="h-5 gap-1 border-emerald-500/30 bg-emerald-500/10 px-1.5 text-[10px] text-emerald-600 dark:text-emerald-400"
                            >
                              <CheckCircle2 className="h-3 w-3" />
                              Conectado
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
                              {c.status}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                          {channel === "instagram" && igUsername ? (
                            <span className="flex items-center gap-1.5">
                              <Avatar className="h-4 w-4">
                                <AvatarImage src={igPic} alt={igUsername} />
                                <AvatarFallback className="bg-gradient-to-tr from-[#F58529] via-[#DD2A7B] to-[#8134AF] text-[8px] text-white">
                                  <Instagram className="h-2.5 w-2.5" />
                                </AvatarFallback>
                              </Avatar>
                              @{igUsername}
                            </span>
                          ) : channel === "facebook" && igUsername ? (
                            <span className="text-muted-foreground">
                              + Instagram @{igUsername}
                            </span>
                          ) : channel === "ads" ? (
                            <span>Meta Ads · pronto para insights e sync</span>
                          ) : channel === "threads" ? (
                            <span>Threads · pronto para publicação e insights</span>
                          ) : (
                            <span className="text-amber-600">sem Instagram Business</span>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          Última sincronização: {formatSyncedAt(c.updatedAt)}
                        </p>
                        {c.lastError && (
                          <p className="truncate text-[10px] text-destructive" title={c.lastError}>
                            {c.lastError}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 gap-1 px-2 text-[11px]"
                        disabled={isRefreshing}
                        onClick={() => refreshMut.mutate(c.id)}
                      >
                        <RefreshCw
                          className={`h-3 w-3 ${isRefreshing ? "animate-spin" : ""}`}
                        />
                        Reconectar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 gap-1 px-2 text-[11px] text-destructive hover:text-destructive"
                        disabled={isDisconnecting}
                        onClick={() => disconnectMut.mutate(c.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                        Desconectar
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
      {brandId && (
        <MetaPortfolioDialog
          brandId={brandId}
          sessionId={portfolioSessionId}
          open={portfolioOpen}
          channel={portfolioChannel}
          onOpenChange={setPortfolioOpen}
        />
      )}
    </Card>
  );
}