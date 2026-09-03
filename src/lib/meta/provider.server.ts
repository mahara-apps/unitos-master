// Meta (Facebook / Instagram) Graph API provider.
// Server-only. Encapsulates OAuth, token lifecycle and Graph calls so the
// rest of the app never talks to graph.facebook.com directly.

import { peekMetaAppTypeSync } from "./app-config.server";
import {
  MAX_PAGES_PER_EDGE,
  MAX_PORTFOLIOS_PER_SCAN,
  PORTFOLIO_CONCURRENCY,
  SCAN_DEADLINE_MS,
  createGraphTelemetry,
  isRateLimitError,
  mapLimit,
  shouldRetryWithSmallerFields,
  type GraphStopReason,
  type GraphTelemetry,
} from "./graph-budget";


const GRAPH_VERSION = "v22.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
const OAUTH_DIALOG = `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`;

export const META_DEFAULT_SCOPES = [
  // Facebook Pages
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  // Instagram Business
  "instagram_basic",
  "instagram_manage_insights",
  "instagram_content_publish",
  // Threads — requer o produto "Threads API" adicionado no App Meta Dashboard.
  // Reative quando o produto estiver ativo:
  // "threads_basic",
  // "threads_manage_insights",
  // "threads_content_publish",
  // Meta Ads
  "ads_read",
  // Portfólios empresariais: sem isto só enxergamos as Páginas em que o usuário
  // é admin direto, o que esconde a maior parte dos ativos de uma agência.
  "business_management",
];

export const META_BUSINESS_PORTFOLIO_SCOPE = "business_management";

export function getMetaScopesForChannel(channel?: MetaChannel | null): string[] {
  if (channel === "instagram") {
    return [
      "pages_show_list",
      "pages_read_engagement",
      "pages_manage_posts",
      "instagram_basic",
      "instagram_manage_insights",
      "instagram_content_publish",
      META_BUSINESS_PORTFOLIO_SCOPE,
    ];
  }
  if (channel === "facebook") {
    return [
      "pages_show_list",
      "pages_read_engagement",
      "pages_manage_posts",
      META_BUSINESS_PORTFOLIO_SCOPE,
    ];
  }
  if (channel === "ads") {
    return ["ads_read", META_BUSINESS_PORTFOLIO_SCOPE];
  }
  return META_DEFAULT_SCOPES;
}

export type MetaPageAsset = {
  pageId: string;
  pageName: string;
  pageAccessToken: string;
  category?: string;
  tasks?: string[];
  instagramBusinessId?: string;
  instagramUsername?: string;
  pagePictureUrl?: string;
  instagramPictureUrl?: string;
  /** Business Portfolio (Business Manager) que detém/compartilha o ativo. */
  businessId?: string | null;
  businessName?: string | null;
};

/** Instagram Business account assigned to a portfolio with no manageable Page. */
export type MetaInstagramAsset = {
  instagramId: string;
  username: string | null;
  name: string | null;
  pictureUrl: string | null;
  businessId: string | null;
  businessName: string | null;
};

/** Business Portfolio (Business Manager) acessível pela autorização atual. */
export type MetaBusiness = { id: string; name: string | null };

export type MetaPortfolioScan = {
  pages: MetaPageAsset[];
  standaloneInstagram: MetaInstagramAsset[];
  /** Non-fatal problems (e.g. a portfolio edge we could not read). */
  warnings: string[];
  businessCount: number;
  /** Portfólios empresariais acessíveis por esta autorização. */
  businesses: MetaBusiness[];
  /** Graph requests actually performed by this scan (observability). */
  requestCount: number;
  /** Whether the Business Portfolio traversal ran. */
  deep: boolean;
  /** Por que a varredura terminou (completed | deadline | page_cap | ...). */
  stopReason: GraphStopReason;
  /** Resumo estruturado de consumo desta varredura (log/telemetria). */
  telemetry: ReturnType<GraphTelemetry["finish"]> | null;
};


/**
 * Rate limits and expired tokens must abort the whole scan; permission errors
 * on a single portfolio edge are recorded as warnings instead.
 */
export function isFatalScanError(err: unknown): boolean {
  if (!(err instanceof MetaGraphError)) return true;
  // Rate limit (4/17/32/341/613) e token inválido (190) abortam a varredura
  // inteira: insistir em outras arestas só piora o estouro de quota.
  if (isRateLimitError(err)) return true;
  return err.graph?.code === 190;
}

export type MetaUser = { id: string; name?: string; email?: string };

export type MetaThreadsAccount = {
  threadsUserId: string;
  username: string | null;
  name: string | null;
  pictureUrl: string | null;
  /** Threads uses long-lived user tokens; we store what we captured. */
  accessToken: string;
  linkedViaPageId?: string;
};

export type MetaAdAccount = {
  adAccountId: string; // e.g. "act_1234567890"
  name: string | null;
  currency: string | null;
  timezone: string | null;
  accountStatus: number | null;
  businessName: string | null;
};

