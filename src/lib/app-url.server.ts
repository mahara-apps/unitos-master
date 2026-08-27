/**
 * URL canônica da INSTALAÇÃO ATUAL (server-only).
 *
 * CAUSA RAIZ CORRIGIDA AQUI: a URL vinha de variável de ambiente
 * (`PUBLIC_APP_URL` / `APP_URL` / `APP_PUBLIC_URL`). Quando o `.env` é copiado
 * entre instalações — cenário real de multi-instalação do Unitos — todas as
 * instalações passam a gerar links do MESMO domínio, e o convite da instalação
 * A chega apontando para a instalação B.
 *
 * Nova ordem de resolução (determinística, por requisição):
 *   1. Host real da requisição que originou o evento (`x-forwarded-host`/`host`)
 *      — é sempre a própria instalação que está atendendo o usuário.
 *   2. Variável de ambiente, SOMENTE quando não existe requisição (cron/worker).
 *   3. Falha explícita (`AppUrlNotConfiguredError`). Nunca há fallback fixo,
 *      valor de exemplo ou domínio de outra instalação.
 *
 * Quando o env divergir do host da requisição, o host da requisição vence e a
 * divergência é registrada — o env é justamente o vetor do vazamento.
 */

export class AppUrlNotConfiguredError extends Error {
  code = "app_url_nao_configurada" as const;
  constructor() {
    super("app_url_nao_configurada");
    this.name = "AppUrlNotConfiguredError";
  }
}

function normalizeOrigin(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withScheme);
    if (!url.hostname) return null;
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

/** Origem derivada da requisição atual (fonte autoritativa da instalação). */
export function requestOrigin(): string | null {
  try {
    // Import síncrono não é possível aqui sem tornar o módulo dependente do
    // runtime em testes puros; usa require dinâmico protegido.
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const mod = require("@tanstack/react-start/server") as {
      getRequestHeader?: (name: string) => string | undefined;
    };
    const get = mod.getRequestHeader;
    if (!get) return null;
    const forwardedHost = get("x-forwarded-host");
    const host = forwardedHost ?? get("host");
    if (!host) return null;
    const proto = get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
    return normalizeOrigin(`${proto}://${host.split(",")[0]!.trim()}`);
  } catch {
    return null;
  }
}

/** Origem configurada por env — usada apenas fora de uma requisição. */
export function configuredOrigin(): string | null {
  return normalizeOrigin(
    process.env.PUBLIC_APP_URL ?? process.env.APP_PUBLIC_URL ?? process.env.APP_URL ?? null,
  );
}

/**
 * URL canônica da instalação atual. Lança quando não é possível determiná-la —
 * preferimos falhar do que enviar um link de outra instalação.
 */
export function getPublicAppUrl(): string {
  const fromRequest = requestOrigin();
  const fromEnv = configuredOrigin();
  if (fromRequest) {
    if (fromEnv && fromEnv !== fromRequest) {
      console.warn(
        `[app-url] env aponta para outra instalação (${fromEnv}); usando o host da requisição (${fromRequest})`,
      );
    }
    return fromRequest;
  }
  if (fromEnv) return fromEnv;
  throw new AppUrlNotConfiguredError();
}

/** Igual a `getPublicAppUrl`, mas retorna null em vez de lançar. */
export function tryGetPublicAppUrl(): string | null {
  try {
    return getPublicAppUrl();
  } catch {
    return null;
  }
}

/** Monta uma URL absoluta da instalação atual: `absoluteUrl("/invite/abc")`. */
export function absoluteUrl(path: string): string {
  const base = getPublicAppUrl();
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
}

/** Versão tolerante: retorna null quando a instalação não pôde ser resolvida. */
export function tryAbsoluteUrl(path: string): string | null {
  const base = tryGetPublicAppUrl();
  if (!base) return null;
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
}
