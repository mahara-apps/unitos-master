/** Move `id` para a posição `target` (1-based, limitada a 1..N). Retorna nova ordem. */
export function moveToPosition(ids: string[], id: string, target: number): string[] {
  const from = ids.indexOf(id);
  if (from < 0 || !Number.isFinite(target)) return ids;
  const to = Math.min(Math.max(Math.round(target), 1), ids.length) - 1;
  if (to === from) return ids;
  const next = ids.filter((x) => x !== id);
  next.splice(to, 0, id);
  return next;
}
