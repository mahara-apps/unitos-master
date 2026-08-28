import type { DateRange } from "react-day-picker";

/**
 * Chave de cache de período com precisão de DIA.
 *
 * Causa raiz de "troca de cliente sempre lenta": o período padrão é criado com
 * `new Date()` (precisão de milissegundos). Usar o ISO completo na `queryKey`
 * gerava uma chave nova a cada montagem/troca, então o cache NUNCA era
 * reaproveitado — todo X → Y (e até X → Y → X) pagava round trip completo.
 *
 * Aqui a chave é estável dentro do mesmo dia e o intervalo enviado ao servidor
 * é normalizado para os limites do dia, mantendo chave e payload coerentes.
 */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export function dayRangeKey(range: DateRange | undefined): string {
  const from = range?.from ? dayKey(range.from) : "";
  const to = range?.to ? dayKey(range.to) : "";
  return `${from}|${to}`;
}

/** Intervalo normalizado (início/fim do dia) para o payload da server function. */
export function normalizedRangeIso(
  range: DateRange | undefined,
): { from: string; to: string } | undefined {
  if (!range?.from || !range?.to) return undefined;
  const from = new Date(range.from);
  from.setHours(0, 0, 0, 0);
  const to = new Date(range.to);
  to.setHours(23, 59, 59, 999);
  return { from: from.toISOString(), to: to.toISOString() };
}
