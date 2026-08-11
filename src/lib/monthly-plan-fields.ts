/** Campos obrigatórios da Pauta — compartilhados entre UI e servidor. */

export const PLAN_CHANNELS = ["instagram", "tiktok", "linkedin", "youtube", "facebook"] as const;
export type PlanChannel = (typeof PLAN_CHANNELS)[number];

export const PLAN_CHANNEL_LABEL: Record<PlanChannel, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  facebook: "Facebook",
};

export const PLAN_FORMATS = [
  "Reels",
  "Carrossel",
  "Storie",
  "Post estático",
  "Vídeo curto",
] as const;

export const WEEKS_PER_MONTH = 4.3;
