import { createServerFn } from "@tanstack/react-start";

/**
 * Logo pública da TELA DE LOGIN.
 *
 * Regras estruturais (fase 10F.2):
 * - a marca NUNCA é escolhida arbitrariamente ("última atualizada"): resolve-se
 *   por `LOGIN_BRAND_ID`/`LOGIN_BRAND_SLUG` da instância; sem essa configuração,
 *   só é aceita quando existe exatamente UMA marca com logo de login definida;
 *   em qualquer outro caso devolve `null` (a UI usa o branding neutro);
 * - o path é validado estruturalmente contra a marca resolvida
 *   (`<brand_id>/…` no bucket privado `brand-assets`), então nunca assina
 *   asset de outra marca;
 * - a URL assinada dura o mínimo necessário (10 min) e a superfície tem rate
 *   limit por IP, evitando emissão automatizada em massa.
 */
export const getLoginLogoFn = createServerFn({ method: "GET" }).handler(async () => {
  const empty = { url: null as string | null };
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getRequest } = await import("@tanstack/react-start/server");
    const { checkPublicRate, clientIp, rateKey } = await import("@/lib/public-rate-limit.server");

    let ip = "unknown";
    try {
      ip = clientIp(getRequest());
    } catch {
      /* fora de contexto de request: segue sem chave de IP */
    }
    const rate = await checkPublicRate(supabaseAdmin, rateKey("login-logo", ip), {
      max: 60,
      windowSeconds: 300,
      blockSeconds: 600,
    });
    if (rate.blocked) return empty;

    const brandId = process.env["LOGIN_BRAND_ID"]?.trim();
    const brandSlug = process.env["LOGIN_BRAND_SLUG"]?.trim();

    type BrandLogoRow = { id: string; login_logo_url: string | null };
    let brand: BrandLogoRow | null = null;

    if (brandId || brandSlug) {
      const q = supabaseAdmin.from("brands").select("id, login_logo_url");
      const { data } = brandId
        ? await q.eq("id", brandId).maybeSingle()
        : await q.eq("slug", brandSlug!).maybeSingle();
      // Marca inexistente configurada → falha fechada (branding neutro).
      brand = (data as BrandLogoRow | null) ?? null;
    } else {
      // Sem contexto explícito: aceita apenas instalação de marca única.
      const { data } = await supabaseAdmin
        .from("brands")
        .select("id, login_logo_url")
        .not("login_logo_url", "is", null)
        .limit(2);
      const rows = (data ?? []) as BrandLogoRow[];
      if (rows.length !== 1) return empty;
      brand = rows[0] ?? null;
    }

    if (!brand?.login_logo_url) return empty;

    const path = brand.login_logo_url;
    // Validação estrutural: o objeto precisa pertencer à marca resolvida.
    if (path.includes("..") || !path.startsWith(`${brand.id}/`)) return empty;

    const signed = await supabaseAdmin.storage.from("brand-assets").createSignedUrl(path, 600);
    return { url: signed.data?.signedUrl ?? null };
  } catch {
    return empty;
  }
});