export type MetaTokenInfo = {
  accessToken: string;
  tokenType: string;
  expiresIn?: number;
  expiresAt?: Date;
};

export type GraphErrorShape = {
  message: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  fbtrace_id?: string;
};

export class MetaGraphError extends Error {
  status: number;
  graph?: GraphErrorShape;
  constructor(message: string, status: number, graph?: GraphErrorShape) {
    super(message);
    this.name = "MetaGraphError";
    this.status = status;
    this.graph = graph;
  }
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Meta integration is not configured: missing ${name}`);
  return v;
}

export const META_CALLBACK_PATH = "/api/public/meta/callback";

/**
 * Resolves the OAuth redirect URI for the current request origin.
 *
 * Deterministic by design: the URI must match EXACTLY one of the entries
 * registered in the Meta App Dashboard, so we only ever return
 * `META_REDIRECT_URI` unless the request host is *explicitly* allow-listed:
 *  - it is exactly the host of `META_REDIRECT_URI`, or
 *  - it is listed in `META_EXTRA_REDIRECT_HOSTS` (comma separated — put here
 *    only hosts that are also registered in the Meta App).
 *
 * No subdomain wildcards, no preview/hosting heuristics: those produced URIs
 * that Meta rejects with "URL bloqueada".
 */
export function resolveMetaRedirectUri(origin?: string | null): string {
  const configured = requireEnv("META_REDIRECT_URI");
  if (!origin) return configured;
  try {
    const candidate = new URL(origin);
    if (candidate.protocol !== "https:") return configured;
    const configuredHost = new URL(configured).host.toLowerCase();
    const extraHosts = (process.env.META_EXTRA_REDIRECT_HOSTS ?? "")
      .split(/[,\s]+/)
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean);
    const host = candidate.host.toLowerCase();
    if (host !== configuredHost && !extraHosts.includes(host)) return configured;
    return `${candidate.origin}${META_CALLBACK_PATH}`;
  } catch {
    return configured;
  }
}

/**
 * Facebook Login for Business — `config_id` de uma "Configuração de login"
 * criada no App Meta Dashboard (Facebook Login for Business → Configurations).
 *
 * Com `config_id`, a Meta apresenta o consentimento de portfólio empresarial:
 * o usuário escolhe o Business Portfolio e os ativos que o app pode usar. Sem
 * ele, o app cai no modo LEGADO (somente `scope`), no qual o consentimento
 * costuma expor apenas Páginas em que o usuário é admin direto.
 */
/**
 * Config ID GLOBAL (env) — válido apenas quando a instalação está em
 * "Unitos — App Meta oficial". Em modo `client` o env é ignorado e esta função
 * devolve `null`, para que nenhum chamador novo misture o Config ID do App
 * oficial com o App próprio do cliente. O caminho correto é
 * `resolveMetaBusinessConfigId()` de `@/lib/meta/app-config.server`.
 */
export function metaBusinessConfigId(): string | null {
  if (peekMetaAppTypeSync() === "client") return null;
  const v = process.env.META_BUSINESS_CONFIG_ID?.trim();
  return v ? v : null;
}

export type MetaOAuthModeDiagnostics = {
  mode: "business_login" | "legacy_scopes";
  configId: string | null;
  /** Explica a limitação quando o modo legado está em uso. */
  note: string;
};

export function metaOAuthModeDiagnostics(explicitConfigId?: string | null): MetaOAuthModeDiagnostics {
  const configId = explicitConfigId !== undefined ? explicitConfigId : metaBusinessConfigId();
  return configId
    ? {
        mode: "business_login",
        configId,
        note: "Facebook Login for Business ativo: o consentimento inclui a escolha do Business Portfolio e dos ativos.",
      }
    : {
        mode: "legacy_scopes",
        configId: null,
        note: 'Modo legado (apenas "scope"). Configure META_BUSINESS_CONFIG_ID com o ID de uma configuração de Facebook Login for Business para que administradores da agência autorizem ativos do Business Portfolio.',
      };
}

export type MetaBusinessConfigCheck = {
  configId: string | null;
  valid: boolean;
  /** Motivo em pt-BR quando a configuração não pode ser usada. */
  reason: string | null;
};

/**
 * Valida o `config_id` do Facebook Login for Business ANTES de montar a URL de
 * consentimento.
 *
 * Sem esta checagem, um `config_id` de outro App, inexistente ou sem permissões
 * selecionadas produz uma URL que a Meta rejeita com
 * "This app needs at least one supported permission" — erro que parece de RBAC
 * mas é de configuração do App Meta. Quando a configuração é inválida o
 * chamador cai para o modo legado (`scope`) e o motivo é propagado, nunca
 * mascarado.
 */
export async function validateBusinessConfig(opts?: {
  appId?: string;
  appSecret?: string;
  configId?: string | null;
  fetchImpl?: typeof fetch;
}): Promise<MetaBusinessConfigCheck> {
  const configId = opts?.configId !== undefined ? opts.configId : metaBusinessConfigId();
  if (!configId) return { configId: null, valid: false, reason: null };

  let appId: string;
  let appSecret: string;
  try {
    appId = opts?.appId ?? requireEnv("META_APP_ID");
    appSecret = opts?.appSecret ?? requireEnv("META_APP_SECRET");
  } catch (err) {
    return {
      configId,
      valid: false,
      reason: err instanceof Error ? err.message : "App Meta não configurado.",
    };
  }

  const doFetch = opts?.fetchImpl ?? fetch;
  const url = new URL(`${GRAPH_BASE}/${configId}`);
  url.searchParams.set("fields", "id,name,permissions,access_type,login_variation");
  url.searchParams.set("access_token", `${appId}|${appSecret}`);

  try {
    const res = await doFetch(url.toString());
    const body = (await res.json().catch(() => null)) as
      | { id?: string; permissions?: unknown; error?: { message?: string } }
      | null;
    if (!res.ok || !body?.id) {
      const detail = body?.error?.message ?? `HTTP ${res.status}`;
      return {
        configId,
        valid: false,
        reason: `Configuração de login (config_id) inválida para este App Meta: ${detail}`,
      };
    }
    const perms = body.permissions;
    const permCount = Array.isArray(perms)
      ? perms.length
      : Array.isArray((perms as { data?: unknown[] } | undefined)?.data)
        ? ((perms as { data: unknown[] }).data.length)
        : null;
    if (permCount === 0) {
      return {
        configId,
        valid: false,
        reason:
          "A configuração de login existe, mas não tem nenhuma permissão selecionada no App Meta.",
      };
    }
    return { configId, valid: true, reason: null };
  } catch (err) {
    return {
      configId,
      valid: false,
      reason: `Não foi possível validar a configuração de login na Meta: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }
}





