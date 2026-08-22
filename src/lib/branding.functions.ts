import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RpcClient } from "@/lib/access-guard";
import { assertSuperAdmin } from "@/lib/super-admin";

type Kind = "logo_light" | "logo_dark" | "icon" | "logo_login";

const COLUMN: Record<Kind, "logo_url" | "logo_dark_url" | "icon_url" | "login_logo_url"> = {
  logo_light: "logo_url",
  logo_dark: "logo_dark_url",
  icon: "icon_url",
  logo_login: "login_logo_url",
};

/**
 * Identidade visual é white label do ambiente: SOMENTE Super Admin altera
 * (owner/manager da marca continuam apenas visualizando). Leitura segue aberta
 * a qualquer usuário autenticado, pois alimenta sidebar/login.
 */
async function assertIdentityWriter(supabase: SupabaseClient, userId: string) {
  await assertSuperAdmin(supabase as unknown as RpcClient, userId);
}

export const updateBrandBranding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { brandId: string; kind: Kind; storagePath: string | null }) => {
    if (!input?.brandId) throw new Error("brandId required");
    if (!["logo_light", "logo_dark", "icon", "logo_login"].includes(input.kind)) throw new Error("invalid kind");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertManager(supabase, userId, data.brandId);
    const col = COLUMN[data.kind];
    const { error } = await supabase
      .from("brands")
      .update({ [col]: data.storagePath } as never)
      .eq("id", data.brandId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getBrandBranding = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { brandId: string }) => {
    if (!input?.brandId) throw new Error("brandId required");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("brands")
      .select("logo_url, logo_dark_url, icon_url, login_logo_url")
      .eq("id", data.brandId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return {
      logo_light: (row?.logo_url as string | null) ?? null,
      logo_dark: (row?.logo_dark_url as string | null) ?? null,
      icon: (row?.icon_url as string | null) ?? null,
      logo_login: (row?.login_logo_url as string | null) ?? null,
    };
  });
