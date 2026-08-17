import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { describeError } from "@/lib/errors";
import {
  listPostPublicationStateFn,
  retryFailedPlacementFn,
} from "@/lib/publish-retry.functions";

const CHANNEL_LABEL: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  x: "X",
  youtube: "YouTube",
  blog: "Blog",
};

const FORMAT_LABEL: Record<string, string> = {
  feed: "Feed",
  stories: "Stories",
  reels: "Reels",
  carrossel: "Carrossel",
};

/**
 * Painel "Publicação" do composer. Mostra o estado REAL por destino e permite
 * republicar individualmente apenas os destinos que falharam (nunca reenvia
 * destinos já publicados).
 */
export function PublicationStatusPanel({
  postId,
  brandId,
}: {
  postId: string;
  brandId: string;
}) {
  const qc = useQueryClient();
  const listState = useServerFn(listPostPublicationStateFn);
  const retryFn = useServerFn(retryFailedPlacementFn);
  const [retrying, setRetrying] = useState<string | null>(null);

  const stateQ = useQuery({
    queryKey: ["post-publication-state", postId],
    queryFn: () => listState({ data: { postId, brandId } }),
    refetchInterval: (q) =>
      (q.state.data?.destinations ?? []).some(
        (d) => d.status === "scheduled" || d.status === "publishing",
      )
        ? 15_000
        : false,
  });

  const state = stateQ.data;
  // Só interessa quando houve tentativa real de publicação.
  const relevant =
    !!state &&
    state.destinations.some((d) =>
      ["published", "failed", "publishing"].includes(d.status),
    );
  if (!relevant) return null;

  async function handleRetry(placementId: string, label: string) {
    if (retrying) return;
    setRetrying(placementId);
    try {
      await retryFn({ data: { postId, brandId, placementId } });
      toast.success(`${label} recolocado na fila de publicação.`);
      await qc.invalidateQueries({ queryKey: ["post-publication-state", postId] });
      await qc.invalidateQueries({ queryKey: ["calendar-posts"] });
    } catch (e) {
      toast.error(describeError(e));
    } finally {
      setRetrying(null);
    }
  }

  const failed = state!.destinations.filter((d) => d.canRetry);

  return (
    <section className="rounded-lg border border-border/70 bg-muted/20 p-3">
      <header className="mb-2.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold tracking-tight">Publicação</span>
          {state!.overall === "published" ? (
            <Badge className="h-5 text-[10px]">Publicado</Badge>
          ) : state!.overall === "partial" ? (
            <Badge variant="destructive" className="h-5 text-[10px]">
              <AlertTriangle className="mr-1 h-3 w-3" />
              Publicação parcial
            </Badge>
          ) : (
            <Badge variant="outline" className="h-5 text-[10px]">
              Em andamento
            </Badge>
          )}
        </div>
        {failed.length > 1 ? (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-[11px]"
            disabled={!!retrying}
            onClick={async () => {
              // Reutiliza exatamente a ação individual, um destino por vez.
              for (const d of failed) {
                await handleRetry(
                  d.placementId,
                  CHANNEL_LABEL[d.channel] ?? d.channel,
                );
              }
            }}
          >
            <RefreshCw className="mr-1.5 h-3 w-3" />
            Republicar destinos com falha
          </Button>
        ) : null}
      </header>

      <ul className="space-y-1.5">
        {state!.destinations.map((d) => {
          const label = CHANNEL_LABEL[d.channel] ?? d.channel ?? "Destino";
          const fmt = FORMAT_LABEL[d.format] ?? d.format;
          return (
            <li
              key={d.placementId}
              className={cn(
                "rounded-md border px-2.5 py-2",
                d.status === "published"
                  ? "border-border/60 bg-background"
                  : d.status === "failed"
                    ? "border-destructive/40 bg-destructive/5"
                    : "border-border/60 bg-background",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  {d.status === "published" ? (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                  ) : d.status === "failed" ? (
                    <XCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
                  ) : (
                    <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <span className="truncate text-xs font-medium">
                    {label} · {fmt}
                  </span>
                  <span className="truncate text-[11px] text-muted-foreground">
                    {d.accountLabel ? `@${d.accountLabel}` : ""}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {d.permalink ? (
                    <a
                      href={d.permalink}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      Ver <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : null}
                  {d.canRetry ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 px-2 text-[11px]"
                      disabled={!!retrying}
                      onClick={() => handleRetry(d.placementId, label)}
                    >
                      {retrying === d.placementId ? (
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      ) : (
                        <RefreshCw className="mr-1 h-3 w-3" />
                      )}
                      Republicar {label}
                    </Button>
                  ) : null}
                </div>
              </div>
              {d.status === "failed" && d.error ? (
                <p className="mt-1 pl-5 text-[11px] leading-snug text-destructive">
                  {d.error}
                </p>
              ) : null}
              {d.status === "published" && d.publishedAt ? (
                <p className="mt-1 pl-5 text-[11px] text-muted-foreground">
                  Publicado em{" "}
                  {new Date(d.publishedAt).toLocaleString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
