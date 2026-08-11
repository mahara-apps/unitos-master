import type { SupabaseClient } from "@supabase/supabase-js";
import { PLAN_CHANNELS, WEEKS_PER_MONTH, type PlanChannel } from "@/lib/monthly-plan-fields";

/**
 * Contexto de briefing consolidado do cliente (sempre usado pela IA na Pauta).
 * Monta o texto a partir de `clients` + `clients.brand_hub` + resumos de
 * `client_documents.ai_summary`, no mesmo espírito do pipeline de Estratégia IA.
 */

export type BriefingContext = {
  text: string;
  clientName: string | null;
  niche: string | null;
  weekly: Record<PlanChannel, number>;
  monthlyQuota: Record<PlanChannel, number>;
  totalTarget: number;
};

function pushLine(lines: string[], label: string, value: unknown) {
  if (value == null) return;
  if (Array.isArray(value)) {
    const arr = value.map((v) => (typeof v === "string" ? v.trim() : v)).filter(Boolean);
    if (arr.length) lines.push(`${label}: ${arr.join(", ")}`);
    return;
  }
  if (typeof value === "number") {
    lines.push(`${label}: ${value}`);
    return;
  }
  if (typeof value === "string" && value.trim()) lines.push(`${label}: ${value.trim()}`);
}

export async function loadBriefingContext(
  supabase: SupabaseClient,
  clientId: string,
  opts: { briefingId?: string | null } = {},
): Promise<BriefingContext> {
  const [clientRes, docsRes, briefingRes] = await Promise.all([
    supabase
      .from("clients")
      .select("name, niche, color, tone_of_voice, socials, brand_hub")
      .eq("id", clientId)
      .maybeSingle(),
    supabase
      .from("client_documents")
      .select("name, ai_summary")
      .eq("client_id", clientId)
      .not("ai_summary", "is", null)
      .limit(12),
    opts.briefingId
      ? supabase.from("brand_briefings").select("data").eq("id", opts.briefingId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const row = (clientRes.data ?? {}) as {
    name?: string | null;
    niche?: string | null;
    color?: string | null;
    tone_of_voice?: string | null;
    socials?: Record<string, string | null> | null;
    brand_hub?: Record<string, unknown> | null;
  };
  const hub = (row.brand_hub ?? {}) as Record<string, unknown>;
  const lines: string[] = [];

  // Identidade
  pushLine(lines, "Marca/Cliente", row.name);
  pushLine(lines, "Nicho", row.niche);
  pushLine(lines, "Tom de voz", (hub.tone_text as string | undefined) ?? row.tone_of_voice);
  pushLine(lines, "Missão", hub.mission);
  pushLine(lines, "Posicionamento", hub.positioning);
  pushLine(lines, "Valores", hub.values);

  // Produto
  pushLine(lines, "Oferta / produtos", hub.offer);
  pushLine(lines, "Faixa de preço", hub.price_range);
  pushLine(lines, "Diferenciais", hub.differentials);
  pushLine(lines, "Objeções", hub.objections);

  // Público
  pushLine(lines, "Público", hub.audience);
  pushLine(lines, "Jornada", hub.journey);
  pushLine(lines, "Dores", hub.pain_points);
  pushLine(lines, "Desejos", hub.desires);

  // Concorrentes / inspirações
  const competitors = Array.isArray(hub.competitors)
    ? (hub.competitors as Array<Record<string, unknown>>)
    : [];
  pushLine(
    lines,
    "Concorrentes / referências",
    competitors.map((c) => (typeof c.handle === "string" ? c.handle : "")).filter(Boolean),
  );
  pushLine(lines, "Inspirações", hub.inspirations);

  // Estética
  const palette = Array.isArray(hub.palette) ? (hub.palette as Array<Record<string, unknown>>) : [];
  pushLine(
    lines,
    "Paleta",
    palette.map((p) => (typeof p.hex === "string" ? p.hex : "")).filter(Boolean),
  );
  pushLine(lines, "Cor da marca", row.color);
  const hashtags = hub.hashtags as string[] | undefined;
  pushLine(lines, "Hashtags", hashtags?.map((h) => (h.startsWith("#") ? h : `#${h}`)));
  const doDont = (hub.do_dont ?? {}) as { do?: string; dont?: string };
  pushLine(lines, "Do", doDont.do);
  pushLine(lines, "Don't", doDont.dont);

  // Metas & volumetria
  const vol = (hub.volumetry ?? {}) as Record<string, number | undefined>;
  const weekly = PLAN_CHANNELS.reduce<Record<PlanChannel, number>>(
    (acc, c) => {
      acc[c] = Number(vol[c] ?? 0) || 0;
      return acc;
    },
    {} as Record<PlanChannel, number>,
  );
  const monthlyQuota = PLAN_CHANNELS.reduce<Record<PlanChannel, number>>(
    (acc, c) => {
      acc[c] = Math.round(weekly[c] * WEEKS_PER_MONTH);
      return acc;
    },
    {} as Record<PlanChannel, number>,
  );
  const totalTarget = PLAN_CHANNELS.reduce((s, c) => s + monthlyQuota[c], 0);

  pushLine(
    lines,
    "Volumetria semanal",
    PLAN_CHANNELS.filter((c) => weekly[c] > 0)
      .map((c) => `${c}: ${weekly[c]}/sem`)
      .join(", "),
  );
  const formats = (hub.formats ?? {}) as Record<string, string[] | undefined>;
  pushLine(
    lines,
    "Formatos por rede",
    Object.entries(formats)
      .filter(([, v]) => Array.isArray(v) && v.length > 0)
      .map(([k, v]) => `${k}: ${(v as string[]).join("/")}`)
      .join("; "),
  );
  pushLine(lines, "Metas", hub.goals);

  const socials = (row.socials ?? {}) as Record<string, string | null>;
  pushLine(
    lines,
    "Canais sociais",
    Object.entries(socials)
      .filter(([, v]) => typeof v === "string" && v.trim())
      .map(([k, v]) => `${k}: ${v}`),
  );

  // Documentos analisados
  const docs = (docsRes.data ?? []) as Array<{ name: string | null; ai_summary: unknown }>;
  for (const d of docs) {
    const summary =
      typeof d.ai_summary === "string" ? d.ai_summary : JSON.stringify(d.ai_summary ?? "");
    if (summary && summary !== '""') {
      lines.push(`Documento "${d.name ?? "sem nome"}": ${summary.slice(0, 800)}`);
    }
  }

  // Briefing versionado escolhido explicitamente (opcional)
  const versioned = (briefingRes as { data?: { data?: unknown } | null } | null)?.data?.data;
  if (versioned) {
    const raw = typeof versioned === "string" ? versioned : JSON.stringify(versioned);
    lines.push(`Briefing selecionado (versão): ${raw.slice(0, 3000)}`);
  }

  return {
    text: lines.join("\n"),
    clientName: row.name ?? null,
    niche: row.niche ?? null,
    weekly,
    monthlyQuota,
    totalTarget,
  };
}
