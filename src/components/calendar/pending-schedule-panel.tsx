import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarClock, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DashboardPanelSurface,
  DashboardIconFrame,
} from "@/components/ui/dashboard-primitives";
import {
  listApprovedUnscheduledFn,
  type PendingSchedulePost,
} from "@/lib/scheduling-wizard.functions";

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
            {q.data.map((p) => (
              <li key={p.postId}>
                <button
                  type="button"
                  onClick={() => onPick(p)}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
                >
                  {p.coverUrl ? (
                    <img
                      src={p.coverUrl}
                      alt=""
                      className="h-10 w-10 shrink-0 rounded-md object-cover"
                    />
                  ) : (
                    <div className="h-10 w-10 shrink-0 rounded-md bg-muted" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {p.title}
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {p.channels.slice(0, 3).map((c) => (
                        <Badge
                          key={c}
                          variant="secondary"
                          className="text-[9px] capitalize"
                        >
                          {c}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </ScrollArea>
      )}
    </DashboardPanelSurface>
  );
}
