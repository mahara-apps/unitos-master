import { z } from "zod";
import {
  CalendarDays,
  Kanban,
  ListTodo,
  User as UserIcon,
} from "lucide-react";

export const VIEWS = ["list", "kanban", "calendar", "mine"] as const;
export type View = (typeof VIEWS)[number];

export const searchSchema = z.object({
  view: z.enum(VIEWS).catch("list"),
  taskId: z.string().uuid().optional(),
  groupBy: z
    .enum(["none", "status", "priority", "project", "client", "assignee"])
    .catch("status"),
  sort: z
    .enum([
      "title",
      "assignee",
      "project",
      "client",
      "priority",
      "status",
      "due",
      "created",
      "time",
    ])
    .catch("created"),
  dir: z.enum(["asc", "desc"]).catch("desc"),
  q: z.string().optional(),
});

export type TasksSearch = z.infer<typeof searchSchema>;

export const VIEW_META: Record<View, { label: string; icon: typeof ListTodo }> = {
  list: { label: "Lista", icon: ListTodo },
  kanban: { label: "Kanban", icon: Kanban },
  calendar: { label: "Calendário", icon: CalendarDays },
  mine: { label: "Minhas tarefas", icon: UserIcon },
};
