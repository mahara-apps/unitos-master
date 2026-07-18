import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Send,
  Loader2,
  CheckCircle2,
  Clock,
  XCircle,
  ExternalLink,
  AlertTriangle,
} from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PanelEmptyState } from "@/components/ui/panel-empty";
import { DashboardPanelSurface } from "@/components/ui/dashboard-primitives";
import { listPublicationsFn, type PublicationRow } from "@/lib/publications.functions";

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STATUS_META: Record<
  string,
  { label: string; tone: string; icon: any }
> = {
  scheduled: { label: "Agendado", tone: "bg-blue-500/15 text-blue-500", icon: Clock },
  publishing: { label: "Publicando", tone: "bg-amber-500/15 text-amber-500", icon: Loader2 },
  published: { label: "Publicado", tone: "bg-emerald-500/15 text-emerald-500", icon: CheckCircle2 },
  failed: { label: "Falhou", tone: "bg-red-500/15 text-red-500", icon: XCircle },
  canceled: { label: "Cancelado", tone: "bg-muted text-muted-foreground", icon: XCircle },
  draft: { label: "Rascunho", tone: "bg-muted text-muted-foreground", icon: Clock },
};

export function PublicationsPanel({
  brandId,
  onlyStatus,
  title,
  subtitle,
}: {
  brandId: string;
  onlyStatus?: PublicationRow["status"];
  title: string;
  subtitle: string;
}) {
  const list = useServerFn(listPublicationsFn);
  const q = useQuery({
    queryKey: ["publications", brandId, onlyStatus ?? "all"],
    queryFn: () => list({ data: { brandId, status: onlyStatus, limit: 120 } }),
    refetchInterval: 15_000,
  });

  const rows = q.data ?? [];

  return (
    <DashboardPanelSurface>
      <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
        <div>
          <div className="text-sm font-semibold tracking-tight">{title}</div>
          <div className="text-xs text-muted-foreground">{subtitle}</div>
        </div>
        <Badge variant="outline" className="tabular-nums">
          {rows.length}
        </Badge>
      </div>
      {q.isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando…
        </div>
      ) : rows.length === 0 ? (
        <PanelEmptyState
          icon={<Send className="h-5 w-5" />}
          text="Nenhuma publicação nesta visão."
        />
      ) : (
        <ul className="divide-y divide-border/60">
          {rows.map((p) => {
            const meta = STATUS_META[p.status] ?? STATUS_META.draft;
            const Icon = meta.icon;
            const media = (p.media ?? {}) as { imageUrl?: string };
            return (
              <li
                key={p.id}
                className="flex items-start gap-3 px-5 py-3 transition-colors hover:bg-muted/30"
              >
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md bg-muted">
                  {media.imageUrl ? (
                    <img
                      src={media.imageUrl}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Avatar className="h-5 w-5">
                      {p.channelAvatarUrl ? (
                        <AvatarImage src={p.channelAvatarUrl} />
                      ) : (
                        <AvatarFallback className="text-[9px]">
                          {p.placement.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      )}
                    </Avatar>
                    <span className="truncate text-xs font-medium">
                      {p.channelLabel ?? p.placement}
                    </span>
                    <Badge className={`h-5 gap-1 px-1.5 text-[10px] ${meta.tone}`}>
                      <Icon className="h-3 w-3" />
                      {meta.label}
                    </Badge>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[12px] text-muted-foreground">
                    {p.caption ?? <span className="italic">Sem legenda</span>}
                  </p>
                  {p.lastError ? (
                    <div className="mt-1 flex items-center gap-1 text-[11px] text-red-500">
                      <AlertTriangle className="h-3 w-3" /> {p.lastError}
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-col items-end gap-1 text-[11px] text-muted-foreground">
                  <span>
                    {p.status === "scheduled"
                      ? `→ ${fmt(p.scheduledAt)}`
                      : p.status === "published"
                        ? fmt(p.publishedAt)
                        : fmt(p.createdAt)}
                  </span>
                  {p.externalPermalink ? (
                    <Button size="sm" variant="ghost" asChild className="h-6 px-1.5">
                      <a href={p.externalPermalink} target="_blank" rel="noopener noreferrer">
                        Ver <ExternalLink className="ml-1 h-3 w-3" />
                      </a>
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </DashboardPanelSurface>
  );
}