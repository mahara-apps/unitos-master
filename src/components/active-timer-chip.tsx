import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Pause } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useActiveContext } from "@/hooks/use-active-context";
import { getMyActiveTimerFn, stopTimerFn } from "@/lib/timesheet.functions";

function fmt(total: number) {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

/** Cronômetro em andamento sempre visível no topo, com Pausar, em qualquer tela. */
export function ActiveTimerChip() {
  const { brandId } = useActiveContext();
  const qc = useQueryClient();
  const getActive = useServerFn(getMyActiveTimerFn);
  const stop = useServerFn(stopTimerFn);
  const q = useQuery({
    queryKey: ["timer-state", brandId, "mine"],
    queryFn: () => getActive({ data: { brandId: brandId! } }),
    enabled: !!brandId,
    refetchInterval: 60_000,
  });
  const [now, setNow] = useState(() => Date.now());
  const active = q.data;
  useEffect(() => {
    if (!active) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [active]);
  const pause = useMutation({
    mutationFn: () => stop({ data: { entryId: active!.id, reason: "pause" } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["timer-state", brandId] });
      qc.invalidateQueries({ queryKey: ["job-tasks"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  if (!active) return null;
  const elapsed = Math.max(0, Math.floor((now - new Date(active.started_at).getTime()) / 1000));
  return (
    <div className="flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 py-0.5 pl-3 pr-0.5 text-xs">
      <span className="h-2 w-2 animate-pulse rounded-full bg-primary" aria-hidden="true" />
      <span className="font-mono tabular-nums" title="Cronômetro em andamento">{fmt(elapsed)}</span>
      <Button
        size="icon"
        variant="ghost"
        className="h-6 w-6 rounded-full"
        aria-label="Pausar cronômetro"
        title="Pausar cronômetro"
        disabled={pause.isPending}
        onClick={() => pause.mutate()}
      >
        <Pause className="h-3 w-3" />
      </Button>
    </div>
  );
}
