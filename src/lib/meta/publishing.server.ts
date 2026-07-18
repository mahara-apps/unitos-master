// Meta Publishing Service — server-only.
// Publishes/schedules Feed posts to Facebook Pages and Instagram Business
// via the Graph API. Reels, Stories and Carousels are intentionally out of
// scope for v1 (validated at the placement layer).
//
// State lives in `social_posts`:
//   status: draft | scheduled | publishing | published | failed | canceled
//   placement: instagram_feed | facebook_feed

import { MetaProvider, MetaGraphError } from "./provider.server";
import { decryptCredential } from "@/lib/credentials-crypto.server";

export type SupportedPlacement = "instagram_feed" | "facebook_feed";
export const SUPPORTED_PLACEMENTS: SupportedPlacement[] = [
  "instagram_feed",
  "facebook_feed",
];

export type PublishMedia = {
  /** Publicly reachable image URL. Required for IG. Optional for FB. */
  imageUrl?: string;
  /** Optional external link (Facebook feed only). */
  link?: string;
};

export type PublishInput = {
  placement: SupportedPlacement;
  caption?: string;
  media: PublishMedia;
};

export type PublishResult = {
  externalPostId: string;
  externalPermalink: string | null;
  providerResponse: Record<string, unknown>;
};

export type MetaConnectionRow = {
  id: string;
  provider: string;
  external_id: string;       // Page ID
  account_id: string | null; // Instagram Business Account ID
  access_token_ciphertext: string; // Page-scoped token
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class MetaPublishingService {
  private provider: MetaProvider;

  constructor(provider?: MetaProvider) {
    this.provider = provider ?? new MetaProvider();
  }

  /**
   * Publishes immediately to the target placement. Returns the external post
   * id and permalink so callers can persist them on the `social_posts` row.
   */
  async publish(
    connection: MetaConnectionRow,
    input: PublishInput,
  ): Promise<PublishResult> {
    assertSupported(input.placement);
    const pageToken = await decryptCredential(connection.access_token_ciphertext);

    if (input.placement === "instagram_feed") {
      return this.publishInstagramFeed(connection, pageToken, input);
    }
    return this.publishFacebookFeed(connection, pageToken, input);
  }

  /**
   * Same as `publish()` but accepts a pre-decrypted page token. Used by the
   * high-level SocialProvider layer where the token is already available in
   * `SocialProviderContext.accessToken`.
   */
  async publishWithDecryptedToken(
    connection: Omit<MetaConnectionRow, "access_token_ciphertext">,
    pageToken: string,
    input: PublishInput,
  ): Promise<PublishResult> {
    assertSupported(input.placement);
    const row = { ...connection, access_token_ciphertext: "" } as MetaConnectionRow;
    if (input.placement === "instagram_feed") {
      return this.publishInstagramFeed(row, pageToken, input);
    }
    return this.publishFacebookFeed(row, pageToken, input);
  }

  // ------------------------------------------------------------ Instagram ---
  private async publishInstagramFeed(
    connection: MetaConnectionRow,
    pageToken: string,
    input: PublishInput,
  ): Promise<PublishResult> {
    if (!connection.account_id) {
      throw new Error(
        "Esta Página do Facebook não tem conta Instagram Business vinculada.",
      );
    }
    if (!input.media.imageUrl) {
      throw new Error("Feed do Instagram exige uma imagem (imageUrl).");
    }
    const igId = connection.account_id;

    // Step 1: create media container
    const container = await this.provider.graph<{ id: string }>(
      `/${igId}/media`,
      {
        accessToken: pageToken,
        method: "POST",
        query: {
          image_url: input.media.imageUrl,
          ...(input.caption ? { caption: input.caption } : {}),
        },
      },
    );

    // Step 2: publish the container
    const publish = await this.provider.graph<{ id: string }>(
      `/${igId}/media_publish`,
      {
        accessToken: pageToken,
        method: "POST",
        query: { creation_id: container.id },
      },
    );

    // Step 3: fetch permalink (best-effort)
    let permalink: string | null = null;
    try {
      const meta = await this.provider.graph<{ permalink?: string }>(
        `/${publish.id}`,
        { accessToken: pageToken, query: { fields: "permalink" } },
      );
      permalink = meta.permalink ?? null;
    } catch {
      /* permalink is nice-to-have */
    }

    return {
      externalPostId: publish.id,
      externalPermalink: permalink,
      providerResponse: { container_id: container.id, media_id: publish.id },
    };
  }

  // ------------------------------------------------------------- Facebook ---
  private async publishFacebookFeed(
    connection: MetaConnectionRow,
    pageToken: string,
    input: PublishInput,
  ): Promise<PublishResult> {
    const pageId = connection.external_id;
    const caption = input.caption ?? "";

    // With image → /{page}/photos ; else → /{page}/feed
    if (input.media.imageUrl) {
      const res = await this.provider.graph<{ id: string; post_id?: string }>(
        `/${pageId}/photos`,
        {
          accessToken: pageToken,
          method: "POST",
          query: {
            url: input.media.imageUrl,
            ...(caption ? { caption } : {}),
            published: "true",
          },
        },
      );
      const externalId = res.post_id ?? res.id;
      return {
        externalPostId: externalId,
        externalPermalink: `https://www.facebook.com/${externalId}`,
        providerResponse: res as unknown as Record<string, unknown>,
      };
    }

    const res = await this.provider.graph<{ id: string }>(
      `/${pageId}/feed`,
      {
        accessToken: pageToken,
        method: "POST",
        query: {
          ...(caption ? { message: caption } : {}),
          ...(input.media.link ? { link: input.media.link } : {}),
        },
      },
    );
    return {
      externalPostId: res.id,
      externalPermalink: `https://www.facebook.com/${res.id}`,
      providerResponse: res as unknown as Record<string, unknown>,
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function assertSupported(placement: string): asserts placement is SupportedPlacement {
  if (!SUPPORTED_PLACEMENTS.includes(placement as SupportedPlacement)) {
    throw new Error(
      `Placement "${placement}" ainda não é suportado. Suportados: ${SUPPORTED_PLACEMENTS.join(", ")}.`,
    );
  }
}

/** Serialises Graph errors into a message safe to store in `last_error`. */
export function formatPublishError(err: unknown): string {
  if (err instanceof MetaGraphError) {
    const code = err.graph?.code ? ` (code ${err.graph.code})` : "";
    return `Meta: ${err.message}${code}`;
  }
  if (err instanceof Error) return err.message;
  return "Erro desconhecido ao publicar";
}
