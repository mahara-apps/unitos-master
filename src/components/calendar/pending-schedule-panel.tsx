import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CalendarClock,
  Facebook,
  Instagram,
  Linkedin,
  Loader2,
  Music2,
  Pencil,
  Youtube,
  Globe,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DashboardPanelSurface,
  DashboardIconFrame,
} from "@/components/ui/dashboard-primitives";
import {
  listApprovedUnscheduledFn,
  type PendingSchedulePost,
} from "@/lib/scheduling-wizard.functions";

const CHANNEL_ICONS: Record<string, typeof Instagram> = {
  instagram: Instagram,
  facebook: Facebook,
  linkedin: Linkedin,
  youtube: Youtube,
  tiktok: Music2,
};

const CHANNEL_LABELS: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  tiktok: "TikTok",
  x: "X",
  threads: "Threads",
};

const FORMAT_LABELS: Record<string, string> = {
  feed: "Feed",
  stories: "Stories",
  reels: "Reels",
  carrossel: "Carrossel",
};

function ChannelChip({ channel }: { channel: string }) {
  const Icon = CHANNEL_ICONS[channel] ?? Globe;
  const label = CHANNEL_LABELS[channel] ?? channel;
  return (
    <Badge
      variant="secondary"
      className="gap-1 px-1.5 py-0 text-[10px] font-medium"
    >
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );
}

export function PendingSchedulePanel({
  brandId,
  clientId,
  onPick,
}: {
  brandId: string;
  clientId: string | null;
  onPick: (p: PendingSchedulePost) => void;
}) {
  const list = useServerFn(listApprovedUnscheduledFn);
  const q = useQuery({
    enabled: !!brandId,
    queryKey: ["pending-schedule", brandId, clientId],
    queryFn: () => list({ data: { brandId, clientId: clientId ?? null } }),
  });

  return (
    <DashboardPanelSurface>
      <div className="flex items-center gap-3 border-b border-border/60 px-4 py-3">
        <DashboardIconFrame>
          <CalendarClock className="h-4 w-4" />
        </DashboardIconFrame>
        <div className="min-w-0">
          <div className="text-sm font-semibold tracking-tight">
            Aguardando agendamento
          </div>
          <div className="text-xs text-muted-foreground">
            Posts aprovados sem data
          </div>
        </div>
      </div>
      {q.isLoading ? (
        <div className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      ) : !q.data?.length ? (
        <div className="px-4 py-6 text-center text-xs text-muted-foreground">
          Nada esperando agendamento no momento.
        </div>
      ) : (
        <ScrollArea className="max-h-[440px]">
          <ul className="divide-y divide-border/60">
            {q.data.map((p) => {
              const channels = Array.from(
                new Set(
                  (p.placements.length
                    ? p.placements.map((pl) => pl.channel).filter(Boolean)
                    : p.channels) as string[],
                ),
              );
              const formats = Array.from(
                new Set(
                  p.placements
                    .map((pl) => pl.format)
                    .filter(Boolean) as string[],
                ),
              );
              const approved = p.approvedAt ? new Date(p.approvedAt) : null;
              return (
                <li key={p.postId} className="group relative">
                  <button
                    type="button"
                    onClick={() => onPick(p)}
                    className="flex w-full items-start gap-3 px-4 py-3 pr-12 text-left transition-colors hover:bg-muted/40"
                  >
                    {p.coverUrl ? (
                      <img
                        src={p.coverUrl}
                        alt=""
                        className="h-14 w-14 shrink-0 rounded-md border border-border/60 object-cover"
                      />
                    ) : (
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted text-[10px] text-muted-foreground">
                        sem mídia
                      </div>
                    )}
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="truncate text-sm font-medium">
                        {p.title}
                      </div>
                      {p.copy ? (
                        <p className="line-clamp-2 text-xs text-muted-foreground">
                          {p.copy}
                        </p>
                      ) : null}
                      <div className="flex flex-wrap items-center gap-1">
                        {channels.slice(0, 4).map((c) => (
                          <ChannelChip key={`c-${c}`} channel={c} />
                        ))}
                        {formats.slice(0, 4).map((f) => (
                          <Badge
                            key={`f-${f}`}
                            variant="outline"
                            className="px-1.5 py-0 text-[10px] font-medium"
                          >
                            {FORMAT_LABELS[f] ?? f}
                          </Badge>
                        ))}
                      </div>
                      {approved ? (
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          Aprovado{" "}
                          {format(approved, "d MMM · HH:mm", { locale: ptBR })}
                        </div>
                      ) : null}
                    </div>
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Editar post"
                    onClick={(e) => {
                      e.stopPropagation();
                      onPick(p);
                    }}
                    className="absolute right-2 top-2 h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </li>
              );
            })}
          </ul>
        </ScrollArea>
      )}
    </DashboardPanelSurface>
  );
}
