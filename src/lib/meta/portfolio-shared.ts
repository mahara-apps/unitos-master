import { z } from "zod";

/**
 * Runtime siblings for `portfolio.functions.ts`.
 *
 * Server-function files are split by the build: anything at module scope that
 * is not an import, a type or an exported server function gets stripped, which
 * turns these helpers into `ReferenceError`s at runtime. Keep them here.
 */

export type PortfolioPage = {
  pageId: string;
  pageName: string;
  category: string | null;
  pagePictureUrl: string | null;
  instagramBusinessId: string | null;
  instagramUsername: string | null;
  instagramPictureUrl: string | null;
};

export type PortfolioThreadsAccount = {
  threadsUserId: string;
  username: string | null;
  name: string | null;
  pictureUrl: string | null;
  linkedViaPageId?: string;
};

export type PortfolioAdAccount = {
  adAccountId: string;
  name: string | null;
  currency: string | null;
  timezone: string | null;
  accountStatus: number | null;
  businessName: string | null;
};

export type PortfolioResponse = {
  sessionId: string;
  metaUser: { id: string; name: string | null; email: string | null };
  portfolioStatus: "not_loaded" | "loaded" | "empty" | "error" | "rate_limited";
  portfolioLoadedAt: string | null;
  portfolioError: string | null;
  portfolioRateLimitedUntil: string | null;
  scopes: string[];
  requestedScopes: string[];
  missingScopes: string[];
  pages: PortfolioPage[];
  pagesCount: number;
  pagesWithIgCount: number;
  pagesWithoutIgCount: number;
  standaloneInstagram: PortfolioStandaloneInstagram[];
  standaloneInstagramCount: number;
  scanWarnings: string[];
  businessCount: number;
  threadsAccounts: PortfolioThreadsAccount[];
  adAccounts: PortfolioAdAccount[];
  connected: {
    facebook: Record<string, string>;
    instagram: Record<string, string>;
    threads: Record<string, string>;
    ads: Record<string, string>;
  };
  expiresAt: string;
};

export const GetInput = z.object({
  brandId: z.string().uuid(),
  sessionId: z.string().uuid(),
  channel: z.enum(["facebook", "instagram", "threads", "ads"]).optional(),
  refresh: z.boolean().optional(),
});

export const LinkInput = z.object({
  brandId: z.string().uuid(),
  sessionId: z.string().uuid(),
  channel: z.enum(["facebook", "instagram", "threads", "ads"]),
  targetId: z.string().min(1),
  clientId: z.string().uuid().optional(),
  /**
   * When the target is a Page that has an Instagram Business account attached,
   * link both channels in one action (Página + Instagram vêm juntos).
   */
  linkPair: z.boolean().optional(),
});

export const UnlinkInput = z.object({
  brandId: z.string().uuid(),
  connectionId: z.string().uuid(),
});

/** Meta rate-limit error codes (Graph API + Business Manager). */
export const META_RATE_LIMIT_CODES = new Set([4, 17, 32, 613]);
export const RATE_LIMIT_PREFIX = "RATE_LIMIT:";
/** Prefix used so the UI can restart OAuth instead of showing a dead end. */
export const SESSION_INVALID_PREFIX = "META_SESSION_INVALID:";

export function isMetaRateLimit(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { status?: number; graph?: { code?: number } };
  if (e.status === 429) return true;
  if (e.graph?.code && META_RATE_LIMIT_CODES.has(e.graph.code)) return true;
  return false;
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Instagram Business account with no Page the user can administer. */
export type PortfolioStandaloneInstagram = {
  instagramId: string;
  username: string | null;
  name: string | null;
  pictureUrl: string | null;
  businessName: string | null;
};

export type CachedPagesPayload = {
  pages: Array<PortfolioPage & { pageAccessToken?: string }>;
  standaloneInstagram: PortfolioStandaloneInstagram[];
  warnings: string[];
  businessCount: number;
};

/**
 * `meta_oauth_sessions.pages` holds either a bare array (sessions created
 * before the portfolio-wide scan) or the full payload object. Normalizes both.
 */
export function readPagesPayload(raw: unknown): CachedPagesPayload {
  const empty: CachedPagesPayload = {
    pages: [],
    standaloneInstagram: [],
    warnings: [],
    businessCount: 0,
  };
  if (!raw) return empty;
  if (Array.isArray(raw)) {
    return { ...empty, pages: raw as CachedPagesPayload["pages"] };
  }
  if (typeof raw === "object") {
    const o = raw as Partial<CachedPagesPayload>;
    return {
      pages: Array.isArray(o.pages) ? o.pages : [],
      standaloneInstagram: Array.isArray(o.standaloneInstagram) ? o.standaloneInstagram : [],
      warnings: Array.isArray(o.warnings) ? o.warnings : [],
      businessCount: typeof o.businessCount === "number" ? o.businessCount : 0,
    };
  }
  return empty;
}
