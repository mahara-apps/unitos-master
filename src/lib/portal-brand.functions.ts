import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveSessionScope, resolveTokenScope, scopedAdmin } from "@/lib/portal-scope.server";

/**
 * FASE 1 — "Minha Marca" no Portal: leitura do `clients.brand_hub` já existente.
 *
 * Sem RPC nova e sem alteração de RLS: o escopo (cliente + marca) continua sendo
 * resolvido exclusivamente por `portal_resolve` (token ou sessão) e só depois a
 * linha do cliente é lida. Somente leitura, apenas campos de marca.
 */

export type PortalBrandHub = {
  clientName: string | null;
  niche: string | null;
  toneOfVoice: string | null;
  updatedAt: string | null;
  hub: Record<string, unknown>;
};

async function readBrandHub(clientId: string, brandId: string): Promise<PortalBrandHub> {
  const admin = await scopedAdmin();
  const { data, error } = await admin
    .from("clients")
    .select("name, niche, tone_of_voice, brand_hub, briefing_updated_at, updated_at")
    .eq("id", clientId)
    .eq("brand_id", brandId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const row = (data ?? {}) as Record<string, unknown>;
  const hub = (row["brand_hub"] ?? {}) as Record<string, unknown>;
  return {
    clientName: (row["name"] as string) ?? null,
    niche: (row["niche"] as string) ?? null,
    toneOfVoice: (row["tone_of_voice"] as string) ?? null,
    updatedAt: (row["briefing_updated_at"] as string) ?? (row["updated_at"] as string) ?? null,
    hub: typeof hub === "object" && hub !== null ? hub : {},
  };
}

export const getPortalBrandHubFn = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ token: z.string().min(8) }).parse(i))
  .handler(async ({ data }): Promise<PortalBrandHub> => {
    const scope = await resolveTokenScope(data.token);
    return readBrandHub(scope.clientId, scope.brandId);
  });

export const getPortalSessionBrandHubFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ clientId: z.string().uuid().optional() }).parse(i ?? {}))
  .handler(async ({ context, data }): Promise<PortalBrandHub> => {
    const scope = await resolveSessionScope(
      (context as { supabase: unknown }).supabase,
      data.clientId ?? null,
    );
    return readBrandHub(scope.clientId, scope.brandId);
  });
