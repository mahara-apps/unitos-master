/**
 * Fonte da verdade dos formatos suportados por cada rede social no wizard
 * de agendamento. Isomórfico — pode ser importado no cliente e no servidor.
 *
 * Os valores de `format` devem casar com o CHECK constraint de
 * public.post_placements: 'feed' | 'stories' | 'reels' | 'carrossel'.
 */

import type { SocialChannel } from "@/lib/social-core/capabilities";

export type PlacementFormat = "feed" | "stories" | "reels" | "carrossel";

export const FORMAT_LABEL: Record<PlacementFormat, string> = {
  feed: "Feed",
  stories: "Stories",
  reels: "Reels",
  carrossel: "Carrossel",
};

/** Formatos válidos por canal — regra de negócio local (sem tabela). */
export const FORMATS_BY_CHANNEL: Record<SocialChannel, PlacementFormat[]> = {
  instagram: ["feed", "stories", "reels", "carrossel"],
  facebook: ["feed"],
  linkedin: ["feed"],
  tiktok: ["reels"],
  youtube: ["reels"],
  x: ["feed"],
  threads: ["feed"],
};

/** Limite conservador de caracteres por rede, usado como aviso de UI. */
export const CAPTION_LIMIT: Record<SocialChannel, number> = {
  instagram: 2200,
  facebook: 5000,
  linkedin: 3000,
  tiktok: 2200,
  youtube: 5000,
  x: 280,
  threads: 500,
};

export function isValidPair(channel: SocialChannel, format: PlacementFormat): boolean {
  return FORMATS_BY_CHANNEL[channel]?.includes(format) ?? false;
}

/** Menor limite de caption entre um conjunto de destinos. */
export function tightestCaptionLimit(channels: SocialChannel[]): number {
  if (!channels.length) return 2200;
  return channels.reduce((min, c) => Math.min(min, CAPTION_LIMIT[c] ?? 2200), Infinity);
}
