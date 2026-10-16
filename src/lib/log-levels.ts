/** Nível exibido na Auditoria para um evento de Ações (activity_events). */
export function activityLevel(verb: unknown, payload: unknown): "error" | "info" {
  const name = String(verb ?? "").toLowerCase();
  if (name.endsWith("_failed")) return "error";
  if (payload && typeof payload === "object" && (payload as { ok?: unknown }).ok === false)
    return "error";
  return "info";
}

/**
 * Próximo cursor da paginação combinada. Cada fonte busca `limit` linhas mais
 * antigas que o cursor; só é seguro avançar até o ponto em que TODAS as fontes
 * que encheram o limite já foram lidas por completo.
 */
export function nextLogCursor(
  pageTimestamps: string[],
  limit: number,
  fullSourceOldest: string[],
): string | null {
  if (pageTimestamps.length === limit) return pageTimestamps[pageTimestamps.length - 1] ?? null;
  if (!fullSourceOldest.length) return null;
  return [...fullSourceOldest].sort((a, b) => b.localeCompare(a))[0] ?? null;
}
