import type { SupabaseClient } from "@supabase/supabase-js";
import { computeBriefingCompletion } from "@/lib/briefing-progress";
import type { BrandHubData } from "@/lib/brand-hub.functions";

/**
 * FASE 1 — Fonte única do briefing.
 *
 * `clients.brand_hub` é a fonte CANÔNICA do briefing operacional. Este módulo
 * centraliza a leitura e a projeção do briefing para todos os consumidores
 * (IA, Pauta, Media Plans, Customer Pipeline, Documentos).
 *
 * `brand_briefings` permanece apenas por COMPATIBILIDADE: seus campos são
 * usados como *fallback* quando o `brand_hub` ainda não tem o dado, garantindo
 * que nenhum dado existente seja perdido. Nada aqui escreve numa nova fonte.
 */

export type LegacyBriefingData = {
  publico_alvo: string | null;
  tom_de_voz: string | null;
  dores_do_cliente_final: string[];
  diferenciais: string[];
  hashtags_sugeridas: string[];
  concorrentes_mencionados: string[];
  volume_semanal_estimado: number | null;
  completude_percentual: number;
  mission: string | null;
  positioning: string | null;
  values: string | null;
  offer: string | null;
  price_range: string | null;
  objections: string | null;
  journey: string | null;
  desires: string | null;
  goals: string | null;
};

/** Linha de briefing normalizada (leitura), derivada do brand_hub. */
export type CanonicalBriefingRow = {
  id: string | null;
  brand_id: string;
  client_id: string;
  raw_text: string | null;
  created_at: string | null;
  data: LegacyBriefingData;
  completude: number;
  source: "brand_hub";
};

export type CanonicalBriefing = {
  clientId: string;
  clientName: string | null;
  niche: string | null;
  toneOfVoice: string | null;
  /** brand_hub atual (canônico), já mesclado com fallback legado. */
  hub: BrandHubData;
  /** Projeção no formato legado (chaves em pt-BR) consumido pelos agentes. */
  legacy: LegacyBriefingData;
  /** Métrica oficial de completude. */
  completion: number;
  /** Se existe registro em brand_briefings (compatibilidade / diagnóstico). */
  hasLegacyRow: boolean;
  legacyRowId: string | null;
};

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function toList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => (typeof x === "string" ? x.trim() : String(x ?? ""))).filter(Boolean);
  const s = str(v);
  if (!s) return [];
  return s
    .split(/\n|;|,/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Campos do brand_hub que aceitam preenchimento a partir de fontes legadas. */
const HUB_TEXT_FIELDS = [
  "description",
  "mission",
  "positioning",
  "values",
  "offer",
  "price_range",
  "differentials",
  "objections",
  "audience",
  "journey",
  "pain_points",
  "desires",
  "demographics",
  "tone_text",
  "goals",
] as const;

/**
 * Preenche lacunas do brand_hub com o conteúdo do registro legado
 * (`brand_briefings.data`). Nunca sobrescreve valores já presentes no hub.
 */
export function mergeLegacyIntoHub(
  hub: BrandHubData,
  legacy: Record<string, unknown> | null | undefined,
): BrandHubData {
  if (!legacy) return hub;
  const out: Record<string, unknown> = { ...(hub as Record<string, unknown>) };

  for (const f of HUB_TEXT_FIELDS) {
    if (!str(out[f]) && str(legacy[f])) out[f] = str(legacy[f]);
  }
  // Equivalências pt-BR → hub
  if (!str(out.audience) && str(legacy.publico_alvo)) out.audience = str(legacy.publico_alvo);
  if (!str(out.tone_text) && str(legacy.tom_de_voz)) out.tone_text = str(legacy.tom_de_voz);
  if (!str(out.pain_points) && toList(legacy.dores_do_cliente_final).length) {
    out.pain_points = toList(legacy.dores_do_cliente_final).join("\n");
  }
  if (!str(out.differentials) && toList(legacy.diferenciais).length) {
    out.differentials = toList(legacy.diferenciais).join("\n");
  }
  if (!(Array.isArray(out.hashtags) && out.hashtags.length) && toList(legacy.hashtags_sugeridas).length) {
    out.hashtags = toList(legacy.hashtags_sugeridas);
  }
  if (!(Array.isArray(out.competitors) && (out.competitors as unknown[]).length)) {
    const mentioned = toList(legacy.concorrentes_mencionados);
    if (mentioned.length) out.competitors = mentioned.map((handle) => ({ handle }));
  }
  return out as BrandHubData;
}

/** Projeta o brand_hub canônico no formato legado usado pelos agentes de IA. */
export function hubToLegacyBriefing(
  hub: BrandHubData,
  opts: { toneOfVoice?: string | null; completion?: number } = {},
): LegacyBriefingData {
  const h = hub as Record<string, unknown>;
  const volumetry = (h.volumetry ?? {}) as Record<string, number | undefined>;
  const weekly = Object.values(volumetry).reduce<number>((s, v) => s + (Number(v) || 0), 0);
  const competitors = Array.isArray(h.competitors) ? (h.competitors as Array<Record<string, unknown>>) : [];

  return {
    publico_alvo: str(h.audience),
    tom_de_voz: str(h.tone_text) ?? str(opts.toneOfVoice),
    dores_do_cliente_final: toList(h.pain_points),
    diferenciais: toList(h.differentials),
    hashtags_sugeridas: toList(h.hashtags),
    concorrentes_mencionados: competitors
      .map((c) => str(c.handle) ?? str(c.name))
      .filter((v): v is string => !!v),
    volume_semanal_estimado: weekly > 0 ? weekly : null,
    completude_percentual: opts.completion ?? 0,
    // Campos extras (chaves do hub) para agentes que já conhecem o vocabulário novo.
    mission: str(h.mission),
    positioning: str(h.positioning),
    values: str(h.values),
    offer: str(h.offer),
    price_range: str(h.price_range),
    objections: str(h.objections),
    journey: str(h.journey),
    desires: str(h.desires),
    goals: str(h.goals),
  };
}

/**
 * Leitura canônica do briefing de um cliente.
 * Sempre parte de `clients.brand_hub`; usa `brand_briefings` apenas como
 * fallback de compatibilidade (sem escrever nada).
 */
export async function loadCanonicalBriefing(
  supabase: SupabaseClient,
  args: { clientId: string; brandId?: string | null },
): Promise<CanonicalBriefing> {
  const [clientRes, legacyRes] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name, niche, tone_of_voice, brand_hub")
      .eq("id", args.clientId)
      .maybeSingle(),
    (() => {
      let q = supabase
        .from("brand_briefings")
        .select("id, data")
        .eq("client_id", args.clientId)
        .order("created_at", { ascending: false })
        .limit(1);
      if (args.brandId) q = q.eq("brand_id", args.brandId);
      return q.maybeSingle();
    })(),
  ]);

  const row = (clientRes.data ?? {}) as {
    name?: string | null;
    niche?: string | null;
    tone_of_voice?: string | null;
    brand_hub?: Record<string, unknown> | null;
  };
  const legacyRow = (legacyRes.data ?? null) as { id?: string; data?: Record<string, unknown> | null } | null;

  const hub = mergeLegacyIntoHub((row.brand_hub ?? {}) as BrandHubData, legacyRow?.data ?? null);
  const completion = computeBriefingCompletion(hub, { tone_of_voice: row.tone_of_voice ?? null });

  return {
    clientId: args.clientId,
    clientName: row.name ?? null,
    niche: row.niche ?? null,
    toneOfVoice: row.tone_of_voice ?? null,
    hub,
    legacy: hubToLegacyBriefing(hub, { toneOfVoice: row.tone_of_voice ?? null, completion }),
    completion,
    hasLegacyRow: !!legacyRow?.id,
    legacyRowId: legacyRow?.id ?? null,
  };
}

