/** Campos obrigatórios da Pauta — compartilhados entre UI e servidor. */

export const PLAN_CHANNELS = [
  "instagram",
  "tiktok",
  "linkedin",
  "youtube",
  "facebook",
  "x",
  "threads",
] as const;
export type PlanChannel = (typeof PLAN_CHANNELS)[number];

export const PLAN_CHANNEL_LABEL: Record<PlanChannel, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  facebook: "Facebook",
  x: "Twitter/X",
  threads: "Threads",
};

/** Canais exibidos por padrão na volumetria do briefing. */
export const PLAN_CHANNELS_DEFAULT: PlanChannel[] = [
  "instagram",
  "tiktok",
  "linkedin",
  "youtube",
  "facebook",
];

export const PLAN_FORMATS = [
  "Reels",
  "Carrossel",
  "Storie",
  "Post estático",
  "Vídeo curto",
] as const;

/** Mês contábil da pauta = 4 semanas cheias (4/sem => 16/mês, soma exata). */
export const WEEKS_PER_MONTH = 4;