export class MetaProvider {
  private appIdOverride: string | null;
  private appSecretOverride: string | null;
  /** Credenciais resolvidas (env do App oficial ou App próprio da instalação). */
  private resolved: { appId: string; appSecret: string } | null = null;
  /**
   * The redirect URI must match EXACTLY what is registered in the Meta App
   * Dashboard (Facebook Login → Valid OAuth Redirect URIs).
   */
  redirectUri: string;

  constructor(opts?: {
    appId?: string;
    appSecret?: string;
    redirectUri?: string;
    /** Request origin used to derive the redirect URI when not given. */
    origin?: string | null;
  }) {
    this.appIdOverride = opts?.appId ?? null;
    this.appSecretOverride = opts?.appSecret ?? null;
    this.redirectUri = opts?.redirectUri ?? resolveMetaRedirectUri(opts?.origin ?? null);
  }

  /**
   * Resolve as credenciais do App Meta em uso NESTA instalação.
   *
   * `unitos` (padrão) → App oficial em env; `client` → App próprio gravado no
   * singleton `installation_meta_app`. O fluxo OAuth não é duplicado: ele só
   * consome o resultado desta resolução.
   */
  private async app(): Promise<{ appId: string; appSecret: string }> {
    if (this.resolved) return this.resolved;
    if (this.appIdOverride && this.appSecretOverride) {
      this.resolved = { appId: this.appIdOverride, appSecret: this.appSecretOverride };
      return this.resolved;
    }
    const { resolveMetaAppCredentials } = await import("./app-config.server");
    const creds = await resolveMetaAppCredentials();
    this.resolved = {
      appId: this.appIdOverride ?? creds.appId,
      appSecret: this.appSecretOverride ?? creds.appSecret,
    };
    return this.resolved;
  }

  // --------------------------------------------------------------- OAuth ---
  async buildAuthorizeUrl(params: {
    state: string;
    scopes?: string[];
    /** display=popup renders a friendlier consent screen for embedded flows. */
    display?: "page" | "popup";
    /** auth_type=rerequest re-prompts for previously declined scopes. */
    authType?: "rerequest" | "reauthenticate";
    /** Instagram onboarding uses Meta's setup extras for the Business flow. */
    extras?: Record<string, unknown>;
    /** Optional Facebook Login for Business configuration ID. */
    configId?: string | null;
  }): Promise<string> {
    const { appId } = await this.app();
    const scopes = (params.scopes ?? META_DEFAULT_SCOPES).join(",");
    const url = new URL(OAUTH_DIALOG);
    url.searchParams.set("client_id", appId);
    url.searchParams.set("redirect_uri", this.redirectUri);
    url.searchParams.set("state", params.state);
    if (params.configId) url.searchParams.set("config_id", params.configId);
    else url.searchParams.set("scope", scopes);
    url.searchParams.set("response_type", "code");
    if (params.display) url.searchParams.set("display", params.display);
    if (params.authType) url.searchParams.set("auth_type", params.authType);
    if (params.extras) url.searchParams.set("extras", JSON.stringify(params.extras));
    return url.toString();
  }

