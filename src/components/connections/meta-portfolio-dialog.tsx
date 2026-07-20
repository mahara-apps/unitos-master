import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  AtSign,
  BarChart3,
  CheckCircle2,
  Facebook,
  Instagram,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  getMetaPortfolio,
  linkMetaAccount,
  unlinkMetaAccount,
  type PortfolioPage,
  type PortfolioThreadsAccount,
  type PortfolioAdAccount,
} from "@/lib/meta/portfolio.functions";
import { startMetaOAuth } from "@/lib/meta/meta.functions";

/**
 * Post-OAuth account selector. Reads the captured portfolio for a
 * `meta_oauth_sessions` id and lets the user toggle which Facebook Pages
 * and Instagram Business accounts should be bound to the current brand.
 */
export function MetaPortfolioDialog({
  brandId,
  sessionId,
  open,
  channel,
  onOpenChange,
}: {
  brandId: string;
  sessionId: string | null;
  open: boolean;
  channel?: "facebook" | "instagram" | "threads" | "ads" | null;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const getFn = useServerFn(getMetaPortfolio);
  const linkFn = useServerFn(linkMetaAccount);
  const unlinkFn = useServerFn(unlinkMetaAccount);
  const startFn = useServerFn(startMetaOAuth);

  async function reauthorize(channel: "instagram" | "facebook" | "threads") {
    const popup = window.open("", "meta-oauth", "width=640,height=760");
    try {
      const { authorizeUrl } = await startFn({ data: { brandId, channel } });
      if (popup) popup.location.href = authorizeUrl;
      else window.location.href = authorizeUrl;
    } catch (err) {
      popup?.close();
      toast.error(err instanceof Error ? err.message : "Falha ao iniciar OAuth");
    }
  }

  const {
    data,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["meta-portfolio", brandId, sessionId],
    queryFn: () => getFn({ data: { brandId, sessionId: sessionId! } }),
    enabled: !!sessionId && open,
  });

  const [pending, setPending] = useState<Set<string>>(new Set());

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["meta-portfolio", brandId, sessionId] });
    qc.invalidateQueries({ queryKey: ["meta-connections", brandId] });
  };

  const mut = useMutation({
    mutationFn: async (input: {
      channel: "facebook" | "instagram" | "threads" | "ads";
      targetId: string;
      connect: boolean;
      existingConnectionId: string | null;
    }) => {
      if (input.connect) {
        return linkFn({
          data: {
            brandId,
            sessionId: sessionId!,
            targetId: input.targetId,
            channel: input.channel,
          },
        });
      }
      if (!input.existingConnectionId) return { ok: true };
      return unlinkFn({ data: { brandId, connectionId: input.existingConnectionId } });
    },
    onSuccess: (_r, vars) => {
      toast.success(
        vars.connect
          ? "Conta vinculada"
          : "Conta desvinculada",
      );
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message ?? "Falha na operação"),
  });

  async function handleToggle(
    channel: "facebook" | "instagram" | "threads" | "ads",
    targetId: string,
    lookupId: string | null,
    connect: boolean,
  ) {
    const key = `${channel}:${targetId}`;
    setPending((s) => new Set(s).add(key));
    try {
      const map =
        channel === "facebook"
          ? data?.connected.facebook
          : channel === "instagram"
            ? data?.connected.instagram
            : channel === "threads"
              ? data?.connected.threads
              : data?.connected.ads;
      const existing = lookupId ? (map?.[lookupId] ?? null) : null;
      await mut.mutateAsync({ channel, targetId, connect, existingConnectionId: existing });
    } finally {
      setPending((s) => {
        const next = new Set(s);
        next.delete(key);
        return next;
      });
    }
  }

  const fbPages = data?.pages ?? [];
  const igPages = useMemo(
    () => (data?.pages ?? []).filter((p) => p.instagramBusinessId),
    [data],
  );
  const threadsAccounts: PortfolioThreadsAccount[] = data?.threadsAccounts ?? [];
  const adAccounts: PortfolioAdAccount[] = data?.adAccounts ?? [];
  const missingScopes = data?.missingScopes ?? [];

  // Emit a targeted toast when the user opened a channel-specific flow and
  // the corresponding list came back empty.
  const emptyToastFiredRef = useRef<string | null>(null);
  useEffect(() => {
    if (!open || !channel || !data) return;
    const key = `${sessionId}:${channel}`;
    if (emptyToastFiredRef.current === key) return;
    const counts: Record<string, number> = {
      facebook: fbPages.length,
      instagram: igPages.length,
      threads: threadsAccounts.length,
      ads: adAccounts.length,
    };
    if (counts[channel] === 0) {
      emptyToastFiredRef.current = key;
      if (channel === "instagram") {
        toast.error(
          "Nenhuma conta do Instagram Business encontrada. Verifique se o seu Instagram está corretamente vinculado a uma Página do Facebook.",
          { duration: 9000 },
        );
      } else if (channel === "facebook") {
        toast.error("Nenhuma Página do Facebook encontrada nesta conta Meta.");
      } else if (channel === "threads") {
        toast.error("Nenhum perfil do Threads encontrado nas suas Páginas.");
      } else if (channel === "ads") {
        toast.error("Nenhuma Conta de Anúncios encontrada (requer permissão ads_read).");
      }
    }
  }, [open, channel, data, sessionId, fbPages.length, igPages.length, threadsAccounts.length, adAccounts.length]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl border-border/60 bg-background/95 backdrop-blur">
        <DialogHeader>
          <DialogTitle className="text-base">Selecione as contas da Meta</DialogTitle>
          <DialogDescription className="text-xs">
            {data?.metaUser.name
              ? `Logado como ${data.metaUser.name}. `
              : ""}
            {channel === "instagram"
              ? "Escolha quais contas do Instagram Business você deseja vincular a este projeto."
              : channel === "facebook"
                ? "Escolha quais Páginas do Facebook você deseja vincular a este projeto."
                : channel === "threads"
                  ? "Escolha quais perfis do Threads você deseja vincular a este projeto."
                  : channel === "ads"
                    ? "Escolha quais Contas de Anúncio você deseja vincular a este projeto."
                    : "Escolha quais Páginas, Contas do Instagram, perfis do Threads e Contas de Anúncio você deseja vincular a este projeto."}
          </DialogDescription>
        </DialogHeader>

        {missingScopes.length > 0 && (
          <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <div className="space-y-1">
              <p className="font-medium">Algumas permissões não foram concedidas.</p>
              <p className="text-amber-700/80 dark:text-amber-300/80">
                As funcionalidades ligadas a estas permissões ficarão limitadas:{" "}
                <code className="text-[10px]">{missingScopes.join(", ")}</code>.
                Refaça o login e mantenha todas as permissões marcadas para liberar
                publicação, insights e Ads.
              </p>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            {(error as Error).message}
          </p>
        ) : (
          <Tabs defaultValue={channel ?? "facebook"} className="w-full">
            {!channel && (
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="facebook" className="gap-2 text-xs">
                <Facebook className="h-3.5 w-3.5" />
                Facebook
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                  {fbPages.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="instagram" className="gap-2 text-xs">
                <Instagram className="h-3.5 w-3.5" />
                Instagram
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                  {igPages.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="threads" className="gap-2 text-xs">
                <AtSign className="h-3.5 w-3.5" />
                Threads
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                  {threadsAccounts.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="ads" className="gap-2 text-xs">
                <BarChart3 className="h-3.5 w-3.5" />
                Ads
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                  {adAccounts.length}
                </Badge>
              </TabsTrigger>
            </TabsList>
            )}

            <TabsContent value="facebook" className="mt-3">
              <ScrollArea className="h-[420px] rounded-lg border border-border/60">
                <ul className="divide-y divide-border/60">
                  {fbPages.length === 0 ? (
                    <li className="p-6 text-center text-xs text-muted-foreground">
                      Nenhuma Página encontrada.
                    </li>
                  ) : (
                    fbPages.map((p) => {
                      const key = `facebook:${p.pageId}`;
                      const connectionId = data?.connected.facebook[p.pageId] ?? null;
                      const isConnected = !!connectionId;
                      const isPending = pending.has(key);
                      return (
                        <li key={p.pageId} className="flex items-center gap-3 p-3">
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={p.pagePictureUrl ?? undefined} alt={p.pageName} />
                            <AvatarFallback className="bg-[#1877F2]/10 text-[#1877F2]">
                              <Facebook className="h-4 w-4" />
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-sm font-medium">{p.pageName}</span>
                              {isConnected && (
                                <Badge
                                  variant="outline"
                                  className="h-5 gap-1 border-emerald-500/30 bg-emerald-500/10 px-1.5 text-[10px] text-emerald-600 dark:text-emerald-400"
                                >
                                  <CheckCircle2 className="h-3 w-3" />
                                  Vinculada
                                </Badge>
                              )}
                            </div>
                            <p className="truncate text-[11px] text-muted-foreground">
                              {p.category ?? "Página"} · ID {p.pageId}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {isPending && (
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                            )}
                            <Switch
                              checked={isConnected}
                              disabled={isPending}
                              onCheckedChange={(v) =>
                                handleToggle("facebook", p.pageId, p.pageId, v)
                              }
                            />
                          </div>
                        </li>
                      );
                    })
                  )}
                </ul>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="instagram" className="mt-3">
              <ScrollArea className="h-[420px] rounded-lg border border-border/60">
                <ul className="divide-y divide-border/60">
                  {igPages.length === 0 ? (
                    <li className="p-6 text-center text-xs text-muted-foreground">
                      Nenhuma conta do Instagram Business encontrada. Verifique se o seu Instagram está corretamente vinculado a uma Página do Facebook.
                    </li>
                  ) : (
                    igPages.map((p) => {
                      const key = `instagram:${p.pageId}`;
                      const connectionId = p.instagramBusinessId
                        ? (data?.connected.instagram[p.instagramBusinessId] ?? null)
                        : null;
                      const isConnected = !!connectionId;
                      const isPending = pending.has(key);
                      return (
                        <li key={p.pageId} className="flex items-center gap-3 p-3">
                          <Avatar className="h-10 w-10">
                            <AvatarImage
                              src={p.instagramPictureUrl ?? undefined}
                              alt={p.instagramUsername ?? p.pageName}
                            />
                            <AvatarFallback className="bg-gradient-to-tr from-[#F58529] via-[#DD2A7B] to-[#8134AF] text-white">
                              <Instagram className="h-4 w-4" />
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-sm font-medium">
                                @{p.instagramUsername ?? p.pageName}
                              </span>
                              {isConnected && (
                                <Badge
                                  variant="outline"
                                  className="h-5 gap-1 border-emerald-500/30 bg-emerald-500/10 px-1.5 text-[10px] text-emerald-600 dark:text-emerald-400"
                                >
                                  <CheckCircle2 className="h-3 w-3" />
                                  Vinculada
                                </Badge>
                              )}
                            </div>
                            <p className="truncate text-[11px] text-muted-foreground">
                              via Página {p.pageName}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {isPending && (
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                            )}
                            <Switch
                              checked={isConnected}
                              disabled={isPending}
                              onCheckedChange={(v) =>
                                handleToggle(
                                  "instagram",
                                  p.pageId,
                                  p.instagramBusinessId,
                                  v,
                                )
                              }
                            />
                          </div>
                        </li>
                      );
                    })
                  )}
                </ul>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="threads" className="mt-3">
              <ScrollArea className="h-[420px] rounded-lg border border-border/60">
                <ul className="divide-y divide-border/60">
                  {threadsAccounts.length === 0 ? (
                    <li className="p-6 text-center text-xs text-muted-foreground">
                      Nenhum perfil do Threads encontrado nas suas Páginas.
                    </li>
                  ) : (
                    threadsAccounts.map((t) => {
                      const key = `threads:${t.threadsUserId}`;
                      const connectionId =
                        data?.connected.threads[t.threadsUserId] ?? null;
                      const isConnected = !!connectionId;
                      const isPending = pending.has(key);
                      return (
                        <li
                          key={t.threadsUserId}
                          className="flex items-center gap-3 p-3"
                        >
                          <Avatar className="h-10 w-10">
                            <AvatarImage
                              src={t.pictureUrl ?? undefined}
                              alt={t.username ?? t.threadsUserId}
                            />
                            <AvatarFallback className="bg-foreground/10">
                              <AtSign className="h-4 w-4" />
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-sm font-medium">
                                @{t.username ?? t.name ?? t.threadsUserId}
                              </span>
                              {isConnected && (
                                <Badge
                                  variant="outline"
                                  className="h-5 gap-1 border-emerald-500/30 bg-emerald-500/10 px-1.5 text-[10px] text-emerald-600 dark:text-emerald-400"
                                >
                                  <CheckCircle2 className="h-3 w-3" />
                                  Vinculada
                                </Badge>
                              )}
                            </div>
                            <p className="truncate text-[11px] text-muted-foreground">
                              Threads · ID {t.threadsUserId}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {isPending && (
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                            )}
                            <Switch
                              checked={isConnected}
                              disabled={isPending}
                              onCheckedChange={(v) =>
                                handleToggle(
                                  "threads",
                                  t.threadsUserId,
                                  t.threadsUserId,
                                  v,
                                )
                              }
                            />
                          </div>
                        </li>
                      );
                    })
                  )}
                </ul>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="ads" className="mt-3">
              <ScrollArea className="h-[420px] rounded-lg border border-border/60">
                <ul className="divide-y divide-border/60">
                  {adAccounts.length === 0 ? (
                    <li className="p-6 text-center text-xs text-muted-foreground">
                      Nenhuma Conta de Anúncios encontrada (requer permissão
                      <code className="mx-1 rounded bg-muted px-1">ads_read</code>).
                    </li>
                  ) : (
                    adAccounts.map((a) => {
                      const key = `ads:${a.adAccountId}`;
                      const connectionId =
                        data?.connected.ads[a.adAccountId] ?? null;
                      const isConnected = !!connectionId;
                      const isPending = pending.has(key);
                      return (
                        <li
                          key={a.adAccountId}
                          className="flex items-center gap-3 p-3"
                        >
                          <Avatar className="h-10 w-10">
                            <AvatarFallback className="bg-blue-500/10 text-blue-500">
                              <BarChart3 className="h-4 w-4" />
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-sm font-medium">
                                {a.name ?? a.adAccountId}
                              </span>
                              {isConnected && (
                                <Badge
                                  variant="outline"
                                  className="h-5 gap-1 border-emerald-500/30 bg-emerald-500/10 px-1.5 text-[10px] text-emerald-600 dark:text-emerald-400"
                                >
                                  <CheckCircle2 className="h-3 w-3" />
                                  Vinculada
                                </Badge>
                              )}
                            </div>
                            <p className="truncate text-[11px] text-muted-foreground">
                              {a.businessName ? `${a.businessName} · ` : ""}
                              {a.currency ?? "—"} · {a.adAccountId}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {isPending && (
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                            )}
                            <Switch
                              checked={isConnected}
                              disabled={isPending}
                              onCheckedChange={(v) =>
                                handleToggle(
                                  "ads",
                                  a.adAccountId,
                                  a.adAccountId,
                                  v,
                                )
                              }
                            />
                          </div>
                        </li>
                      );
                    })
                  )}
                </ul>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}