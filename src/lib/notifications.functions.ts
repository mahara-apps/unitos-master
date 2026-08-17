import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import {
  NOTIFICATION_SCOPES,
  notificationWindow,
  type NotificationScope,
} from "@/lib/notifications-window";

export type NotificationRow = Database["public"]["Tables"]["notifications"]["Row"];

export type NotificationsFeed = {
  items: NotificationRow[];
  /** Contagem real de não lidas do usuário (independente da janela exibida). */
  unreadTotal: number;
};

const SELECT_COLUMNS =
  "id,brand_id,user_id,kind,title,body,href,payload,read_at,created_at,dedupe_key";

export const listMyNotificationsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({ scope: z.enum(NOTIFICATION_SCOPES).default("popup") })
      .default({ scope: "popup" })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }): Promise<NotificationsFeed> => {
    const { sinceIso, limit } = notificationWindow(data.scope as NotificationScope);

    const [list, unread] = await Promise.all([
      context.supabase
        .from("notifications")
        .select(SELECT_COLUMNS)
        .eq("user_id", context.userId)
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false })
        .limit(limit),
      // Contagem exata de não lidas — não derivada da lista paginada.
      context.supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", context.userId)
        .is("read_at", null),
    ]);

    if (list.error) throw list.error;
    if (unread.error) throw unread.error;

    return {
      items: (list.data ?? []) as NotificationRow[],
      unreadTotal: unread.count ?? 0,
    };
  });

export const markNotificationReadFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<{ ok: true; unreadTotal: number }> => {
    const { error } = await context.supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .is("read_at", null);
    if (error) throw error;
    const { count, error: cErr } = await context.supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId)
      .is("read_at", null);
    if (cErr) throw cErr;
    return { ok: true, unreadTotal: count ?? 0 };
  });

export const markAllNotificationsReadFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: true; unreadTotal: number }> => {
    const { error } = await context.supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", context.userId)
      .is("read_at", null);
    if (error) throw error;
    return { ok: true, unreadTotal: 0 };
  });
