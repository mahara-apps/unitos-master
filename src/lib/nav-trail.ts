/**
 * Trilha de navegação da sessão: lembra de onde a pessoa veio (endereço completo,
 * com filtros e abas) para o botão "Voltar para …" levar exatamente para lá.
 */
export type TrailEntry = { href: string; path: string; title: string; scrollY?: number };

export const TRAIL_MAX = 30;

/** Registra uma visita. Voltar para uma página já na trilha corta tudo depois dela. */
export function visitTrail(trail: TrailEntry[], entry: TrailEntry): TrailEntry[] {
  const last = trail[trail.length - 1];
  if (last && last.href === entry.href) {
    return [...trail.slice(0, -1), { ...last, title: entry.title || last.title }];
  }
  // Só filtros/aba mudaram na mesma página: atualiza o endereço sem empilhar.
  if (last && last.path === entry.path) {
    return [...trail.slice(0, -1), entry];
  }
  const idx = trail.findIndex((e) => e.path === entry.path);
  if (idx >= 0) return [...trail.slice(0, idx), entry];
  return [...trail, entry].slice(-TRAIL_MAX);
}

/** Atualiza o título da página atual (o título chega depois da navegação). */
export function retitleTrail(trail: TrailEntry[], href: string, title: string): TrailEntry[] {
  const last = trail[trail.length - 1];
  if (!last || last.href !== href || !title || last.title === title) return trail;
  return [...trail.slice(0, -1), { ...last, title }];
}

/** Página anterior para o botão Voltar, ou null quando a pessoa entrou direto. */
export function previousEntry(trail: TrailEntry[]): TrailEntry | null {
  return trail.length >= 2 ? trail[trail.length - 2] : null;
}

/** Guarda a rolagem da página atual para o Voltar devolver a pessoa ao mesmo ponto. */
export function setTrailScroll(trail: TrailEntry[], href: string, scrollY: number): TrailEntry[] {
  const last = trail[trail.length - 1];
  if (!last || last.href !== href || last.scrollY === scrollY) return trail;
  return [...trail.slice(0, -1), { ...last, scrollY: Math.max(0, Math.round(scrollY)) }];
}