  /** Exchanges the ?code returned by Meta for a short-lived user access token. */
  async exchangeCode(code: string): Promise<MetaTokenInfo> {
    const { appId, appSecret } = await this.app();
    const url = new URL(`${GRAPH_BASE}/oauth/access_token`);
    url.searchParams.set("client_id", appId);
    url.searchParams.set("client_secret", appSecret);
    url.searchParams.set("redirect_uri", this.redirectUri);
    url.searchParams.set("code", code);
    return this.readToken(url.toString());
  }

  /**
   * Trades a short-lived user token for a long-lived one (~60 days). Meta
   * does not issue refresh tokens; you refresh by calling this again with a
   * still-valid long-lived token before it expires.
   */
  async exchangeForLongLivedUserToken(shortLivedToken: string): Promise<MetaTokenInfo> {
    const { appId, appSecret } = await this.app();
    const url = new URL(`${GRAPH_BASE}/oauth/access_token`);
    url.searchParams.set("grant_type", "fb_exchange_token");
    url.searchParams.set("client_id", appId);
    url.searchParams.set("client_secret", appSecret);
    url.searchParams.set("fb_exchange_token", shortLivedToken);
    return this.readToken(url.toString());
  }


  /** Refresh = re-issue a long-lived token from a still-valid one. */
  async refreshLongLivedUserToken(currentToken: string): Promise<MetaTokenInfo> {
    return this.exchangeForLongLivedUserToken(currentToken);
  }

  /** Revoke the granted permissions for the currently connected user. */
  async revoke(userAccessToken: string, metaUserId: string): Promise<void> {
    await this.graph<{ success: boolean }>(`/${metaUserId}/permissions`, {
      accessToken: userAccessToken,
      method: "DELETE",
    });
  }

  // ------------------------------------------------------------- Assets ---
  async getMe(userAccessToken: string): Promise<MetaUser> {
    return this.graph<MetaUser>("/me", {
      accessToken: userAccessToken,
      // `email` não faz parte dos escopos operacionais do produto e alguns
      // tipos de conta Meta fazem a consulta inteira falhar quando esse campo
      // é solicitado sem `email`. Nome e ID são suficientes para a sessão.
      query: { fields: "id,name" },
    });
  }

  /**
   * Returns the list of permissions the user actually granted (status="granted").
   * Meta lets users revoke individual scopes on the consent screen, so this is
   * the authoritative list — not the scopes we asked for.
   */
  async listGrantedPermissions(userAccessToken: string): Promise<string[]> {
    type PermRow = { permission: string; status: "granted" | "declined" | "expired" };
    const res = await this.graph<{ data: PermRow[] }>("/me/permissions", {
      accessToken: userAccessToken,
    });
    return (res.data ?? []).filter((p) => p.status === "granted").map((p) => p.permission);
  }

