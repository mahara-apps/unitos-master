import { Instagram, Linkedin, Twitter, Music2 } from "lucide-react";
import type { Platform } from "./types";

const MAP = {
  instagram: { Icon: Instagram, label: "Instagram", className: "text-pink-500" },
  linkedin: { Icon: Linkedin, label: "LinkedIn", className: "text-sky-500" },
  twitter: { Icon: Twitter, label: "Twitter/X", className: "text-foreground" },
  tiktok: { Icon: Music2, label: "TikTok", className: "text-fuchsia-500" },
} as const;

export function PlatformIcon({ platform, className }: { platform: Platform; className?: string }) {
  const entry = MAP[platform];
  const Icon = entry.Icon;
  return <Icon className={className ?? `h-4 w-4 ${entry.className}`} aria-label={entry.label} />;
}

export function platformLabel(platform: Platform) {
  return MAP[platform].label;
}