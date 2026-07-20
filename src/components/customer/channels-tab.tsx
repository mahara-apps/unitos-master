import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Facebook,
  Instagram,
  Loader2,
  Plus,
  Radio,
  Music2,
  Youtube,
  Linkedin,
  Twitter,
  AtSign,
  Lock,
  type LucideIcon,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { MetaPortfolioDialog } from "@/components/connections/meta-portfolio-dialog";
import { getActiveMetaSession, startMetaOAuth } from "@/lib/meta/meta.functions";
import {
  listClientChannelAssignmentsFn,
  toggleClientChannelFn,
  type ClientChannelRow,
} from "@/lib/client-channels.functions";

type ChannelKey =
  | "instagram"
  | "facebook"
  | "tiktok"
  | "youtube"
  | "linkedin"
  | "twitter"
  | "threads";

type ChannelDef = {
  key: ChannelKey;
  label: string;
  icon: LucideIcon;
  tone: string;
  /** true = OAuth já implementado (Meta). false = placeholder "em breve". */
  available: boolean;
  /** Fluxo de conexão do provider (só para available=true). */
  provider?: "meta";
};

const CHANNELS: ChannelDef[] = [
  { key: "instagram", label: "Instagram", icon: Instagram, tone: "text-pink-500", available: true, provider: "meta" },
  { key: "facebook", label: "Facebook", icon: Facebook, tone: "text-sky-600", available: true, provider: "meta" },
  { key: "tiktok", label: "TikTok", icon: Music2, tone: "text-foreground", available: false },
  { key: "linkedin", label: "LinkedIn", icon: Linkedin, tone: "text-sky-700", available: false },
  { key: "youtube", label: "YouTube", icon: Youtube, tone: "text-red-500", available: false },
  { key: "threads", label: "Threads", icon: AtSign, tone: "text-foreground", available: false },
  { key: "twitter", label: "X / Twitter", icon: Twitter, tone: "text-foreground", available: false },
];

