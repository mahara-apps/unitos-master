import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Bell,
  Sparkles,
  CheckCircle2,
  MessageSquare,
  UserPlus,
  Clock,
  AlertCircle,
  Inbox,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import {
  listMyNotificationsFn,
  markAllNotificationsReadFn,
  markNotificationReadFn,
  type NotificationRow,
} from "@/lib/notifications.functions";

export const NOTIFICATIONS_QUERY_KEY = ["notifications", "me"] as const;

function iconFor(kind: NotificationRow["kind"]) {
  switch (kind) {
    case "mention": return MessageSquare;
    case "assignment": return UserPlus;
    case "approval_requested": return AlertCircle;
    case "approval_decision": return CheckCircle2;
    case "deadline": return Clock;
    case "system":
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
    case "system":
    default: return "text-indigo-400";
  }
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - then);
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

export function useNotifications() {
  const listFn = useServerFn(listMyNotificationsFn);
  return useQuery({
    queryKey: NOTIFICATIONS_QUERY_KEY,
    queryFn: () => listFn(),
    staleTime: 30_000,
  });
}

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const notifQ = useNotifications();
  const items = notifQ.data ?? [];
  const unread = items.filter((n) => !n.read_at).length;

  const markOneFn = useServerFn(markNotificationReadFn);
  const markAllFn = useServerFn(markAllNotificationsReadFn);

  const markOne = useMutation({
    mutationFn: (id: string) => markOneFn({ data: { id } }),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
      const prev = qc.getQueryData<NotificationRow[]>(NOTIFICATIONS_QUERY_KEY);
      const now = new Date().toISOString();
      qc.setQueryData<NotificationRow[]>(NOTIFICATIONS_QUERY_KEY, (old) =>
        (old ?? []).map((n) => (n.id === id ? { ...n, read_at: now } : n)),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(NOTIFICATIONS_QUERY_KEY, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY }),
  });

  const markAll = useMutation({
    mutationFn: () => markAllFn(),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
      const prev = qc.getQueryData<NotificationRow[]>(NOTIFICATIONS_QUERY_KEY);
      const now = new Date().toISOString();
      qc.setQueryData<NotificationRow[]>(NOTIFICATIONS_QUERY_KEY, (old) =>
        (old ?? []).map((n) => (n.read_at ? n : { ...n, read_at: now })),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(NOTIFICATIONS_QUERY_KEY, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY }),
  });

  // Realtime: invalidate on any insert/update to my notifications.
  // Register `.on()` handlers BEFORE `.subscribe()` — Supabase Realtime rejects
  // additional postgres_changes callbacks once the channel has subscribed.
  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    supabase.auth.getUser().then(({ data }) => {
      const userId = data.user?.id ?? null;
      if (!userId || cancelled) return;
      const topic = `notif:${userId}`;
      // StrictMode / re-mount can leave an already-subscribed channel in
      // Supabase's client cache. Tear it down before rebuilding so `.on()`
      // is never called on a subscribed channel.
      for (const existing of supabase.getChannels()) {
        if (existing.topic === `realtime:${topic}` || existing.topic === topic) {
          supabase.removeChannel(existing);
        }
      }
      const ch = supabase.channel(topic);
      ch.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => qc.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY }),
      );
      ch.subscribe();
      channel = ch;
    });
    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [qc]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-8 w-8"
          aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}
        >
          <Bell className="h-4 w-4" />
          {unread > 0 ? (
            <span className="absolute right-1.5 top-1.5 flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500/70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500" />
            </span>
          ) : null}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="flex-row items-center justify-between space-y-0 border-b border-border/60 px-4 py-3">
          <div className="flex flex-col leading-tight">
            <SheetTitle className="text-sm">Recent activity</SheetTitle>
            <span className="text-[11px] text-muted-foreground">
              {unread > 0 ? `${unread} unread` : "All caught up"}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-[11px] text-muted-foreground hover:text-foreground"
            disabled={unread === 0 || markAll.isPending}
            onClick={() => markAll.mutate()}
          >
            Mark all as read
          </Button>
        </SheetHeader>

        <ScrollArea className="flex-1">
          {notifQ.isLoading ? (
            <ListSkeleton />
          ) : items.length === 0 ? (
            <EmptyState />
          ) : (
            <ul className="divide-y divide-border/60">
              {items.map((n) => {
                const Icon = iconFor(n.kind);
                const unreadRow = !n.read_at;
                const content = (
                  <div className="flex items-start gap-3 px-4 py-3">
                    <div className={`mt-0.5 shrink-0 ${colorFor(n.kind)}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-2">
                        <span className="line-clamp-2 flex-1 text-[13px] font-medium text-foreground">
                          {n.title}
                        </span>
                        {unreadRow ? (
                          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />
                        ) : null}
                      </div>
                      {n.body ? (
                        <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                          {n.body}
                        </p>
                      ) : null}
                      <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground/70">
                        {relativeTime(n.created_at)}
                      </p>
                    </div>
                  </div>
                );
                const handleClick = () => {
                  if (unreadRow) markOne.mutate(n.id);
                };
                return (
                  <li key={n.id} className="hover:bg-muted/40">
                    {n.href ? (
                      <Link
                        to={n.href}
                        onClick={() => {
                          handleClick();
                          setOpen(false);
                        }}
                        className="block"
                      >
                        {content}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={handleClick}
                        className="block w-full text-left"
                      >
                        {content}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>

        <div className="border-t border-border/60 p-3">
          <Button asChild variant="outline" className="w-full" size="sm">
            <Link to="/notifications" onClick={() => setOpen(false)}>
              View all notifications
            </Link>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ListSkeleton() {
  return (
    <ul className="divide-y divide-border/60">
      {Array.from({ length: 5 }).map((_, i) => (
        <li key={i} className="flex items-start gap-3 px-4 py-3">
          <div className="mt-0.5 h-4 w-4 rounded bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-3/4 rounded bg-muted" />
            <div className="h-2 w-1/2 rounded bg-muted/70" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-2 px-8 py-16 text-center">
      <div className="rounded-full border border-border/60 bg-muted/40 p-3">
        <Inbox className="h-5 w-5 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium">All caught up!</p>
      <p className="text-[11px] text-muted-foreground">
        You'll see mentions, approvals, and deadlines here as they happen.
      </p>
    </div>
  );
}