  /**
   * Descoberta de ativos Meta para uma AGÊNCIA.
   *
   * Duas fontes combinadas, sempre deduplicadas por ID Meta:
   *  1. `/me/accounts` — Páginas em que o usuário é admin direto (rápido).
   *  2. `/me/businesses` → `owned_pages` / `client_pages` /
   *     `owned_instagram_accounts` — ativos acessíveis via Business Portfolio.
   *     É o caminho de uma agência: o usuário costuma NÃO ser admin direto da
   *     Página, e sim ter acesso pelo portfólio.
   *
   * O modo profundo é o PADRÃO (`deep` default `true`). `deep: false` existe
   * apenas como modo "rápido" para atualizações incrementais/refresh barato.
   * `client_instagram_accounts` não é solicitado: a aresta não existe nesta
   * versão da Graph (erro #100).
   */
  async scanPortfolio(
    userAccessToken: string,
    opts?: {
      deep?: boolean;
      /** Telemetria injetada pelo chamador (uma por operação de descoberta). */
      telemetry?: GraphTelemetry;
      /** Portfólios já conhecidos: evita repetir `/me/businesses`. */
      knownBusinesses?: MetaBusiness[];
      /** Teto de portfólios varridos nesta execução. */
      maxPortfolios?: number;
    },
  ): Promise<MetaPortfolioScan> {
    const deep = opts?.deep !== false;
    const telemetry = opts?.telemetry ?? createGraphTelemetry("Meta discovery");
    const maxPortfolios = Math.max(1, opts?.maxPortfolios ?? MAX_PORTFOLIOS_PER_SCAN);
    let requestCount = 0;
    let stopReason: GraphStopReason = "completed";
    /** Só piora o motivo de parada; nunca sobrescreve um estado mais grave. */
    const noteStop = (reason: GraphStopReason) => {
      const rank: Record<GraphStopReason, number> = {
        completed: 0,
        cached: 0,
        deduped: 0,
        page_cap: 1,
        portfolio_cap: 1,
        deadline: 2,
        rate_limited: 3,
        error: 3,
      };
      if (rank[reason] > rank[stopReason]) stopReason = reason;
    };


    type PageRow = {
      id: string;
      name: string;
      access_token?: string;
      category?: string;
      tasks?: string[];
      instagram_business_account?: {
        id: string;
        username?: string;
        profile_picture_url?: string;
      };
      connected_instagram_account?: {
        id: string;
        username?: string;
        profile_picture_url?: string;
      };
      picture?: { data?: { url?: string } };
      business?: { id?: string; name?: string };
    };
    type IgRow = {
      id: string;
      username?: string;
      name?: string;
      profile_picture_url?: string;
    };
    type BusinessRow = { id: string; name?: string };
    type Paged<T> = { data: T[]; paging?: { next?: string } };

    const pages: MetaPageAsset[] = [];
    const seenPages = new Set<string>();
    const standaloneInstagram: MetaInstagramAsset[] = [];
    const seenIg = new Set<string>();
    const warnings: string[] = [];
    const edgeFailureCounts = new Map<string, number>();
    const edgeFailureSamples = new Map<string, string>();
    const recordEdgeFailure = (edge: string, label: string, err: unknown) => {
      edgeFailureCounts.set(edge, (edgeFailureCounts.get(edge) ?? 0) + 1);
      if (!edgeFailureSamples.has(edge) && err instanceof MetaGraphError) {
        edgeFailureSamples.set(edge, `Portfólio "${label}": ${err.message}`);
      }
    };
    // Prazo total do scan. Portfólios grandes têm centenas de arestas; sem um
    // limite o request nunca retorna e o diálogo fica em loading infinito.
    const deadline = Date.now() + SCAN_DEADLINE_MS;
    let timedOut = false;
    const outOfTime = () => {
      if (Date.now() < deadline) return false;
      timedOut = true;
      noteStop("deadline");
      return true;
    };
    /** Arestas que atingiram o teto de páginas (dados parciais, não erro). */
    const cappedEdges = new Set<string>();

    const PAGE_FIELDS =
      "id,name,access_token,category,tasks,picture.type(large){url},business{id,name}," +
      "instagram_business_account{id,username,profile_picture_url}," +
      "connected_instagram_account{id,username,profile_picture_url}";
    const COMPAT_PAGE_FIELDS =
      "id,name,access_token,category,tasks,picture.type(large){url},business{id,name}," +
      "instagram_business_account{id,username,profile_picture_url}";
    const MINIMAL_PAGE_FIELDS =
      "id,name,access_token,category,tasks,instagram_business_account{id,username}";
    const IG_FIELDS = "id,username,name,profile_picture_url";

    /**
     * Ingestão deduplicada. `ctx` carrega o portfólio quando a Página veio de
     * uma aresta de Business Portfolio (a aresta não repete `business`).
     */
    const ingestPages = (rows: PageRow[], ctx?: { id: string; name: string | null }) => {
      for (const p of rows) {
        const ig = p.instagram_business_account ?? p.connected_instagram_account;
        if (ig?.id) seenIg.add(ig.id);
        const businessId = p.business?.id ?? ctx?.id ?? null;
        const businessName = p.business?.name ?? ctx?.name ?? null;
        const known = seenPages.has(p.id);
        if (known) {
          // Já vista por outra aresta: só completa a identidade do portfólio.
          const prev = pages.find((x) => x.pageId === p.id);
          if (prev && !prev.businessId && businessId) {
            prev.businessId = businessId;
            prev.businessName = businessName;
          }
          if (prev && !prev.pageAccessToken && p.access_token) {
            prev.pageAccessToken = p.access_token;
          }
          continue;
        }
        seenPages.add(p.id);
        pages.push({
          pageId: p.id,
          pageName: p.name,
          pageAccessToken: p.access_token ?? "",
          category: p.category,
          tasks: p.tasks,
          instagramBusinessId: ig?.id,
          instagramUsername: ig?.username,
          pagePictureUrl: p.picture?.data?.url,
          instagramPictureUrl: ig?.profile_picture_url,
          businessId,
          businessName,
        });
      }
    };


    /** Follows every `paging.next` page for a Graph edge. */
    const loop = async <T>(
      startPath: string,
      query: Record<string, string>,
      onRows: (rows: T[]) => void,
    ) => {
      let nextUrl: string | null = null;
      let first = true;
      while ((first || nextUrl) && !outOfTime()) {
        requestCount += 1;
        const res: Paged<T> = first
          ? await this.graph<Paged<T>>(startPath, {
              accessToken: userAccessToken,
              query,
            })
          : await this.graphAbsolute<Paged<T>>(nextUrl!, userAccessToken);
        onRows(res.data ?? []);
        nextUrl = res.paging?.next ?? null;
        first = false;
      }
    };

    // 1) PRIMARY SOURCE OF TRUTH — Pages administered by the user, with the
    //    attached Instagram Business account. Meta occasionally returns a
    //    generic HTTP 500 when a field is unavailable for one asset in a large
    //    portfolio, so retry with progressively conservative field sets instead
    //    of discarding the entire account list.
    let directPagesLoaded = false;
    let directPagesError: unknown = null;
    for (const fields of [PAGE_FIELDS, COMPAT_PAGE_FIELDS, MINIMAL_PAGE_FIELDS]) {
      try {
        await loop<PageRow>("/me/accounts", { fields, limit: "100" }, ingestPages);
        directPagesLoaded = true;
        break;
      } catch (err) {
        directPagesError = err;
        if (isFatalScanError(err) && !(err instanceof MetaGraphError && err.status >= 500)) {
          throw err;
        }
      }
    }
    if (!directPagesLoaded) {
      // Nothing usable came back and the failure was not fatal-classified:
      // surface it as an error instead of pretending the account list is empty.
      throw directPagesError instanceof Error
        ? directPagesError
        : new MetaGraphError("Não foi possível listar as Páginas da Meta.", 500);
    }

    // 2) BUSINESS PORTFOLIOS — caminho canônico de uma agência: o usuário tem
    //    acesso ao ativo pelo portfólio, não como admin direto da Página.
    //    Roda por padrão; `deep: false` só é usado em refresh rápido.
    const businesses: BusinessRow[] = [];
    if (deep) {
      const seenBusinesses = new Set<string>();
      const pushBusiness = (rows: BusinessRow[]) => {
        for (const b of rows) {
          if (seenBusinesses.has(b.id)) continue;
          seenBusinesses.add(b.id);
          businesses.push(b);
        }
      };
      try {
        await loop<BusinessRow>(
          "/me/businesses",
          { fields: "id,name", limit: "100" },
          pushBusiness,
        );
      } catch (err) {
        warnings.push(
          `Não foi possível listar seus portfólios empresariais${
            err instanceof MetaGraphError ? `: ${err.message}` : ""
          }. Reautorize concedendo a permissão "business_management" para ver todas as contas.`,
        );
      }

      for (const biz of businesses) {
        if (outOfTime()) break;
        const label = biz.name ?? biz.id;
        const ctx = { id: biz.id, name: biz.name ?? null };
        for (const edge of ["owned_pages", "client_pages"] as const) {
          try {
            await loop<PageRow>(
              `/${biz.id}/${edge}`,
              { fields: COMPAT_PAGE_FIELDS, limit: "100" },
              (rows) => ingestPages(rows, ctx),
            );
          } catch (err) {
            if (isFatalScanError(err)) throw err;
            recordEdgeFailure(edge, label, err);
          }
        }

        // NOTE: only `owned_instagram_accounts` exists. `client_instagram_accounts`
        // is not a valid edge in this Graph version and must not be requested.
        try {
          await loop<IgRow>(
            `/${biz.id}/owned_instagram_accounts`,
            { fields: IG_FIELDS, limit: "100" },
            (rows) => {
              for (const ig of rows) {
                if (seenIg.has(ig.id)) continue;
                seenIg.add(ig.id);
                standaloneInstagram.push({
                  instagramId: ig.id,
                  username: ig.username ?? null,
                  name: ig.name ?? null,
                  pictureUrl: ig.profile_picture_url ?? null,
                  businessId: biz.id,
                  businessName: biz.name ?? null,
                });
              }
            },
          );
        } catch (err) {
          if (isFatalScanError(err)) throw err;
          recordEdgeFailure("owned_instagram_accounts", label, err);
        }
      }

      for (const [edge, count] of edgeFailureCounts) {
        const sample = edgeFailureSamples.get(edge);
        warnings.push(
          `A Meta restringiu ${count} leitura${count === 1 ? "" : "s"} em ${edge}.` +
            (sample ? ` Exemplo: ${sample}` : ""),
        );
      }

      if (timedOut) {
        warnings.push(
          "A varredura foi interrompida por tempo limite: mostramos as contas encontradas até aqui.",
        );
      }
    }

    return {
      pages,
      standaloneInstagram,
      warnings,
      businessCount: businesses.length,
      businesses: businesses.map((b) => ({ id: b.id, name: b.name ?? null })),
      requestCount,
      deep,
    };

  }

