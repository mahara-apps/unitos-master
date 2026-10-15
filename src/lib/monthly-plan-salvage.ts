/**
 * Recuperação de lotes da Pauta recusados pelo provedor por formato.
 *
 * Provedores com JSON Schema estrito (ex.: Groq) recusam a resposta INTEIRA
 * quando uma única ideia omite campos — mesmo campos opcionais de agenda
 * (dia/hora/justificativa). O conteúdo descartado vem junto do erro
 * (`failed_generation`); este módulo normaliza esse conteúdo.
 */

const FORMATS = new Set(["feed", "stories", "reels", "carrossel"]);

export type SalvagedTopic = {
  topic_title: string;
  content_format: "feed" | "stories" | "reels" | "carrossel";
  angle: string;
  channel: string | null;
  target_audience: string | null;
  rationale: string | null;
  suggested_weekday: number | null;
  suggested_time: string | null;
  slot_rationale: string | null;
};

export type SalvagedPlan = {
  title: string;
  description: string;
  objectives: string;
  topics: SalvagedTopic[];
};

const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;

/**
 * Aceita ideias sem os campos de agenda (viram `null`) e descarta ideias sem
 * título ou formato válido. Retorna null quando nada é aproveitável.
 */
export function normalizePlanBatch(value: unknown): SalvagedPlan | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw.topics)) return null;
  const topics: SalvagedTopic[] = [];
  for (const item of raw.topics) {
    if (!item || typeof item !== "object") continue;
    const t = item as Record<string, unknown>;
    const title = str(t.topic_title);
    const format = str(t.content_format);
    if (!title || !format || !FORMATS.has(format)) continue;
    topics.push({
      topic_title: title,
      content_format: format as SalvagedTopic["content_format"],
      angle: str(t.angle) ?? "",
      channel: str(t.channel),
      target_audience: str(t.target_audience),
      rationale: str(t.rationale),
      suggested_weekday: typeof t.suggested_weekday === "number" ? t.suggested_weekday : null,
      suggested_time: str(t.suggested_time),
      slot_rationale: str(t.slot_rationale),
    });
  }
  if (topics.length === 0) return null;
  return {
    title: str(raw.title) ?? "",
    description: str(raw.description) ?? "",
    objectives: str(raw.objectives) ?? "",
    topics,
  };
}

/** Erro de "JSON gerado não bate com o schema" (repetível uma vez). */
export function isSchemaRejection(error: unknown): boolean {
  const seen = new Set<unknown>();
  const walk = (e: unknown): string => {
    if (!e || seen.has(e)) return "";
    seen.add(e);
    const o = e as { message?: unknown; responseBody?: unknown; cause?: unknown };
    return [
      typeof o.message === "string" ? o.message : "",
      typeof o.responseBody === "string" ? o.responseBody : "",
      walk(o.cause),
    ].join(" ");
  };
  return /does not match the expected schema|json_validate_failed|does not validate with|failed_generation/i.test(
    walk(error),
  );
}
