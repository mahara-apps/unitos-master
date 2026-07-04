import { CheckCircle2, MessageSquare, Send, RefreshCw, FilePlus } from "lucide-react";
import type { TimelineEvent } from "./mock-data";

const ICONS = {
  created: FilePlus,
  sent: Send,
  changes: MessageSquare,
  revision: RefreshCw,
  approved: CheckCircle2,
} as const;

const TONES = {
  created: "text-muted-foreground bg-muted",
  sent: "text-sky-600 bg-sky-100 dark:text-sky-300 dark:bg-sky-950/60",
  changes: "text-amber-700 bg-amber-100 dark:text-amber-300 dark:bg-amber-950/60",
  revision: "text-violet-700 bg-violet-100 dark:text-violet-300 dark:bg-violet-950/60",
  approved: "text-emerald-700 bg-emerald-100 dark:text-emerald-300 dark:bg-emerald-950/60",
} as const;

export function Timeline({ events }: { events: TimelineEvent[] }) {
  return (
    <ol className="mx-auto w-full max-w-xl space-y-4">
      {events.map((e, i) => {
        const Icon = ICONS[e.kind];
        const isLast = i === events.length - 1;
        return (
          <li key={e.id} className="relative flex gap-3 pl-1">
            {!isLast && (
              <span className="absolute left-[15px] top-8 bottom-[-1rem] w-px bg-border dark:bg-slate-800" />
            )}
            <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${TONES[e.kind]}`}>
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1 pt-1">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="truncate text-sm font-medium text-foreground">{e.actor}</span>
                <time className="shrink-0 text-xs text-muted-foreground">
                  {new Date(e.at).toLocaleString("pt-BR", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground">{e.message}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}