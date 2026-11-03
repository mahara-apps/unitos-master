type StatusLike = { id: string; name: string; color: string | null; position: number };

/** Colunas na ordem dos status do workspace; projetos sem status (ou com status removido) vão para "Sem status". */
export function groupProjectsByStatus<P extends { status_id: string | null }>(projects: P[], statuses: StatusLike[]) {
  const ordered = [...statuses].sort((a, b) => a.position - b.position);
  const known = new Set(ordered.map((s) => s.id));
  const cols = ordered.map((s) => ({ key: s.id, name: s.name, color: s.color, projects: projects.filter((p) => p.status_id === s.id) }));
  const orphan = projects.filter((p) => !p.status_id || !known.has(p.status_id));
  cols.push({ key: "none", name: "Sem status", color: null, projects: orphan });
  return cols;
}

/** Coluna de destino do arraste: id do status, null para "Sem status", undefined se soltou fora. */
export function statusIdFromDropTarget(overId: unknown): string | null | undefined {
  if (typeof overId !== "string" || !overId.startsWith("project-status:")) return undefined;
  const key = overId.slice("project-status:".length);
  return key === "none" ? null : key;
}
