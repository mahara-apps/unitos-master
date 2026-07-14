import type { StageColor } from "@/lib/content.functions";

export const STAGE_BG: Record<StageColor, string> = {
  muted: "bg-muted-foreground/60",
  indigo: "bg-indigo-500",
  violet: "bg-violet-500",
  amber: "bg-amber-500",
  emerald: "bg-emerald-500",
  sky: "bg-sky-500",
  rose: "bg-rose-500",
  cyan: "bg-cyan-500",
};

// Top-band gradient per stage (Kiiru-inspired, subtle)
export const STAGE_GRADIENT: Record<StageColor, string> = {
  muted: "from-zinc-400/70 via-zinc-400/40 to-transparent",
  indigo: "from-indigo-500 via-indigo-400/60 to-transparent",
  violet: "from-violet-500 via-violet-400/60 to-transparent",
  amber: "from-amber-500 via-amber-400/60 to-transparent",
  emerald: "from-emerald-500 via-emerald-400/60 to-transparent",
  sky: "from-sky-500 via-sky-400/60 to-transparent",
  rose: "from-rose-500 via-rose-400/60 to-transparent",
  cyan: "from-cyan-500 via-cyan-400/60 to-transparent",
};

export const PRIORITY_STYLES: Record<string, string> = {
  low: "border-zinc-500/30 bg-zinc-500/10 text-zinc-300",
  medium: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  high: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  urgent: "border-rose-500/30 bg-rose-500/10 text-rose-300",
};

export const PRIORITY_LABEL: Record<string, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  urgent: "Urgente",
};

export const CHANNELS: Array<{ id: string; label: string }> = [
  { id: "instagram", label: "Instagram" },
  { id: "tiktok", label: "TikTok" },
  { id: "youtube", label: "YouTube" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "x", label: "Twitter/X" },
  { id: "facebook", label: "Facebook" },
  { id: "threads", label: "Threads" },
  { id: "blog", label: "Blog" },
  { id: "graphic", label: "Material Gráfico" },
];

export const FORMATS = ["Feed", "Reels", "Story", "Carrossel"] as const;