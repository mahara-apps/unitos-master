/**
 * URL pública canônica da instalação (server-side).
 *
 * Cada instalação independente do Unitos tem seu próprio domínio, então NÃO
 * existe fallback hardcoded. A convenção já usada no projeto é `PUBLIC_APP_URL`
 * (integração Meta); `APP_URL` é aceita apenas por compatibilidade com a
 * configuração antiga de convites. Nenhuma variável nova é criada.
 *
 * Regra: nunca montar no servidor uma URL a partir de `window.location.origin`
 * nem enviar link relativo por e-mail/WhatsApp.
 */

export class AppUrlNotConfiguredError extends Error {
  code = "app_url_nao_configurada" as const;
  constructor() {
    super("app_url_nao_configurada");
    this.name = "AppUrlNotConfiguredError";
  }
}

function readRaw(): string | null {
  const raw = (process.env.PUBLIC_APP_URL || process.env.APP_URL || "").trim();
  return raw ? raw : null;
}

/** Normaliza para origem absoluta sem barra final. Lança se não configurada. */
export function getPublicAppUrl(): string {
  const raw = readRaw();
  if (!raw) throw new AppUrlNotConfiguredError();
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return withScheme.replace(/\/+$/, "");
}

/** Igual a `getPublicAppUrl`, mas retorna null em vez de lançar. */
export function tryGetPublicAppUrl(): string | null {
  try {
    return getPublicAppUrl();
  } catch {
    return null;
  }
}

/** Monta uma URL absoluta da instalação: `absoluteUrl("/invite/abc")`. */
export function absoluteUrl(path: string): string {
  const base = getPublicAppUrl();
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
}

/** Versão tolerante: retorna null quando a instalação não tem URL configurada. */
export function tryAbsoluteUrl(path: string): string | null {
  const base = tryGetPublicAppUrl();
  if (!base) return null;
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
}
