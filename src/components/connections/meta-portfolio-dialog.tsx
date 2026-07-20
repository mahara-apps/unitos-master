import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Facebook, Instagram, Loader2 } from "lucide-react";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  getMetaPortfolio,
  linkMetaAccount,
  unlinkMetaAccount,
  type PortfolioPage,
} from "@/lib/meta/portfolio.functions";

/**
 * Post-OAuth account selector. Reads the captured portfolio for a
 * `meta_oauth_sessions` id and lets the user toggle which Facebook Pages
 * and Instagram Business accounts should be bound to the current brand.
 */
export function MetaPortfolioDialog({
  brandId,
  sessionId,
  open,
  onOpenChange,
}: {
  brandId: string;
  sessionId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const getFn = useServerFn(getMetaPortfolio);
  const linkFn = useServerFn(linkMetaAccount);
  const unlinkFn = useServerFn(unlinkMetaAccount);

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
      channel: "facebook" | "instagram";
      page: PortfolioPage;
      connect: boolean;
      existingConnectionId: string | null;
    }) => {
      if (input.connect) {
        return linkFn({
          data: { brandId, sessionId: sessionId!, pageId: input.page.pageId, channel: input.channel },
        });
      }
      if (!input.existingConnectionId) return { ok: true };
      return unlinkFn({ data: { brandId, connectionId: input.existingConnectionId } });
    },
    onSuccess: (_r, vars) => {
      toast.success(
        vars.connect
          ? `${vars.channel === "facebook" ? "Página" : "Conta"} vinculada`
          : "Conta desvinculada",
      );
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message ?? "Falha na operação"),
  });

  async function handleToggle(
    channel: "facebook" | "instagram",
    page: PortfolioPage,
    connect: boolean,
  ) {
    const key = `${channel}:${page.pageId}`;
    setPending((s) => new Set(s).add(key));
    try {
      const existing =
        channel === "facebook"
          ? (data?.connected.facebook[page.pageId] ?? null)
          : (page.instagramBusinessId
              ? data?.connected.instagram[page.instagramBusinessId] ?? null
              : null);
      await mut.mutateAsync({ channel, page, connect, existingConnectionId: existing });
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl border-border/60 bg-background/95 backdrop-blur">
        <DialogHeader>
          <DialogTitle className="text-base">Selecione as contas da Meta</DialogTitle>
          <DialogDescription className="text-xs">
            {data?.metaUser.name
              ? `Logado como ${data.metaUser.name}. `
              : ""}
            Escolha quais Páginas do Facebook e Contas do Instagram Business
            você deseja vincular a este projeto.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            {(error as Error).message}
          </p>
        ) : (
          <Tabs defaultValue="facebook" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="facebook" className="gap-2 text-xs">
                <Facebook className="h-3.5 w-3.5" />
                Páginas do Facebook
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                  {fbPages.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="instagram" className="gap-2 text-xs">
                <Instagram className="h-3.5 w-3.5" />
                Contas do Instagram
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                  {igPages.length}
                </Badge>
              </TabsTrigger>
            </TabsList>

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
                              onCheckedChange={(v) => handleToggle("facebook", p, v)}
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
                      Nenhuma conta do Instagram Business vinculada às suas Páginas.
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
                              onCheckedChange={(v) => handleToggle("instagram", p, v)}
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