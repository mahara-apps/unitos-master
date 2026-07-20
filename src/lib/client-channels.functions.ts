import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Vínculo N:N entre clientes e contas sociais (social_connections) do
 * workspace/marca. As contas são conectadas globalmente em /connections
 * e atribuídas a cada cliente a partir do perfil do cliente.
 */

export type ClientChannelRow = {
  connectionId: string;
  channel: string;
  provider: string;
  accountLabel: string;
  handle: string | null;
  avatarUrl: string | null;
  status: string;
  assigned: boolean;
};

const ListInput = z.object({
  brandId: z.string().uuid(),
  clientId: z.string().uuid(),
});

export const listClientChannelAssignmentsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ListInput.parse(i))
  .handler(async ({ data, context }): Promise<ClientChannelRow[]> => {
    const [connsRes, assignsRes] = await Promise.all([
      context.supabase
        .from("social_connections")
        .select(
          "id, provider, channel, external_name, account_username, status, metadata",
        )
        .eq("brand_id", data.brandId)
        .in("status", ["active", "attention"])
        .order("channel", { ascending: true }),
      context.supabase
        .from("client_social_accounts")
        .select("connection_id")
        .eq("client_id", data.clientId),
    ]);
    if (connsRes.error) throw new Error(connsRes.error.message);
    if (assignsRes.error) throw new Error(assignsRes.error.message);

    const assigned = new Set((assignsRes.data ?? []).map((r) => r.connection_id));

    return (connsRes.data ?? []).map((r) => {
      const meta = (r.metadata ?? {}) as Record<string, unknown>;
      const avatar =
        r.channel === "instagram"
          ? ((meta.instagram_picture_url ?? meta.page_picture_url ?? null) as
              | string
              | null)
          : r.channel === "facebook"
            ? ((meta.page_picture_url ?? null) as string | null)
            : null;
      const handle =
        r.channel === "instagram"
          ? (r.account_username ?? null)
          : (r.external_name ?? null);
      return {
        connectionId: r.id as string,
        channel: r.channel as string,
        provider: r.provider as string,
        accountLabel: (r.external_name ?? handle ?? r.channel) as string,
        handle,
        avatarUrl: avatar,
        status: r.status as string,
        assigned: assigned.has(r.id),
      };
    });
  });

const ToggleInput = z.object({
  brandId: z.string().uuid(),
  clientId: z.string().uuid(),
  connectionId: z.string().uuid(),
  assigned: z.boolean(),
});

export const toggleClientChannelFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ToggleInput.parse(i))
  .handler(async ({ data, context }) => {
    // Sanity: a conexão deve pertencer à marca antes de atribuir.
    const { data: conn, error: cErr } = await context.supabase
      .from("social_connections")
      .select("id, brand_id")
      .eq("id", data.connectionId)
      .eq("brand_id", data.brandId)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!conn) throw new Error("Conta social não pertence a esta marca.");

    if (data.assigned) {
      const { error } = await context.supabase
        .from("client_social_accounts")
        .upsert(
          {
            brand_id: data.brandId,
            client_id: data.clientId,
            connection_id: data.connectionId,
            created_by: context.userId,
          },
          { onConflict: "client_id,connection_id" },
        );
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase
        .from("client_social_accounts")
        .delete()
        .eq("client_id", data.clientId)
        .eq("connection_id", data.connectionId);
      if (error) throw new Error(error.message);
    }
    return { ok: true, assigned: data.assigned };
  });