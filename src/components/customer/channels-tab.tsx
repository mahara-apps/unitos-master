import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Facebook, Instagram, Loader2, Plus, Radio } from "lucide-react";
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

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 rounded-xl border border-border/60 bg-card px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Radio className="h-4 w-4 text-primary" />
            Redes sociais atribuídas a este cliente
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Contas conectadas globalmente em <span className="font-medium">Conexões</span>.
            Ative o toggle para liberar a conta neste cliente — o Calendário passa a
            listá-la automaticamente no wizard de agendamento.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <Badge variant="secondary" className="text-[10px]">
            {assignedCount}/{rows.length} ativas
          </Badge>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs"
            disabled={!!connecting}
            onClick={() => connectMeta("instagram")}
          >
            {connecting === "instagram" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Instagram className="h-3.5 w-3.5" />
            )}
            Instagram
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs"
            disabled={!!connecting}
            onClick={() => connectMeta("facebook")}
          >
            {connecting === "facebook" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Facebook className="h-3.5 w-3.5" />
            )}
            Facebook
          </Button>
        </div>
      </div>

      {q.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/60 p-8 text-center">
          <p className="text-sm font-medium">Nenhuma conta social conectada ao workspace.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Conecte contas em Conexões para poder atribuí-las aos clientes.
          </p>
          <Button asChild size="sm" className="mt-4">
            <Link to="/connections">Ir para Conexões</Link>
          </Button>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <Button size="sm" variant="outline" onClick={() => connectMeta("instagram")} disabled={!!connecting}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Conectar Instagram neste cliente
            </Button>
            <Button size="sm" variant="outline" onClick={() => connectMeta("facebook")} disabled={!!connecting}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Conectar Facebook neste cliente
            </Button>
          </div>
        </div>
      ) : (
        <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60 bg-card">
          {rows.map((row) => (
            <li
              key={row.connectionId}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <Avatar className="h-9 w-9">
                  <AvatarImage src={row.avatarUrl ?? undefined} alt={row.accountLabel} />
                  <AvatarFallback className="text-[10px] uppercase">
                    {row.channel.slice(0, 2)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      {row.accountLabel}
                    </span>
                    <Badge variant="outline" className="text-[10px] capitalize">
                      {row.channel}
                    </Badge>
                  </div>
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