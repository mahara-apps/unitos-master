import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bell, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ExpandedModal } from "@/components/ui/expanded-modal";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import {
  listMyNotificationsFn,
  markAllNotificationsReadFn,
  markNotificationReadFn,
  type NotificationsFeed,
} from "@/lib/notifications.functions";
import type { NotificationScope } from "@/lib/notifications-window";
import { colorFor, iconFor, relativeTimePtBr } from "@/lib/notifications-format";

/** Prefixo usado para invalidar todos os escopos (popup + inbox) de uma vez. */
export const NOTIFICATIONS_QUERY_ROOT = ["notifications", "me"] as const;
export const notificationsQueryKey = (scope: NotificationScope): QueryKey => [
  ...NOTIFICATIONS_QUERY_ROOT,
  scope,
];
/** @deprecated use notificationsQueryKey(scope) */
export const NOTIFICATIONS_QUERY_KEY = notificationsQueryKey("popup");

const EMPTY_FEED: NotificationsFeed = { items: [], unreadTotal: 0 };

export function useNotifications(scope: NotificationScope = "popup") {
  const listFn = useServerFn(listMyNotificationsFn);
  return useQuery<NotificationsFeed>({
    queryKey: notificationsQueryKey(scope),
    queryFn: () => listFn({ data: { scope } }),
    staleTime: 30_000,
  });
}

/**
 * Leitura persistida (servidor) + atualização otimista do cache.
 * Nunca apenas estado local de React.
 */
export function useNotificationReads(scope: NotificationScope = "popup") {
  const qc = useQueryClient();
  const key = notificationsQueryKey(scope);
  const markOneFn = useServerFn(markNotificationReadFn);
  const markAllFn = useServerFn(markAllNotificationsReadFn);

  const patch = (updater: (feed: NotificationsFeed) => NotificationsFeed) =>
    qc.setQueryData<NotificationsFeed>(key, (old) => updater(old ?? EMPTY_FEED));

  const invalidate = () => qc.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_ROOT });

  const markOne = useMutation({
    mutationFn: (id: string) => markOneFn({ data: { id } }),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<NotificationsFeed>(key);
      const now = new Date().toISOString();
      patch((feed) => {
        const wasUnread = feed.items.some((n) => n.id === id && !n.read_at);
        return {
          items: feed.items.map((n) => (n.id === id ? { ...n, read_at: n.read_at ?? now } : n)),
          unreadTotal: Math.max(0, feed.unreadTotal - (wasUnread ? 1 : 0)),
        };
      });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSuccess: (res) => {
      if (res && typeof res.unreadTotal === "number") {
        patch((feed) => ({ ...feed, unreadTotal: res.unreadTotal }));
      }
    },
    onSettled: invalidate,
  });

  const markAll = useMutation({
    mutationFn: () => markAllFn(),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<NotificationsFeed>(key);
      const now = new Date().toISOString();
      patch((feed) => ({
        items: feed.items.map((n) => (n.read_at ? n : { ...n, read_at: now })),
        unreadTotal: 0,
      }));
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSettled: invalidate,
  });

  return { markOne, markAll };
}

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const notifQ = useNotifications("popup");
  const feed = notifQ.data ?? EMPTY_FEED;
  const items = feed.items;
  const unread = feed.unreadTotal;
  const { markOne, markAll } = useNotificationReads("popup");

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
      for (const existing of supabase.getChannels()) {
        if (existing.topic === `realtime:${topic}` || existing.topic === topic) {
          supabase.removeChannel(existing);
        }
      }
      const ch = supabase.channel(topic);
      ch.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => qc.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_ROOT }),
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
    <>
      <Button
        variant="ghost"
        size="icon"
        className="relative h-8 w-8"
        aria-label={`Notificações${unread ? ` (${unread} não lida${unread === 1 ? "" : "s"})` : ""}`}
        onClick={() => setOpen(true)}
      >
        <Bell className="h-4 w-4" />
        {unread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex min-h-[16px] min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold leading-none text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </Button>
      <ExpandedModal
        open={open}
        onOpenChange={setOpen}
        size="xs"
        title="Notificações"
        description={unread > 0 ? `${unread} não lida${unread === 1 ? "" : "s"}` : "Tudo em dia"}
        bodyClassName="flex flex-col overflow-hidden p-0"
        headerExtra={
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-[11px] text-muted-foreground hover:text-foreground"
            disabled={unread === 0 || markAll.isPending}
            onClick={() => markAll.mutate()}
          >
            Marcar todas como lidas
          </Button>
        }
        footer={
          <Button asChild variant="outline" className="w-full" size="sm">
            <Link to="/notifications" onClick={() => setOpen(false)}>
              Ver todas as notificações
            </Link>
          </Button>
        }
        footerClassName="sm:justify-stretch"
      >
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
                  <div
                    className={`flex items-start gap-3 px-4 py-3 ${unreadRow ? "" : "opacity-60"}`}
                  >
                    <div className={`mt-0.5 shrink-0 ${colorFor(n.kind)}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-2">
                        <span
                          className={`line-clamp-2 flex-1 text-[13px] text-foreground ${unreadRow ? "font-medium" : "font-normal"}`}
                        >
                          {n.title}
                        </span>
                        {unreadRow ? (
                          <span
                            aria-label="Não lida"
                            className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500"
                          />
                        ) : null}
                      </div>
                      {n.body ? (
                        <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                          {n.body}
                        </p>
                      ) : null}
                      <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground/70">
                        {relativeTimePtBr(n.created_at)}
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
      </ExpandedModal>
    </>
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
            <div className="h-2 w-1/3 rounded bg-muted/70" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-1 px-6 py-14 text-center">
      <Inbox className="mb-1 h-6 w-6 text-muted-foreground/60" />
      <p className="text-[13px] font-medium text-foreground">Você está em dia</p>
      <p className="text-[11px] text-muted-foreground">Nenhuma nova notificação.</p>
    </div>
  );
}