  /**
   * Fetches a Page access token on demand. Pages discovered through a Business
   * Portfolio edge do not always include `access_token`, and we only need the
   * token at link time — not for all ~50 accounts during the scan.
   */
  async getPageAccessToken(userAccessToken: string, pageId: string): Promise<string> {
    const res = await this.graph<{ id: string; access_token?: string }>(`/${pageId}`, {
      accessToken: userAccessToken,
      query: { fields: "access_token" },
    });
    if (!res.access_token) {
      throw new MetaGraphError(
        "Não foi possível obter o token desta Página. Confirme que você tem permissão de administrador nela.",
        400,
      );
    }
    return res.access_token;
  }

  /** Resolves the Page that owns an Instagram Business account, when any. */
  async getInstagramAccount(
    userAccessToken: string,
    instagramId: string,
  ): Promise<{
    id: string;
    username: string | null;
    name: string | null;
    pictureUrl: string | null;
  }> {
    const res = await this.graph<{
      id: string;
      username?: string;
      name?: string;
      profile_picture_url?: string;
    }>(`/${instagramId}`, {
      accessToken: userAccessToken,
      query: { fields: "id,username,name,profile_picture_url" },
    });
    return {
      id: res.id,
      username: res.username ?? null,
      name: res.name ?? null,
      pictureUrl: res.profile_picture_url ?? null,
    };
  }

