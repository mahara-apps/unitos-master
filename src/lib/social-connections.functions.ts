import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const SUPPORTED_CHANNELS = [
  "instagram",
  "facebook",
  "linkedin",
  "tiktok",
  "youtube",
  "x",
  "threads",
] as const;
export type SocialChannel = (typeof SUPPORTED_CHANNELS)[number];

/**
 * Canais conectados por marca — usado pelo Composer.
 * Retorna cada conta publicável com um label amigável, nunca IDs técnicos
 * expostos ao usuário. O composer só permite escolher entre canais que a
 * marca já conectou em /connections.
 */

export type PublishableChannel = {
  connectionId: string;
  provider: string; // "meta"
  network: SocialChannel;
  placement: string; // "instagram_feed" | "facebook_feed" | ...
  label: string; // "Café Aurora · @cafeaurora"
  handle: string | null;
  avatarUrl: string | null;
  status: string;
};

const Input = z.object({ brandId: z.string().uuid() });

export const listBrandChannelsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Input.parse(i))
  .handler(async ({ data, context }): Promise<PublishableChannel[]> => {
    const { data: rows, error } = await context.supabase
      .from("social_connections")
      .select(
        "id, provider, channel, external_name, account_id, account_username, status, metadata",
      )
      .eq("brand_id", data.brandId)
      .in("status", ["active", "attention"])
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const out: PublishableChannel[] = [];
    for (const r of rows ?? []) {
      const meta = (r.metadata ?? {}) as Record<string, any>;
      const network = r.channel as SocialChannel;
      const placement =
        network === "facebook" ? "facebook_feed"
        : network === "instagram" ? "instagram_feed"
        : `${network}_feed`;
      const label =
        network === "instagram"
          ? (r.account_username ? `@${r.account_username}` : (r.external_name ?? "Instagram"))
          : (r.external_name ?? network);
      const avatar =
        network === "instagram"
          ? (meta.instagram_picture_url ?? meta.page_picture_url ?? null)
          : network === "facebook"
            ? (meta.page_picture_url ?? null)
            : null;
      out.push({
        connectionId: r.id,
        provider: r.provider,
        network,
        placement,
        label,
        handle: network === "instagram" ? r.account_username : (r.external_name ?? null),
        avatarUrl: avatar,
        status: r.status,
      });
    }
    return out;
  });

// ---------------------------------------------------------------------------
// Helper — IDs de conexões vinculadas a um cliente (client_social_accounts).
// Nunca usa o campo legado `social_connections.client_id`.
// ---------------------------------------------------------------------------
async function linkedConnectionIds(
  supabase: { from: (t: string) => any },
  brandId: string,
  clientId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("client_social_accounts")
    .select("connection_id")
    .eq("brand_id", brandId)
    .eq("client_id", clientId);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ connection_id: string }>).map((r) => r.connection_id);
}

// ---------------------------------------------------------------------------
// Existência de canal ativo — usado pelo prompt "Substituir conexão"
// ---------------------------------------------------------------------------
const ExistsInput = z.object({
  brandId: z.string().uuid(),
  clientId: z.string().uuid().nullish(),
  channel: z.enum(SUPPORTED_CHANNELS),
});

export const checkBrandChannelExistsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ExistsInput.parse(i))
  .handler(async ({ data, context }) => {
    let ids: string[] | null = null;
    if (data.clientId) {
      ids = await linkedConnectionIds(context.supabase as any, data.brandId, data.clientId);
      if (!ids.length) return { exists: false as const };
    }
    let q = context.supabase
      .from("social_connections")
      .select("id, external_name, account_username, provider")
      .eq("brand_id", data.brandId)
      .eq("channel", data.channel)
      .in("status", ["active", "attention"]);
    if (ids) q = q.in("id", ids);
    const { data: row, error } = await q
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return { exists: false as const };
    return {
      exists: true as const,
      connectionId: row.id,
      label: row.account_username
        ? `@${row.account_username}`
        : (row.external_name ?? row.provider),
    };
  });

// ---------------------------------------------------------------------------
// Resolver conexão pela marca + canal.
// Com clientId, resolve SOMENTE entre canais vinculados ao cliente.
// ---------------------------------------------------------------------------
const ResolveInput = z.object({
  brandId: z.string().uuid(),
  clientId: z.string().uuid().nullish(),
  channel: z.enum(SUPPORTED_CHANNELS),
});

export const resolveBrandChannelFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ResolveInput.parse(i))
  .handler(async ({ data, context }) => {
    let ids: string[] | null = null;
    if (data.clientId) {
      ids = await linkedConnectionIds(context.supabase as any, data.brandId, data.clientId);
      if (!ids.length) {
        throw new Error(
          `Nenhum canal ${data.channel} vinculado a este cliente. Vincule em Perfil do cliente > Canais.`,
        );
      }
    }
    let q = context.supabase
      .from("social_connections")
      .select("id, provider, channel, external_id, external_name, account_username, status")
      .eq("brand_id", data.brandId)
      .eq("channel", data.channel)
      .in("status", ["active", "attention"]);
    if (ids) q = q.in("id", ids);
    const { data: row, error } = await q
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) {
      throw new Error(
        `Nenhuma conta ${data.channel} conectada para esta marca. Conecte em /connections.`,
      );
    }
    return {
      connectionId: row.id,
      provider: row.provider,
      channel: row.channel,
      externalId: row.external_id,
      label: row.account_username
        ? `@${row.account_username}`
        : (row.external_name ?? row.provider),
    };
  });
