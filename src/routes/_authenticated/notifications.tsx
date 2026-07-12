import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CheckCircle2,
  MessageSquare,
  Sparkles,
  Clock,
  AlertCircle,
  UserPlus,
  Inbox,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { usePageHeader } from "@/hooks/use-page-header";
import {
  markAllNotificationsReadFn,
  markNotificationReadFn,
  type NotificationRow,
} from "@/lib/notifications.functions";
import {
  NOTIFICATIONS_QUERY_KEY,
  useNotifications,
} from "@/components/notifications/notifications-drawer";

export const Route = createFileRoute("/_authenticated/notifications")({
  component: NotificationsPage,
});

function iconFor(kind: NotificationRow["kind"]) {
  switch (kind) {
    case "mention": return MessageSquare;
    case "assignment": return UserPlus;
    case "approval_requested": return AlertCircle;
    case "approval_decision": return CheckCircle2;
    case "deadline": return Clock;
    default: return Sparkles;
  }
}
function colorFor(kind: NotificationRow["kind"]) {
  switch (kind) {
    case "mention": return "text-sky-400";
    case "assignment": return "text-violet-400";
    case "approval_requested": return "text-amber-400";
    case "approval_decision": return "text-emerald-400";
    case "deadline": return "text-rose-400";
    default: return "text-indigo-400";
  }
}
function relativeTime(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function NotificationsPage() {
  const qc = useQueryClient();
  const notifQ = useNotifications();
  const items = notifQ.data ?? [];
  const unread = items.filter((n) => !n.read_at).length;

  const markOneFn = useServerFn(markNotificationReadFn);
  const markAllFn = useServerFn(markAllNotificationsReadFn);

  const optimisticAll = () => {
    const now = new Date().toISOString();
    qc.setQueryData<NotificationRow[]>(NOTIFICATIONS_QUERY_KEY, (old) =>
      (old ?? []).map((n) => (n.read_at ? n : { ...n, read_at: now })),
    );
  };
  const optimisticOne = (id: string) => {
    const now = new Date().toISOString();
    qc.setQueryData<NotificationRow[]>(NOTIFICATIONS_QUERY_KEY, (old) =>
      (old ?? []).map((n) => (n.id === id ? { ...n, read_at: now } : n)),
    );
  };

  const markOne = useMutation({
    mutationFn: (id: string) => markOneFn({ data: { id } }),
    onMutate: (id) => optimisticOne(id),
    onSettled: () => qc.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY }),
  });
  const markAll = useMutation({
    mutationFn: () => markAllFn(),
    onMutate: () => optimisticAll(),
    onSettled: () => qc.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY }),
  });

  usePageHeader(
    {
      title: "Notifications",
      subtitle: unread > 0 ? `${unread} unread` : "All caught up",
      actions: (
        <div className="flex items-center gap-2">
          {unread > 0 ? (
            <Badge variant="outline" className="text-[10px]">
              {unread} new
            </Badge>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            disabled={unread === 0 || markAll.isPending}
            onClick={() => markAll.mutate()}
          >
            Mark all as read
          </Button>
        </div>
      ),
    },
    [unread, markAll.isPending],
  );

  if (!notifQ.isLoading && items.length === 0) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col items-center justify-center gap-2 p-16 text-center">
        <div className="rounded-full border border-border/60 bg-muted/40 p-4">
          <Inbox className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="text-base font-medium">All caught up!</p>
        <p className="text-sm text-muted-foreground">
          Mentions, approvals and deadlines will show up here.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <div className="divide-y divide-border/60 rounded-xl border border-border/60 bg-card/30">
        {notifQ.isLoading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3 px-4 py-3">
                <div className="mt-0.5 h-4 w-4 rounded bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-3/4 rounded bg-muted" />
                  <div className="h-2 w-1/3 rounded bg-muted/70" />
                </div>
              </div>
            ))
          : items.map((n) => {
              const Icon = iconFor(n.kind);
              const unreadRow = !n.read_at;
              const row = (
                <div className="flex items-start gap-3 px-4 py-3">
                  <Icon className={`mt-0.5 h-4 w-4 ${colorFor(n.kind)}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 text-sm font-medium">{n.title}</div>
                      {unreadRow ? (
                        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />
                      ) : null}
                    </div>
                    {n.body ? (
                      <div className="mt-0.5 text-xs text-muted-foreground">{n.body}</div>
                    ) : null}
                    <div className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground/70">
                      {relativeTime(n.created_at)}
                    </div>
                  </div>
                </div>
              );
              const handle = () => unreadRow && markOne.mutate(n.id);
              return (
                <div key={n.id} className="hover:bg-background/40">
                  {n.href ? (
                    <Link to={n.href} onClick={handle} className="block">
                      {row}
                    </Link>
                  ) : (
                    <button type="button" onClick={handle} className="block w-full text-left">
                      {row}
                    </button>
                  )}
                </div>
              );
            })}
      </div>
    </div>
  );
}
