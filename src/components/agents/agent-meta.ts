import {
  BrainCircuit,
  PenTool,
  BarChart3,
  Sparkles,
  Users,
  Target,
  MessageSquare,
  Layers,
  Compass,
  type LucideIcon,
} from "lucide-react";

export type AgentCategory =
  | "strategy"
  | "content"
  | "analysis"
  | "audience"
  | "creative";

export type AgentMeta = {
  category: AgentCategory;
  categoryLabel: string;
  icon: LucideIcon;
  /** Tailwind classes for the icon container (bg + text). */
  iconClass: string;
  /** Badge tint class. */
  badgeClass: string;
  /** Default model label shown in footer. */
  model: string;
};

const CATEGORY_STYLE: Record<AgentCategory, Omit<AgentMeta, "category" | "model">> = {
  strategy: {
    categoryLabel: "Estratégia",
    icon: BrainCircuit,
    iconClass: "bg-violet-500/10 text-violet-500",
    badgeClass: "border-violet-500/20 bg-violet-500/10 text-violet-600 dark:text-violet-300",
  },
  content: {
    categoryLabel: "Criação",
    icon: PenTool,
    iconClass: "bg-blue-500/10 text-blue-500",
    badgeClass: "border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-300",
  },
  analysis: {
    categoryLabel: "Análise",
    icon: BarChart3,
    iconClass: "bg-emerald-500/10 text-emerald-500",
    badgeClass: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
  },
  audience: {
    categoryLabel: "Audiência",
    icon: Users,
    iconClass: "bg-amber-500/10 text-amber-500",
    badgeClass: "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-300",
  },
  creative: {
    categoryLabel: "Criativo",
    icon: Sparkles,
    iconClass: "bg-pink-500/10 text-pink-500",
    badgeClass: "border-pink-500/20 bg-pink-500/10 text-pink-600 dark:text-pink-300",
  },
};

const KEYWORD_TO_CATEGORY: Array<[RegExp, AgentCategory]> = [
  [/\b(persona|cohort|público|audien|segment)/i, "audience"],
  [/\b(swot|analis|análise|market|mercado|benchmark|competitor|insight)/i, "analysis"],
  [/\b(copy|caption|headline|roteir|script|conteúdo|conteudo|pauta|ideia)/i, "content"],
  [/\b(voice|tom|brand|identidade|criativo|art\b)/i, "creative"],
  [/\b(estrat|strategy|plano|planejamento|briefing)/i, "strategy"],
];

export function inferAgentCategory(id: string, name: string): AgentCategory {
  const hay = `${id} ${name}`;
  for (const [re, cat] of KEYWORD_TO_CATEGORY) if (re.test(hay)) return cat;
  return "strategy";
}

const OVERRIDE_ICONS: Record<string, LucideIcon> = {
  strategist: Compass,
  pauta: Layers,
  copywriter: MessageSquare,
  briefing: Target,
};

export function getAgentMeta(id: string, name: string): AgentMeta {
  const category = inferAgentCategory(id, name);
  const base = CATEGORY_STYLE[category];
  let icon = base.icon;
  for (const [key, ic] of Object.entries(OVERRIDE_ICONS)) {
    if (id.toLowerCase().includes(key) || name.toLowerCase().includes(key)) {
      icon = ic;
      break;
    }
  }
  return {
    category,
    categoryLabel: base.categoryLabel,
    icon,
    iconClass: base.iconClass,
    badgeClass: base.badgeClass,
    model: "gemini-2.5-flash",
  };
}

/** Clean AI-generated prompt names into Title Case, no ALL CAPS, no dashes. */
export function toTitleCase(raw: string): string {
  const cleaned = raw
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  const small = new Set(["de", "da", "do", "das", "dos", "e", "a", "o", "para", "com", "em"]);
  return cleaned
    .split(" ")
    .map((w, i) =>
      i > 0 && small.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1),
    )
    .join(" ");
}

/** Strip markdown dividers, headings, bullets, ALL CAPS lines from a prompt to
 * turn it into a clean synopsis. */
export function cleanPromptSynopsis(prompt: string): string {
  const lines = prompt
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .filter((l) => !/^[-=_*#]{3,}$/.test(l))
    .filter((l) => !/^#{1,6}\s/.test(l))
    .map((l) => l.replace(/^[*\-•]\s+/, ""))
    .map((l) => l.replace(/\*\*/g, ""))
    .map((l) =>
      l === l.toUpperCase() && l.length > 6 ? l.charAt(0) + l.slice(1).toLowerCase() : l,
    );
  return lines.join(" ").replace(/\s+/g, " ").trim();
}

/** Extract {{variables}} from a prompt. */
export function extractPromptVariables(prompt: string): string[] {
  const set = new Set<string>();
  const re = /\{\{\s*([A-Z0-9_]+)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(prompt)) !== null) set.add(m[1]);
  return [...set];
}