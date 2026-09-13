import { Archive, CheckCircle2, XCircle, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type WorkItemVisualState = "active" | "completed" | "cancelled" | "archived";

type ResolveWorkItemVisualStateInput = {
  archivedAt?: string | null;
  done?: boolean | null;
  statusName?: string | null;
  statusIsDone?: boolean | null;
};

function normalizeStatusName(value?: string | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

export function resolveWorkItemVisualState({
  archivedAt,
  done,
  statusName,
  statusIsDone,
}: ResolveWorkItemVisualStateInput): WorkItemVisualState {
  if (normalizeStatusName(statusName).startsWith("cancelad")) return "cancelled";
  // Concluir também preenche archived_at no fluxo atual; a conclusão deve prevalecer.
  if (done || statusIsDone) return "completed";
  if (archivedAt) return "archived";
  return "active";
}

export const WORK_ITEM_VISUAL_META: Record<
  Exclude<WorkItemVisualState, "active">,
  {
    label: string;
    Icon: LucideIcon;
    surfaceClass: string;
    iconClass: string;
  }
> = {
  completed: {
    label: "Concluído",
    Icon: CheckCircle2,
    surfaceClass: "border-work-completed-border bg-work-completed-surface hover:bg-work-completed-surface",
    iconClass: "text-work-completed-foreground",
  },
  cancelled: {
    label: "Cancelado",
    Icon: XCircle,
    surfaceClass: "border-work-cancelled-border bg-work-cancelled-surface hover:bg-work-cancelled-surface",
    iconClass: "text-work-cancelled-foreground",
  },
  archived: {
    label: "Arquivado",
    Icon: Archive,
    surfaceClass: "border-work-archived-border bg-work-archived-surface hover:bg-work-archived-surface",
    iconClass: "text-work-archived-foreground",
  },
};

export function workItemSurfaceClass(state: WorkItemVisualState) {
  return state === "active" ? undefined : WORK_ITEM_VISUAL_META[state].surfaceClass;
}

export function WorkItemStateBadge({ state, className }: { state: WorkItemVisualState; className?: string }) {
  if (state === "active") return null;
  const meta = WORK_ITEM_VISUAL_META[state];
  return (
    <span className={cn("inline-flex w-fit shrink-0 items-center gap-1 text-[10px] font-medium", meta.iconClass, className)}>
      <meta.Icon className="h-3 w-3" />
      {meta.label}
    </span>
  );
}