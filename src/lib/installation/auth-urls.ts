/**
 * Endereços de login de cada instalação (Site URL + lista de redirecionamentos
 * autorizados do Supabase Auth). Sem isso o Supabase ignora o `redirectTo` e
 * envia links de redefinição/convite para `http://localhost:3000`.
 */

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/i;

export function normalizeInstallationOrigin(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    if (!url.hostname || LOCAL_HOST.test(url.hostname)) return null;
    return `https://${url.host}`;
  } catch {
    return null;
  }
}

export const AUTH_REDIRECT_PATHS = ["/reset-password", "/login", "/invite/**", "/**"] as const;

/** Monta o patch de `/config/auth`, mesclando autorizados existentes. */
export function buildAuthUrlPatch(
  domain: string | null | undefined,
  existingAllowList: string | null | undefined,
): { ok: true; patch: { site_url: string; uri_allow_list: string } } | { ok: false; reason: string } {
  const origin = normalizeInstallationOrigin(domain);
  if (!origin) return { ok: false, reason: "instalação sem domínio válido cadastrado" };
  const existing = (existingAllowList ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s && !/localhost|127\.0\.0\.1/i.test(s));
  const wanted = [origin, ...AUTH_REDIRECT_PATHS.map((p) => `${origin}${p}`)];
  const merged = Array.from(new Set([...existing, ...wanted]));
  return { ok: true, patch: { site_url: origin, uri_allow_list: merged.join(",") } };
}

/** Confere se a configuração atual já envia links para a própria instalação. */
export function checkAuthUrls(
  domain: string | null | undefined,
  config: { site_url?: string | null; uri_allow_list?: string | null },
): { ok: boolean; problems: string[] } {
  const origin = normalizeInstallationOrigin(domain);
  if (!origin) return { ok: false, problems: ["instalação sem domínio válido cadastrado"] };
  const problems: string[] = [];
  const site = normalizeInstallationOrigin(config.site_url);
  if (!site) problems.push("endereço principal do login está vazio ou em localhost");
  else if (site !== origin) problems.push(`endereço principal do login aponta para ${site}`);
  const allow = (config.uri_allow_list ?? "").split(",").map((s) => s.trim());
  if (!allow.includes(`${origin}/reset-password`) && !allow.includes(`${origin}/**`)) {
    problems.push("página de nova senha não está autorizada");
  }
  return { ok: problems.length === 0, problems };
}
