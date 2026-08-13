import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Shared helper — reconciliação de `post_placements` a partir de destinos
 * (conta + formato). Usado pelo wizard de agendamento e pelo Kanban editorial
 * para manter os placements como fonte única de verdade sobre destinos reais.
 *
 * Estratégia: apaga todos os placements do post e reinsere (baixa cardinalidade).
 * A UNIQUE em (post_id, format) implica "1 formato por card" — quando o mesmo
 * formato aparece em múltiplos destinos, apenas o último vence.
 */

export type PlacementFormatEnum = "feed" | "stories" | "reels" | "carrossel";

export type PlacementDestination = {
  connectionId: string;
  channel: string;
  format: PlacementFormatEnum;
  copyOverride?: string | null;
};

export type SyncPostPlacementsInput = {
  postId: string;
  brandId: string;
  clientId: string;
  destinations: PlacementDestination[];
  mediaPaths?: string[];
  hashtags?: string[];
  firstComment?: string | null;
  linkUrl?: string | null;
  locationName?: string | null;
  locationId?: string | null;
  scheduledIso?: string | null;
  status?: "draft" | "scheduled";
};

export async function syncPostPlacements(
  supabase: SupabaseClient,
  input: SyncPostPlacementsInput,
): Promise<void> {
  const {
    postId,
    brandId,
    clientId,
    destinations,
    mediaPaths = [],
    hashtags = [],
    firstComment = null,
    linkUrl = null,
    locationName = null,
    locationId = null,
    scheduledIso = null,
    status = "draft",
  } = input;

  // Placements JÁ PUBLICADOS são histórico: nunca apagados nem reescritos.
  const { data: publishedRows, error: pubErr } = await supabase
    .from("post_placements")
    .select("format")
    .eq("post_id", postId)
    .eq("status", "published");
  if (pubErr) throw new Error(pubErr.message);
  const publishedFormats = new Set(
    ((publishedRows ?? []) as Array<{ format: string }>).map((r) => r.format),
  );

  const { error: delErr } = await supabase
    .from("post_placements")
    .delete()
    .eq("post_id", postId)
    .neq("status", "published");
  if (delErr) throw new Error(delErr.message);

  if (!destinations.length) return;

  const mediaJson = mediaPaths.map((p) => ({ storagePath: p }));
  // UNIQUE(post_id, format) — deduplica mantendo o último por format.
  const byFormat = new Map<PlacementFormatEnum, PlacementDestination>();
  for (const d of destinations) {
    if (publishedFormats.has(d.format)) continue;
    byFormat.set(d.format, d);
  }


  const rows = Array.from(byFormat.values()).map((d, i) => ({
    post_id: postId,
    brand_id: brandId,
    client_id: clientId,
    format: d.format,
    // Coluna canônica (Fase 1): FK real para social_connections.
    connection_id: d.connectionId,
    scheduled_at: scheduledIso,
    copy_override: {
      // Espelho legado — leitores antigos continuam funcionando.
      connection_id: d.connectionId,
      channel: d.channel,
      ...(d.copyOverride ? { copy: d.copyOverride } : {}),
      ...(hashtags.length ? { hashtags } : {}),
      ...(firstComment ? { first_comment: firstComment } : {}),
      ...(linkUrl ? { link: linkUrl } : {}),
      ...(locationName ? { location_name: locationName } : {}),
      ...(locationId ? { location_id: locationId } : {}),
    },
    media: mediaJson,
    status,
    is_primary: i === 0,
  }));


  if (!rows.length) return;
  const { error: insErr } = await supabase.from("post_placements").insert(rows);
  if (insErr) throw new Error(insErr.message);

}

/**
 * Enum de canais aceitos por `posts.channels` (post_channel).
 * Facebook não faz parte do enum — Facebook Feed é modelado apenas via
 * `post_placements.copy_override.channel` + `social_connections`.
 */
export const POST_CHANNEL_ENUM = new Set([
  "instagram",
  "tiktok",
  "linkedin",
  "x",
  "youtube",
  "blog",
]);

export type PostChannelEnum =
  | "instagram"
  | "tiktok"
  | "linkedin"
  | "x"
  | "youtube"
  | "blog";

export function deriveChannelsFromDestinations(
  destinations: Array<{ channel: string }>,
): PostChannelEnum[] {
  return Array.from(new Set(destinations.map((d) => d.channel))).filter((c) =>
    POST_CHANNEL_ENUM.has(c),
  ) as PostChannelEnum[];
}

export function deriveTargetConnectionIds(
  destinations: Array<{ connectionId: string }>,
): string[] {
  return Array.from(new Set(destinations.map((d) => d.connectionId)));
}