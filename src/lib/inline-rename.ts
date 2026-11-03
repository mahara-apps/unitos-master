/** Regra do renomear: aparar espaços, não salvar vazio nem nome igual, respeitar limite. */
export function normalizeRename(draft: string, current: string, maxLength: number): string | null {
  const next = draft.trim().slice(0, maxLength);
  if (!next || next === current.trim()) return null;
  return next;
}
