import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  done: boolean;
  onOpen: () => void;
  completion: ReactNode;
  status: ReactNode;
  priority: ReactNode;
  assignee: ReactNode;
  dueDate: ReactNode;
  timer: ReactNode;
  subtasks: ReactNode;
  menu: ReactNode;
};

export function JobTaskRow({
  title,
  done,
  onOpen,
  completion,
  status,
  priority,
  assignee,
  dueDate,
  timer,
  subtasks,
  menu,
}: Props) {
  return (
    <div className="grid grid-cols-[28px_minmax(0,1fr)_32px] items-start gap-x-2 gap-y-2.5 px-4 py-3.5 @[900px]:grid-cols-[28px_minmax(220px,1fr)_112px_88px_32px_76px_32px_32px_32px] @[900px]:items-center @[900px]:gap-x-2">
      <div className="shrink-0">{completion}</div>

      <Button
        variant="ghost"
        className="h-auto min-h-7 min-w-0 justify-start whitespace-normal p-0 text-left hover:bg-transparent"
        onClick={onOpen}
        title={title}
      >
        <span
          className={cn(
            "line-clamp-2 min-w-0 text-sm font-medium leading-5",
            done && "text-muted-foreground line-through",
          )}
        >
          {title}
        </span>
      </Button>

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