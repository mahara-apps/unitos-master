import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Kind = "logo_light" | "logo_dark" | "icon";

const COLUMN: Record<Kind, "logo_url" | "logo_dark_url" | "icon_url"> = {
  logo_light: "logo_url",
  logo_dark: "logo_dark_url",
  icon: "icon_url",
};

async function assertManager(
  supabase: Awaited<ReturnType<typeof requireSupabaseAuth.server>>["context"]["supabase"],
  userId: string,
  brandId: string,
) {
  // Uses RLS-scoped client. Fetch membership to check role owner/manager.
  const { data, error } = await supabase
    .from("brand_members")
    .select("role")
    .eq("brand_id", brandId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || (data.role !== "owner" && data.role !== "manager")) {
    // Super admin fallback via RPC
    const { data: sa } = await supabase.rpc("is_super_admin", { _user_id: userId } as never);
    if (!sa) throw new Error("forbidden");
  }
}

export const updateBrandBranding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { brandId: string; kind: Kind; storagePath: string | null }) => {
    if (!input?.brandId) throw new Error("brandId required");
    if (!["logo_light", "logo_dark", "icon"].includes(input.kind)) throw new Error("invalid kind");
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
      .select("logo_url, logo_dark_url, icon_url")
      .eq("id", data.brandId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return {
      logo_light: (row?.logo_url as string | null) ?? null,
      logo_dark: (row?.logo_dark_url as string | null) ?? null,
      icon: (row?.icon_url as string | null) ?? null,
    };
  });