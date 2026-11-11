import type { ReactNode } from "react";
import { InlineEditableText } from "@/components/ui/inline-editable-text";
import { cn } from "@/lib/utils";
import {
  WorkItemStateBadge,
  type WorkItemVisualState,
  workItemSurfaceClass,
} from "./work-item-visual-state";

type Props = {
  title: string;
  done: boolean;
  visualState: WorkItemVisualState;
  onOpen: () => void;
  completion: ReactNode;
  status: ReactNode;
  priority: ReactNode;
  assignee: ReactNode;
  dueDate: ReactNode;
  timer: ReactNode;
  subtasks: ReactNode;
  menu: ReactNode;
  onRename?: (title: string) => void;
  /** Controle de posição (#N + alça de arrastar), renderizado antes da conclusão. */
  handle?: ReactNode;
};

export function JobTaskRow({
  title,
  done,
  visualState,
  onOpen,
  completion,
  status,
  priority,
  assignee,
  dueDate,
  timer,
  subtasks,
  menu,
  onRename,
  handle,
}: Props) {
  return (
    <div className={cn(
      "grid grid-cols-[auto_minmax(0,1fr)_32px] items-start gap-x-2 gap-y-2.5 border-l-2 border-l-transparent px-4 py-3.5 transition-colors @[900px]:grid-cols-[auto_minmax(220px,1fr)_112px_88px_32px_76px_32px_32px_32px] @[900px]:items-center @[900px]:gap-x-2",
      workItemSurfaceClass(visualState),
    )}>
      <div className="flex shrink-0 items-center gap-0.5">{handle}{completion}</div>

      <div
        role="button"
        tabIndex={0}
        className="flex min-h-7 min-w-0 cursor-pointer justify-start text-left"
        onClick={onOpen}
        onKeyDown={(e) => { if (e.key === "Enter" && e.target === e.currentTarget) onOpen(); }}
        title={title}
      >
        <span className="flex min-w-0 flex-col items-start gap-0.5">
          <InlineEditableText
            value={title}
            onSave={onRename}
            ariaLabel="Renomear sub-task"
            className={cn(
              "line-clamp-2 min-w-0 text-sm font-medium leading-5",
              done && "text-muted-foreground line-through",
            )}
          />
          <WorkItemStateBadge state={visualState} />
        </span>
      </div>

      <div className="row-start-1 flex h-8 shrink-0 items-center justify-end @[900px]:col-start-9">
        {menu}
      </div>

      <div className="col-start-2 col-end-4 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 @[900px]:contents">
        <div className="min-w-0 max-w-[112px] @[900px]:col-start-3">{status}</div>
        <div className="w-[88px] shrink-0 @[900px]:col-start-4">{priority}</div>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center @[900px]:col-start-5">{assignee}</div>
        <div className="shrink-0 @[900px]:col-start-6">{dueDate}</div>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center @[900px]:col-start-7">{timer}</div>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center @[900px]:col-start-8">{subtasks}</div>
      </div>
    </div>
  );
}