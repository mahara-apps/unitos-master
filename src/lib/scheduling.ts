/**
 * Slot scheduling helper.
 *
 * Estratégia:
 *  - Se `bestHoursBRT` for informado (ex.: vindo da API do Instagram Insights),
 *    usamos exatamente esses horários como slots do dia (em BRT / UTC-3).
 *  - Caso contrário, aplicamos o fallback de espaçamento de +6h começando às
 *    09:00 BRT: [9, 15, 21]. Isso garante que dois posts no mesmo dia nunca
 *    saiam no mesmo horário e ficam bem distribuídos ao longo do dia.
 *
 * Retorna uma função `scheduleFor(index)` que devolve um ISO em UTC.
 */
export type SlotScheduler = (index: number) => string;

const DEFAULT_SPACED_HOURS_BRT = [9, 15, 21]; // +6h entre slots

export function buildSlotScheduler(
  businessDays: Date[],
  total: number,
  bestHoursBRT?: number[] | null,
): SlotScheduler {
  const rawHours = Array.isArray(bestHoursBRT) && bestHoursBRT.length > 0
    ? bestHoursBRT.filter((h) => Number.isFinite(h) && h >= 0 && h <= 23)
    : DEFAULT_SPACED_HOURS_BRT;
  const hoursBRT = Array.from(new Set(rawHours)).sort((a, b) => a - b);
  // BRT (UTC-3) → UTC: soma 3 horas, com carry para o dia seguinte se passar de 23h.
  const slots = hoursBRT.map((h) => ({ utcHour: (h + 3) % 24, nextDay: h + 3 >= 24 }));

  return (index: number): string => {
    if (!businessDays.length) return new Date().toISOString();
    const perDay = Math.max(1, Math.ceil(total / businessDays.length));
    const dayIdx = Math.min(businessDays.length - 1, Math.floor(index / perDay));
    const slotIdx = index % perDay;
    const slot = slots[slotIdx % slots.length];
    const d = new Date(businessDays[dayIdx]);
    if (slot.nextDay) d.setUTCDate(d.getUTCDate() + 1);
    d.setUTCHours(slot.utcHour, 0, 0, 0);
    return d.toISOString();
  };
}

/**
 * Lê horários preferenciais da marca em `brand_connections.channels.instagram.best_times`
 * (array de números 0-23 em BRT). Se não existir, retorna null (fallback +6h).
 *
 * O shape esperado é populado pelo módulo de integração com a Graph API do
 * Instagram (Insights de melhores horários). Enquanto essa integração não
 * retornar dados, o fallback é usado automaticamente.
 */
export function extractBestHoursFromChannels(channels: unknown): number[] | null {
  if (!channels || typeof channels !== "object") return null;
  const ig = (channels as Record<string, unknown>).instagram;
  if (!ig || typeof ig !== "object") return null;
  const raw = (ig as Record<string, unknown>).best_times;
  if (!Array.isArray(raw)) return null;
  const hours = raw
    .map((v) => (typeof v === "number" ? v : Number.parseInt(String(v), 10)))
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= 23);
  return hours.length > 0 ? hours : null;
}