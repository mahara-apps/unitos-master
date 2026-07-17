import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Facebook, Instagram, Link2, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

export function MetaIntegrationCard({ brandId }: { brandId: string | null }) {
  const qc = useQueryClient();
  const [connecting, setConnecting] = useState(false);

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
      const d = ev.data as { source?: string; ok?: boolean; error?: string; message?: string };
      if (!d || d.source !== "meta-oauth") return;
      setConnecting(false);
      if (d.ok) {
        toast.success(d.message ?? "Meta conectada");
        invalidate();
      } else if (d.error) {
        toast.error(d.error);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandId]);

  async function handleConnect() {
    if (!brandId) return;
    // Pre-open synchronously so the browser doesn't block the popup.
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

  const hasConnections = connections.length > 0;
  const igCount = useMemo(
    () => connections.filter((c) => c.igBusinessId).length,
    [connections],
  );

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-sm">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#1877F2]/10 text-[#1877F2]">
              <Facebook className="h-3.5 w-3.5" />
            </span>
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-tr from-[#F58529] via-[#DD2A7B] to-[#8134AF] text-white">
              <Instagram className="h-3.5 w-3.5" />
            </span>
            Meta (Facebook & Instagram)
          </CardTitle>
          <CardDescription className="text-xs">
            OAuth Graph API · Páginas do Facebook e contas Instagram Business
            conectadas à sua marca.
          </CardDescription>
        </div>
        <Button size="sm" onClick={handleConnect} disabled={!brandId || connecting}>
          <Link2 className="mr-1.5 h-3.5 w-3.5" />
          {hasConnections ? "Conectar mais páginas" : "Conectar com Meta"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {!hasConnections ? (
          <p className="rounded-md border border-dashed border-border/60 p-4 text-center text-xs text-muted-foreground">
            Nenhuma página conectada ainda. Autorize o acesso para publicar e ler
            insights de Facebook e Instagram Business.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {connections.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between rounded-md border border-border/60 bg-card/50 px-3 py-2"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Facebook className="h-3.5 w-3.5 text-[#1877F2]" />
                    <span className="truncate">{c.pageName ?? c.pageId}</span>
                    {c.status !== "active" && (
                      <Badge variant="destructive" className="h-4 px-1 text-[10px]">
                        {c.status}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span>ID {c.pageId}</span>
                    {c.igUsername ? (
                      <span className="flex items-center gap-1">
                        <Instagram className="h-3 w-3" />@{c.igUsername}
                      </span>
                    ) : (
                      <span className="text-amber-600">sem IG Business</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    disabled={refreshMut.isPending}
                    onClick={() => refreshMut.mutate(c.id)}
                    title="Atualizar"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive"
                    disabled={disconnectMut.isPending}
                    onClick={() => disconnectMut.mutate(c.id)}
                    title="Desconectar"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {hasConnections && (
          <p className="text-[11px] text-muted-foreground">
            {connections.length} página(s) · {igCount} Instagram Business
          </p>
        )}
      </CardContent>
    </Card>
  );
}