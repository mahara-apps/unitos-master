import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Canais conectados por marca — usado pelo Composer.
 * Retorna cada conta publicável com um label amigável, nunca IDs técnicos
 * expostos ao usuário. O composer só permite escolher entre canais que a
 * marca já conectou em /connections.
 */

export type PublishableChannel = {
  connectionId: string;
  provider: string; // "meta"
  network: "instagram" | "facebook" | "tiktok" | "linkedin" | "youtube" | "x" | "threads";
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
        "id, provider, external_name, account_id, account_username, status, metadata",
      )
      .eq("brand_id", data.brandId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const out: PublishableChannel[] = [];
    for (const r of rows ?? []) {
      const meta = (r.metadata ?? {}) as Record<string, any>;
      // Meta = 1 linha por Página → 2 canais publicáveis (FB + IG quando linkada).
      if (String(r.provider).startsWith("meta")) {
        // Facebook Feed sempre disponível
        out.push({
          connectionId: r.id,
          provider: r.provider,
          network: "facebook",
          placement: "facebook_feed",
          label: r.external_name ?? "Página do Facebook",
          handle: r.external_name ?? null,
          avatarUrl: meta.page_picture_url ?? null,
          status: r.status,
        });
        // Instagram Feed apenas se Business account estiver linkado
        if (r.account_id) {
          out.push({
            connectionId: r.id,
            provider: r.provider,
            network: "instagram",
            placement: "instagram_feed",
            label: r.account_username
              ? `@${r.account_username}`
              : (r.external_name ?? "Instagram Business"),
            handle: r.account_username ?? null,
            avatarUrl: meta.instagram_picture_url ?? meta.page_picture_url ?? null,
            status: r.status,
          });
        }
      }
      // Demais redes serão adicionadas quando publishers estiverem prontos.
    }
    return out;
  });