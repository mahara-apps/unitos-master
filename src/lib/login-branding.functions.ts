import { createServerFn } from "@tanstack/react-start";

/**
 * Logo pública da TELA DE LOGIN.
 *
 * A tela de login não tem sessão, então o caminho no storage privado é
 * resolvido no servidor e devolvido como URL assinada. Retorna `null` quando
 * nenhuma marca configurou a logo do login (a UI cai no asset padrão).
 */
export const getLoginLogoFn = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("brands")
      .select("login_logo_url, updated_at")
      .not("login_logo_url", "is", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return { url: null as string | null };
    const path = (data as { login_logo_url: string | null }).login_logo_url;
    if (!path) return { url: null as string | null };
    const signed = await supabaseAdmin.storage
      .from("brand-assets")
      .createSignedUrl(path, 60 * 60 * 6);
    return { url: signed.data?.signedUrl ?? null };
  } catch {
    return { url: null as string | null };
  }
});
