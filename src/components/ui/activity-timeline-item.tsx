import type { ComponentType, ReactNode } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  MessageSquare,
  Send,
  Sparkles,
} from "lucide-react";

import { cn } from "@/lib/utils";

export type ActivityTimelineTone =
  | "info"
  | "success"
  | "warning"
  | "critical"
  | "neutral"
  | "violet"
  | "pink";

const TONE: Record<ActivityTimelineTone, string> = {
  info: "border-sky-500/30 bg-sky-500/10 text-sky-500",
  success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-500",
  warning: "border-amber-500/30 bg-amber-500/10 text-amber-500",
  critical: "border-rose-500/30 bg-rose-500/10 text-rose-500",
  neutral: "border-border/60 bg-muted/40 text-muted-foreground",
  violet: "border-violet-500/30 bg-violet-500/10 text-violet-500",
  pink: "border-pink-500/30 bg-pink-500/10 text-pink-500",
};

/**
 * Mapa opcional de tipo de evento → ícone/tom.
 * Use quando o consumidor tem uma string simples (ex.: "post.created").
 */
export const ACTIVITY_EVENT_PRESETS: Record<
  string,
  { tone: ActivityTimelineTone; icon: ComponentType<{ className?: string }> }
> = {
  created: { tone: "info", icon: Sparkles },
  approved: { tone: "success", icon: BadgeCheck },
  published: { tone: "pink", icon: Send },
  alert: { tone: "critical", icon: AlertTriangle },
  done: { tone: "success", icon: CheckCircle2 },
  comment: { tone: "violet", icon: MessageSquare },
};

export type ActivityTimelineItemProps = {
  title: ReactNode;
  description?: ReactNode;
  timestamp: ReactNode;
  tone?: ActivityTimelineTone;
  icon?: ComponentType<{ className?: string }>;
  className?: string;
};

/**
 * ActivityTimelineItem — item de timeline com ícone colorido por tipo,
 * título, descrição e timestamp relativo.
 */
export function ActivityTimelineItem({
  title,
  description,
  timestamp,
  tone = "neutral",
  icon,
  className,
}: ActivityTimelineItemProps) {
  const Icon = icon ?? Sparkles;
  return (
    <div className={cn("flex items-center gap-3 px-4 py-2.5", className)}>
      <span
        className={cn(
          "grid h-7 w-7 shrink-0 place-items-center rounded-md border",
          TONE[tone],
        )}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm">{title}</div>
        {description ? (
          <div className="truncate text-xs text-muted-foreground">{description}</div>
        ) : null}
      </div>
      <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{timestamp}</span>
    </div>
  );
}