export function ChannelsTab({
  brandId,
  clientId,
}: {
  brandId: string;
  clientId: string;
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(listClientChannelAssignmentsFn);
  const toggleFn = useServerFn(toggleClientChannelFn);
  const startMetaFn = useServerFn(startMetaOAuth);
  const getActiveMetaSessionFn = useServerFn(getActiveMetaSession);
  const [connecting, setConnecting] = useState<null | "facebook" | "instagram">(null);
  const [portfolioSessionId, setPortfolioSessionId] = useState<string | null>(null);
  const [portfolioOpen, setPortfolioOpen] = useState(false);
  const [portfolioChannel, setPortfolioChannel] = useState<"facebook" | "instagram" | null>(null);

  const queryKey = ["client-channels", brandId, clientId] as const;
  const q = useQuery({
    queryKey,
    queryFn: () => listFn({ data: { brandId, clientId } }),
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
    setConnecting(channel);
    try {
      const existing = await getActiveMetaSessionFn({ data: { brandId } });
      if (existing.sessionId) {
        setPortfolioSessionId(existing.sessionId);
        setPortfolioChannel(channel);
        setPortfolioOpen(true);
        setConnecting(null);
        return;
      }
    } catch {
      // Fall back to OAuth.
    }

    const popup = window.open("", "meta-oauth", "width=760,height=820,resizable=yes,scrollbars=yes");
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

  const toggleMut = useMutation({
    mutationFn: (v: { connectionId: string; assigned: boolean }) =>
      toggleFn({ data: { brandId, clientId, ...v } }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<ClientChannelRow[]>(queryKey);
      qc.setQueryData<ClientChannelRow[]>(queryKey, (rows) =>
        (rows ?? []).map((r) =>
          r.connectionId === v.connectionId ? { ...r, assigned: v.assigned } : r,
        ),
      );
      return { prev };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKey, ctx.prev);
      toast.error(e instanceof Error ? e.message : "Falha ao atualizar vínculo");
    },
    onSuccess: (_r, v) => {
      toast.success(v.assigned ? "Canal vinculado" : "Vínculo removido");
      qc.invalidateQueries({ queryKey: ["wizard-connections", brandId, clientId] });
    },
  });

  const rows = q.data ?? [];
  const assignedCount = rows.filter((r) => r.assigned).length;

  const rowsByChannel = new Map<string, ClientChannelRow[]>();
  for (const r of rows) {
    const arr = rowsByChannel.get(r.channel) ?? [];
    arr.push(r);
    rowsByChannel.set(r.channel, arr);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 rounded-xl border border-border/60 bg-card px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Radio className="h-4 w-4 text-primary" />
            Canais deste cliente
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Ative uma conta existente com o toggle, ou clique em <span className="font-medium">Conectar nova conta</span> para autorizar
            direto pelo cliente. As contas vinculadas aparecem automaticamente no wizard do Calendário.
          </p>
        </div>
        <Badge variant="secondary" className="shrink-0 text-[10px]">
          {assignedCount} {assignedCount === 1 ? "canal ativo" : "canais ativos"}
        </Badge>
      </div>

      {q.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {CHANNELS.map((def) => {
            const accounts = rowsByChannel.get(def.key) ?? [];
            const Icon = def.icon;
            const isConnecting = connecting === def.key;
            return (
              <div
                key={def.key}
                className="overflow-hidden rounded-xl border border-border/60 bg-card"
              >
                <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/60">
                      <Icon className={`h-4 w-4 ${def.tone}`} />
                    </div>
                    <div>
                      <div className="text-sm font-semibold">{def.label}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {def.available
                          ? `${accounts.length} ${accounts.length === 1 ? "conta no workspace" : "contas no workspace"}`
                          : "Integração em breve"}
                      </div>
                    </div>
                  </div>
                  {def.available && def.provider === "meta" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1.5 text-xs"
                      disabled={!!connecting}
                      onClick={() => connectMeta(def.key as "facebook" | "instagram")}
                    >
                      {isConnecting ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Plus className="h-3.5 w-3.5" />
                      )}
                      Conectar nova conta
                    </Button>
                  ) : (
                    <Badge variant="outline" className="gap-1 text-[10px]">
                      <Lock className="h-3 w-3" />
                      Em breve
                    </Badge>
                  )}
                </div>

                {def.available ? (
                  accounts.length === 0 ? (
                    <div className="px-4 py-6 text-center">
                      <p className="text-xs text-muted-foreground">
                        Nenhuma conta {def.label} no workspace ainda.
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        Clique em <span className="font-medium">Conectar nova conta</span> acima
                        para autorizar e vincular a este cliente.
                      </p>
                    </div>
                  ) : (
                    <ul className="divide-y divide-border/60">
                      {accounts.map((row) => (
                        <li key={row.connectionId} className="flex items-center justify-between gap-3 px-4 py-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <Avatar className="h-9 w-9">
                              <AvatarImage src={row.avatarUrl ?? undefined} alt={row.accountLabel} />
                              <AvatarFallback className="text-[10px] uppercase">
                                {row.channel.slice(0, 2)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium">{row.accountLabel}</div>
                              <div className="mt-0.5 truncate text-xs text-muted-foreground">
                                {row.handle ? `@${row.handle}` : row.provider}
                                {row.status !== "active" ? ` · ${row.status}` : ""}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {toggleMut.isPending && toggleMut.variables?.connectionId === row.connectionId ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                            ) : null}
                            <Switch
                              checked={row.assigned}
                              onCheckedChange={(v) =>
                                toggleMut.mutate({ connectionId: row.connectionId, assigned: v })
                              }
                              aria-label={`Vincular ${row.accountLabel} a este cliente`}
                            />
                          </div>
                        </li>
                      ))}
                    </ul>
                  )
                ) : (
                  <div className="px-4 py-5 text-center">
                    <p className="text-xs text-muted-foreground">
                      O OAuth de {def.label} entra em uma próxima iteração — depende das credenciais da plataforma.
                    </p>
                  </div>
                )}
              </div>
            );
          })}

          <div className="rounded-lg border border-dashed border-border/60 px-4 py-3 text-[11px] text-muted-foreground">
            Precisa gerenciar Business Manager, contas de anúncio ou credenciais de API globais? Isso vive em{" "}
            <Link to="/connections" className="font-medium underline underline-offset-2">Integrações</Link> (acesso admin).
          </div>
        </div>
      )}
      <MetaPortfolioDialog
        brandId={brandId}
        clientId={clientId}
        sessionId={portfolioSessionId}
        open={portfolioOpen}
        channel={portfolioChannel}
        onOpenChange={(open) => {
          setPortfolioOpen(open);
          if (!open) {
            qc.invalidateQueries({ queryKey });
            qc.invalidateQueries({ queryKey: ["wizard-connections", brandId, clientId] });
          }
        }}
      />
    </div>
  );
}