  /**
   * Lists Meta Ads accounts the user has access to. Requires `ads_read`.
   */
  async listAdAccounts(userAccessToken: string): Promise<MetaAdAccount[]> {
    type Row = {
      id: string;
      name?: string;
      currency?: string;
      timezone_name?: string;
      account_status?: number;
      business?: { name?: string };
    };
    type Paged<T> = { data: T[]; paging?: { next?: string } };
    const out: MetaAdAccount[] = [];
    let nextUrl: string | null = null;
    let first = true;
    try {
      while (first || nextUrl) {
        const res: Paged<Row> = first
          ? await this.graph<Paged<Row>>("/me/adaccounts", {
              accessToken: userAccessToken,
              query: {
                fields: "id,name,currency,timezone_name,account_status,business{name}",
                limit: "100",
              },
            })
          : await this.graphAbsoluteAuth<Paged<Row>>(nextUrl!);
        for (const a of res.data ?? []) {
          out.push({
            adAccountId: a.id,
            name: a.name ?? null,
            currency: a.currency ?? null,
            timezone: a.timezone_name ?? null,
            accountStatus: a.account_status ?? null,
            businessName: a.business?.name ?? null,
          });
        }
        nextUrl = res.paging?.next ?? null;
        first = false;
      }
    } catch (err) {
      // Missing scope or business setup — return empty list rather than aborting.
      if (err instanceof MetaGraphError) return out;
      throw err;
    }
    return out;
  }

  /**
   * Lists Threads accounts the user manages. Threads accounts are surfaced
   * per-Facebook-Page via the `threads_profile` edge (Graph v21+).
   */
  async listThreadsAccounts(
    userAccessToken: string,
    pages: MetaPageAsset[],
  ): Promise<MetaThreadsAccount[]> {
    const out: MetaThreadsAccount[] = [];
    for (const page of pages) {
      try {
        const res = await this.graph<{
          id?: string;
          username?: string;
          name?: string;
          threads_profile_picture_url?: string;
        }>(`/${page.pageId}/threads_profile`, {
          accessToken: page.pageAccessToken,
          query: {
            fields: "id,username,name,threads_profile_picture_url",
          },
        });
        if (res?.id) {
          out.push({
            threadsUserId: res.id,
            username: res.username ?? null,
            name: res.name ?? null,
            pictureUrl: res.threads_profile_picture_url ?? null,
            accessToken: page.pageAccessToken,
            linkedViaPageId: page.pageId,
          });
        }
      } catch {
        // No Threads profile on this page — skip silently.
      }
    }
    return out;
  }

  private async graphAbsoluteAuth<T>(absoluteUrl: string): Promise<T> {
    return this.doFetch<T>(absoluteUrl, "GET");
  }

  // --------------------------------------------------------- Generic API ---
  /**
   * Generic Graph API call. Prefer the specialised helpers above; use this
   * as an escape hatch or when building new features on top of Graph.
   */
  async graph<T>(
    path: string,
    opts: {
      accessToken: string;
      method?: "GET" | "POST" | "DELETE";
      query?: Record<string, string>;
      body?: Record<string, unknown> | FormData;
    },
  ): Promise<T> {
    const url = new URL(`${GRAPH_BASE}${path.startsWith("/") ? path : `/${path}`}`);
    if (opts.query) for (const [k, v] of Object.entries(opts.query)) url.searchParams.set(k, v);
    if (!url.searchParams.has("access_token")) {
      url.searchParams.set("access_token", opts.accessToken);
    }
    // App-secret proof hardens calls against leaked tokens.
    const { appSecret } = await this.app();
    url.searchParams.set("appsecret_proof", await hmacSha256Hex(appSecret, opts.accessToken));
    return this.doFetch<T>(url.toString(), opts.method ?? "GET", opts.body);
  }