/** Texto plano do briefing canônico, para prompts que só precisam de contexto. */
export function briefingToPromptText(b: CanonicalBriefing): string {
  const h = b.hub as Record<string, unknown>;
  const lines: string[] = [];
  const add = (label: string, v: unknown) => {
    if (Array.isArray(v)) {
      const arr = v.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).filter(Boolean);
      if (arr.length) lines.push(`${label}: ${arr.join(", ")}`);
      return;
    }
    const s = str(v);
    if (s) lines.push(`${label}: ${s}`);
  };
  add("Cliente", b.clientName);
  add("Nicho", b.niche);
  add("Tom de voz", str(h.tone_text) ?? b.toneOfVoice);
  add("Missão", h.mission);
  add("Posicionamento", h.positioning);
  add("Valores", h.values);
  add("Oferta", h.offer);
  add("Faixa de preço", h.price_range);
  add("Diferenciais", h.differentials);
  add("Objeções", h.objections);
  add("Público", h.audience);
  add("Demografia", h.demographics);
  add("Jornada", h.journey);
  add("Dores", h.pain_points);
  add("Desejos", h.desires);
  add("Metas", h.goals);
  add("Hashtags", h.hashtags);
  add(
    "Concorrentes",
    (Array.isArray(h.competitors) ? (h.competitors as Array<Record<string, unknown>>) : [])
      .map((c) => str(c.handle) ?? str(c.name))
      .filter(Boolean),
  );
  lines.push(`Completude do briefing: ${b.completion}%`);
  return lines.join("\n");
}

/**
 * Projeta o briefing canônico no formato de linha de `brand_briefings`
 * esperado pela UI/agentes, preservando metadados da linha legada quando
 * existir. NÃO escreve nada — apenas normaliza a leitura.
 */
export function projectCanonicalBriefingRow(
  canonical: CanonicalBriefing,
  legacyRow: Record<string, unknown> | null | undefined,
  scope: { brandId: string; clientId: string },
): Record<string, unknown> | null {
  const hasHubData = canonical.completion > 0;
  if (!legacyRow && !hasHubData) return null;
  const base = legacyRow ?? {
    id: null,
    brand_id: scope.brandId,
    client_id: scope.clientId,
    raw_text: null,
    created_at: null,
  };
  return {
    ...base,
    data: {
      ...(((legacyRow?.data as Record<string, unknown>) ?? {}) as Record<string, unknown>),
      ...canonical.legacy,
    },
    completude: canonical.completion,
    /** Origem do dado exposto (diagnóstico da Fase 1). */
    source: "brand_hub",
  };
}
