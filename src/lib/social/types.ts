/**
 * Social — canonical high-level model shared across every provider.
 *
 * Reuses the analytics vocabulary (`Metric`, `TimeSeriesPoint`, `DateRange`,
 * `SocialNetwork`, `ProviderResult`) so the frontend and the Brain speak a
 * single language regardless of which network is behind the data.
 */
import type {
  DateRange,
  Metric,
  ProviderResult,
  SocialNetwork,
  TimeSeriesPoint,
} from "@/lib/social-analytics/types";

export type { DateRange, Metric, ProviderResult, SocialNetwork, TimeSeriesPoint };

export type SocialMediaType =
  | "image"
  | "video"
  | "carousel"
  | "text"
  | "other"
  | null;

export type SocialPost = {
  network: SocialNetwork;
  connectionId: string;
  externalPostId: string;
  permalink: string | null;
  publishedAt: string | null;
  caption: string | null;
  mediaType: SocialMediaType;
  thumbnailUrl: string | null;
  metrics: Metric[];
  warnings: string[];
};

export type SocialProfile = {
  network: SocialNetwork;
  connectionId: string;
  externalId: string;
  name: string | null;
  handle: string | null;
  avatarUrl: string | null;
  bio: string | null;
  website: string | null;
  verified: boolean | null;
  followers: number | null;
  following: number | null;
  postsCount: number | null;
  warnings: string[];
};

export type AudienceSegment = { label: string; value: number };
export type AudienceBreakdown = { key: string; segments: AudienceSegment[] };

export type SocialAudience = {
  network: SocialNetwork;
  connectionId: string;
  range: DateRange;
  totalFollowers: number | null;
  followersGained: number | null;
  followersLost: number | null;
  growthSeries: TimeSeriesPoint[];
  breakdowns: AudienceBreakdown[];
  warnings: string[];
};

export type SocialDashboard = {
  network: SocialNetwork;
  connectionId: string;
  range: DateRange;
  profile: SocialProfile | null;
  totals: Metric[];
  series: TimeSeriesPoint[];
  topPosts: SocialPost[];
  warnings: string[];
};

// ------------------------------ Method options ------------------------------

export type GetDashboardOptions = { network: SocialNetwork; range: DateRange };
export type GetPostsOptions = { network: SocialNetwork; limit?: number };
export type GetPostOptions = { network: SocialNetwork; postId: string };
export type GetTopPostsOptions = {
  network: SocialNetwork;
  limit?: number;
  /** Canonical metric key used for sorting (default: "engagement"). */
  sortBy?: string;
};
export type GetAudienceOptions = { network: SocialNetwork; range: DateRange };
export type GetProfileOptions = { network: SocialNetwork };