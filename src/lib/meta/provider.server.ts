// Meta (Facebook / Instagram) Graph API provider.
// Server-only. Encapsulates OAuth, token lifecycle and Graph calls so the
// rest of the app never talks to graph.facebook.com directly.

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

export type MetaPortfolioScan = {
  pages: MetaPageAsset[];
  standaloneInstagram: MetaInstagramAsset[];
  /** Non-fatal problems (e.g. a portfolio edge we could not read). */
  warnings: string[];
  businessCount: number;
};

/**
 * Rate limits and expired tokens must abort the whole scan; permission errors
 * on a single portfolio edge are recorded as warnings instead.
 */
export function isFatalScanError(err: unknown): boolean {
  if (!(err instanceof MetaGraphError)) return true;
  if (err.status === 429) return true;
  const code = err.graph?.code;
  return code === 4 || code === 17 || code === 32 || code === 613 || code === 190;
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
 * The URI must match EXACTLY one of the entries registered in the Meta App
 * Dashboard. We accept the request's own origin when it is a trusted host
 * (the project's Lovable domains or the host configured in
 * `META_REDIRECT_URI`), so connecting from preview returns to preview and
 * connecting from production returns to production. Anything else falls back
 * to `META_REDIRECT_URI`.
 */
export function resolveMetaRedirectUri(origin?: string | null): string {
  const configured = requireEnv("META_REDIRECT_URI");
  if (!origin) return configured;
  try {
    const candidate = new URL(origin);
    const configuredHost = new URL(configured).host;
    const trusted =
      candidate.host === configuredHost ||
      candidate.host.endsWith(".lovable.app") ||
      candidate.host.endsWith(".lovableproject.com");
    if (candidate.protocol !== "https:" || !trusted) return configured;
    return `${candidate.origin}${META_CALLBACK_PATH}`;
  } catch {
    return configured;
  }
}

export class MetaProvider {
  private appId: string;
  private appSecret: string;
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
    this.appId = opts?.appId ?? requireEnv("META_APP_ID");
    this.appSecret = opts?.appSecret ?? requireEnv("META_APP_SECRET");
    this.redirectUri =
      opts?.redirectUri ?? resolveMetaRedirectUri(opts?.origin ?? null);
  }


  // --------------------------------------------------------------- OAuth ---
  buildAuthorizeUrl(params: {
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
  }): string {
    const scopes = (params.scopes ?? META_DEFAULT_SCOPES).join(",");
    const url = new URL(OAUTH_DIALOG);
    url.searchParams.set("client_id", this.appId);
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
    const url = new URL(`${GRAPH_BASE}/oauth/access_token`);
    url.searchParams.set("client_id", this.appId);
    url.searchParams.set("client_secret", this.appSecret);
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
    const url = new URL(`${GRAPH_BASE}/oauth/access_token`);
    url.searchParams.set("grant_type", "fb_exchange_token");
    url.searchParams.set("client_id", this.appId);
    url.searchParams.set("client_secret", this.appSecret);
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
      query: { fields: "id,name,email" },
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
    return (res.data ?? [])
      .filter((p) => p.status === "granted")
      .map((p) => p.permission);
  }

  /**
   * Lists the Facebook Pages the user manages together with each page's
   * page-scoped access token (which is what we persist for future API calls)
   * and the connected Instagram Business account, when present.
   *
   * Sources (deduped by id):
   *  1. `/me/accounts` — Pages the user administers directly.
   *  2. `/me/businesses` → `owned_pages` + `client_pages` — Pages that belong
   *     to a Business Portfolio the user administers (requires
   *     `business_management`). Without this, agencies only ever see a
   *     fraction of their assets.
   *  3. `/me/businesses` → `owned_instagram_accounts` +
   *     `client_instagram_accounts` — IG Business accounts assigned straight to
   *     the portfolio, with no Page the user can administer.
   */
  async scanPortfolio(userAccessToken: string): Promise<MetaPortfolioScan> {
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

    const PAGE_FIELDS =
      "id,name,access_token,category,tasks,picture.type(large){url}," +
      "instagram_business_account{id,username,profile_picture_url}," +
      "connected_instagram_account{id,username,profile_picture_url}";
    const IG_FIELDS = "id,username,name,profile_picture_url";

    const ingestPages = (rows: PageRow[]) => {
      for (const p of rows) {
        const ig = p.instagram_business_account ?? p.connected_instagram_account;
        if (ig?.id) seenIg.add(ig.id);
        if (seenPages.has(p.id)) continue;
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
      while (first || nextUrl) {
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

    // 1) Pages administered directly by the user profile. This edge is the
    //    only one that reliably returns page access tokens, so it runs first.
    await loop<PageRow>("/me/accounts", { fields: PAGE_FIELDS, limit: "100" }, ingestPages);

    // 2 + 3) Business Portfolios. Failures here are non-fatal: we still want
    //        to show whatever /me/accounts returned, with a visible warning.
    const businesses: BusinessRow[] = [];
    try {
      await loop<BusinessRow>("/me/businesses", { fields: "id,name", limit: "100" }, (rows) => {
        businesses.push(...rows);
      });
    } catch (err) {
      warnings.push(
        `Não foi possível listar seus portfólios empresariais${
          err instanceof MetaGraphError ? `: ${err.message}` : ""
        }. Reautorize concedendo a permissão "business_management" para ver todas as contas.`,
      );
    }

    for (const biz of businesses) {
      const label = biz.name ?? biz.id;
      for (const edge of ["owned_pages", "client_pages"] as const) {
        try {
          await loop<PageRow>(
            `/${biz.id}/${edge}`,
            { fields: PAGE_FIELDS, limit: "100" },
            ingestPages,
          );
        } catch (err) {
          if (isFatalScanError(err)) throw err;
          warnings.push(
            `Portfólio "${label}": falha ao ler ${edge}${
              err instanceof MetaGraphError ? ` (${err.message})` : ""
            }.`,
          );
        }
      }
      for (const edge of ["owned_instagram_accounts", "client_instagram_accounts"] as const) {
        try {
          await loop<IgRow>(`/${biz.id}/${edge}`, { fields: IG_FIELDS, limit: "100" }, (rows) => {
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
          });
        } catch (err) {
          if (isFatalScanError(err)) throw err;
          warnings.push(
            `Portfólio "${label}": falha ao ler ${edge}${
              err instanceof MetaGraphError ? ` (${err.message})` : ""
            }.`,
          );
        }
      }
    }

    return {
      pages,
      standaloneInstagram,
      warnings,
      businessCount: businesses.length,
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
  ): Promise<{ id: string; username: string | null; name: string | null; pictureUrl: string | null }> {
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
    url.searchParams.set(
      "appsecret_proof",
      await hmacSha256Hex(this.appSecret, opts.accessToken),
    );
    return this.doFetch<T>(url.toString(), opts.method ?? "GET", opts.body);
  }

  private async graphAbsolute<T>(
    absoluteUrl: string,
    accessToken?: string,
  ): Promise<T> {
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
        url.searchParams.set(
          "appsecret_proof",
          await hmacSha256Hex(this.appSecret, token),
        );
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
    const res = await fetch(url, init);
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
    const expiresAt = data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000)
      : undefined;
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
  // Reuse the app secret — server-side only.
  return process.env.META_APP_SECRET ?? requireEnv("META_APP_SECRET");
}

export async function signOAuthState(payload: Omit<MetaStatePayload, "nonce" | "exp"> & { ttlSeconds?: number }): Promise<string> {
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