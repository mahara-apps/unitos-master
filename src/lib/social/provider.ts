import type {
  GetAudienceOptions,
  GetDashboardOptions,
  GetPostOptions,
  GetPostsOptions,
  GetProfileOptions,
  GetTopPostsOptions,
  ProviderResult,
  SocialAudience,
  SocialDashboard,
  SocialNetwork,
  SocialPost,
  SocialProfile,
} from "./types";

/**
 * Runtime context handed to every SocialProvider call. Resolved upstream by
 * the registry from a `social_connections` row plus the decrypted access
 * token. Providers must never talk to Supabase directly.
 */
export type SocialProviderContext = {
  connectionId: string;
  brandId: string;
  /** Raw provider key stored in `social_connections.provider` (e.g. "meta"). */
  provider: string;
  /** Page ID / channel ID / handle owner depending on the network. */
  externalId: string;
  externalName: string | null;
  /** Meta: Instagram Business Account ID (when the page has one linked). */
  accountId: string | null;
  accountUsername: string | null;
  /** Decrypted access token — never expose to the client. */
  accessToken: string;
};

/**
 * High-level contract every social network provider must implement.
 *
 * Providers translate their native APIs into the canonical model declared in
 * `./types.ts` so the frontend never depends on any network-specific surface.
 * Every method returns a `ProviderResult` and MUST NOT throw for partial
 * failures — surface those through `warnings` on the returned payload.
 */
export interface SocialProvider {
  /** Networks this provider can serve (a Meta provider serves fb + ig). */
  readonly networks: readonly SocialNetwork[];
  /** Human-readable label surfaced to logs/UI. */
  readonly label: string;

  getDashboard(
    ctx: SocialProviderContext,
    opts: GetDashboardOptions,
  ): Promise<ProviderResult<SocialDashboard>>;

  getPosts(
    ctx: SocialProviderContext,
    opts: GetPostsOptions,
  ): Promise<ProviderResult<SocialPost[]>>;

  getPost(
    ctx: SocialProviderContext,
    opts: GetPostOptions,
  ): Promise<ProviderResult<SocialPost>>;

  getTopPosts(
    ctx: SocialProviderContext,
    opts: GetTopPostsOptions,
  ): Promise<ProviderResult<SocialPost[]>>;

  getAudience(
    ctx: SocialProviderContext,
    opts: GetAudienceOptions,
  ): Promise<ProviderResult<SocialAudience>>;

  getProfile(
    ctx: SocialProviderContext,
    opts: GetProfileOptions,
  ): Promise<ProviderResult<SocialProfile>>;
}