  private async graphAbsolute<T>(absoluteUrl: string, accessToken?: string): Promise<T> {
    // Meta's `paging.next` URL keeps the original `access_token` but does NOT
    // re-sign with `appsecret_proof`. When the app requires proof, following
    // that URL as-is returns 400 and pagination silently truncates. Rebuild
    // both parameters here.
    try {
      const url = new URL(absoluteUrl);
      const token = accessToken ?? url.searchParams.get("access_token") ?? "";
      if (token) {
        if (!url.searchParams.get("access_token")) {
          url.searchParams.set("access_token", token);
        }
        const { appSecret } = await this.app();
        url.searchParams.set("appsecret_proof", await hmacSha256Hex(appSecret, token));
      }
      return this.doFetch<T>(url.toString(), "GET");
    } catch {
      return this.doFetch<T>(absoluteUrl, "GET");
    }
  }

  private async doFetch<T>(
    url: string,
    method: "GET" | "POST" | "DELETE",
    body?: Record<string, unknown> | FormData,
  ): Promise<T> {
    const init: RequestInit = { method };
    if (body instanceof FormData) {
      init.body = body;
    } else if (body) {
      init.headers = { "Content-Type": "application/json" };
      init.body = JSON.stringify(body);
    }
    // Sem timeout, uma única chamada travada da Graph API deixa o seletor de
    // contas girando para sempre. 15s por requisição é folgado para /me/accounts.
    init.signal = AbortSignal.timeout(15_000);
    let res: Response;
    try {
      res = await fetch(url, init);
    } catch (err) {
      const aborted =
        err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
      throw new MetaGraphError(
        aborted
          ? "A Meta demorou demais para responder. Tente sincronizar novamente."
          : err instanceof Error
            ? err.message
            : "Falha de rede ao chamar a Graph API",
        aborted ? 504 : 0,
      );
    }
    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      /* non-JSON */
    }
    if (!res.ok) {
      const g = (parsed as { error?: GraphErrorShape } | null)?.error;
      throw new MetaGraphError(g?.message ?? `Graph API ${res.status}`, res.status, g);
    }
    return parsed as T;
  }

  private async readToken(url: string): Promise<MetaTokenInfo> {
    const data = await this.doFetch<{
      access_token: string;
      token_type?: string;
      expires_in?: number;
    }>(url, "GET");
    const expiresAt = data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined;
    return {
      accessToken: data.access_token,
      tokenType: data.token_type ?? "bearer",
      expiresIn: data.expires_in,
      expiresAt,
    };
  }
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ---------------------------------------------------------------------------
// Signed OAuth state (CSRF) — replaces the meta_oauth_states table.
// Format: base64url(payload).base64url(hmacSha256(payload))
// Payload is JSON: { brandId, userId, redirectTo, nonce, exp }
// ---------------------------------------------------------------------------

export type MetaStatePayload = {
  brandId: string;
  userId: string;
  redirectTo?: string | null;
  channel?: MetaChannel | null;
  nonce: string;
  exp: number; // unix seconds
};

export type MetaChannel = "facebook" | "instagram" | "threads" | "ads";

function b64urlEncode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? 0 : 4 - (s.length % 4);
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function stateSecret(): Promise<string> {
  // Per-installation secret. Several installations may share the same Meta App
  // (and therefore META_APP_SECRET), so a dedicated secret keeps an OAuth state
  // issued by installation A from being valid on installation B.
  return process.env.META_STATE_SECRET ?? requireEnv("META_APP_SECRET");
}

export async function signOAuthState(
  payload: Omit<MetaStatePayload, "nonce" | "exp"> & { ttlSeconds?: number },
): Promise<string> {
  const nonceBytes = new Uint8Array(16);
  crypto.getRandomValues(nonceBytes);
  const nonce = b64urlEncode(nonceBytes);
  const exp = Math.floor(Date.now() / 1000) + (payload.ttlSeconds ?? 600);
  const body: MetaStatePayload = {
    brandId: payload.brandId,
    userId: payload.userId,
    redirectTo: payload.redirectTo ?? null,
    channel: payload.channel ?? null,
    nonce,
    exp,
  };
  const json = JSON.stringify(body);
  const payloadB64 = b64urlEncode(new TextEncoder().encode(json));
  const sig = await hmacSha256Hex(await stateSecret(), payloadB64);
  return `${payloadB64}.${sig}`;
}

export async function verifyOAuthState(token: string): Promise<MetaStatePayload> {
  const [payloadB64, sig] = token.split(".");
  if (!payloadB64 || !sig) throw new Error("Malformed state");
  const expected = await hmacSha256Hex(await stateSecret(), payloadB64);
  // Constant-time-ish compare
  if (expected.length !== sig.length) throw new Error("Invalid state signature");
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  if (diff !== 0) throw new Error("Invalid state signature");
  const json = new TextDecoder().decode(b64urlDecode(payloadB64));
  const body = JSON.parse(json) as MetaStatePayload;
  if (typeof body.exp !== "number" || body.exp * 1000 < Date.now()) {
    throw new Error("State expired");
  }
  return body;
}
