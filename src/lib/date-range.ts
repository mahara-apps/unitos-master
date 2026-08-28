/**
 * FONTE DE VERDADE ÚNICA de períodos (filtro de datas).
 *
 * Causa raiz da inconsistência "Últimos 30 dias → exibe 29 dias":
 * os presets produziam um intervalo instante-a-instante (`hoje - 29 dias` no
 * mesmo horário) e cada consumidor recontava os dias de forma diferente:
 * a UI somava +1 (contagem INCLUSIVA, correta) e o servidor usava
 * `Math.ceil((to - from) / DIA)`, que sobre um intervalo de exatamente 29×24h
 * devolve 29 (contagem EXCLUSIVA). Fuso/DST e horário inicial/final
 * introduziam ainda mais divergência.
 *
 * Regra oficial, aplicada aqui e em todos os consumidores:
 *  - todo intervalo é FECHADO e INCLUSIVO em dias de calendário;
 *  - `from` é sempre 00:00:00.000 e `to` sempre 23:59:59.999 do dia local;
 *  - a contagem de dias é `diferença de dias de calendário + 1`, imune a
 *    horas, minutos e a mudanças de horário de verão.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

/** Dias de calendário decorridos entre duas datas (imune a horário/DST). */
function calendarDayDiff(from: Date, to: Date): number {
  // Usa UTC dos componentes locais: elimina o erro de ±1h do horário de verão.
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / DAY_MS);
}

/** Contagem INCLUSIVA de dias: "hoje → hoje" = 1; "hoje-29 → hoje" = 30. */
export function inclusiveDayCount(from: Date, to: Date): number {
  return Math.max(1, calendarDayDiff(from, to) + 1);
}

/** Mesma contagem a partir de instantes (ms) — usada no servidor. */
export function inclusiveDayCountFromMs(fromMs: number, toMs: number): number {
  return inclusiveDayCount(new Date(fromMs), new Date(toMs));
}

/**
 * Intervalo canônico de N dias INCLUSIVOS terminando em `today`:
 * N=7 → 7 dias (hoje incluído); N=30 → 30 dias.
 */
export function lastNDays(n: number, today: Date = new Date()): { from: Date; to: Date } {
  const days = Math.max(1, Math.round(n));
  const to = endOfDay(today);
  const from = startOfDay(new Date(to.getFullYear(), to.getMonth(), to.getDate() - (days - 1)));
  return { from, to };
}

/** Normaliza qualquer intervalo para os limites do dia (chave e payload coerentes). */
export function normalizeDayRange<T extends { from?: Date; to?: Date }>(
  range: T | undefined,
): { from: Date; to: Date } | undefined {
  if (!range?.from) return undefined;
  const to = range.to ?? range.from;
  return { from: startOfDay(range.from), to: endOfDay(to) };
}

/**
 * Resolução de período no SERVIDOR a partir do payload ISO enviado pela UI.
 * Usa exatamente a mesma contagem inclusiva do filtro, para que o intervalo
 * consultado e o número de dias exibido nunca divirjam.
 */
export function resolveInclusiveRange(
  input?: { from?: string; to?: string },
  opts?: { defaultDays?: number; maxDays?: number },
): { fromIso: string; toIso: string; fromMs: number; toMs: number; days: number } {
  const defaultDays = opts?.defaultDays ?? 30;
  const nowMs = Date.now();
  const toMs = input?.to ? new Date(input.to).getTime() : nowMs;
  // Default inclusivo: N dias contando o dia final (não N×24h antes).
  const fromMs = input?.from
    ? new Date(input.from).getTime()
    : toMs - (Math.max(1, defaultDays) - 1) * DAY_MS;
  const safeFrom = Math.min(fromMs, toMs);
  const raw = inclusiveDayCountFromMs(safeFrom, toMs);
  const days = opts?.maxDays ? Math.min(opts.maxDays, raw) : raw;
  return {
    fromIso: new Date(safeFrom).toISOString(),
    toIso: new Date(toMs).toISOString(),
    fromMs: safeFrom,
    toMs,
    days,
  };
}
