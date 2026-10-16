/**
 * Higiene da legenda publicada: a legenda é o ÚNICO texto que vai para a rede.
 * Briefing, roteiro, textos das artes e direção visual nunca podem vazar nela.
 * Módulo puro (sem I/O), usado pelos agentes e pelo agendamento.
 */

const LEAK_PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: "texto de arte do carrossel", re: /(^|\n)\s*arte\s+\d+\s*[—–-]/i },
  { label: "texto de apoio da arte", re: /(^|\n)\s*apoio\s*:/i },
  { label: "nota para o designer", re: /(^|\n)\s*design\s*:/i },
  { label: "briefing", re: /briefing\s+(interno|do\s+cliente|cliente)\s*:/i },
  { label: "público-alvo do briefing", re: /(^|\n)\s*p[úu]blico[-\s]alvo\s*:/i },
  { label: "direção visual", re: /(^|\n)\s*dire[çc][ãa]o\s+visual\s*:/i },
  { label: "roteiro", re: /(^|\n)\s*(roteiro\s*:|cena\s+\d+\s*[:—–-])/i },
];

/** Lista o que, na legenda, parece texto interno (vazio = legenda limpa). */
export function findCaptionLeaks(caption: string | null | undefined): string[] {
  const text = caption ?? "";
  if (!text.trim()) return [];
  return LEAK_PATTERNS.filter((p) => p.re.test(text)).map((p) => p.label);
}

const HASHTAG_RE = /#[\p{L}\p{N}_]+/gu;

/** Junta legenda + hashtags da peça sem repetir as que a legenda já tem. */
export function mergeHashtags(caption: string | null | undefined, tags: string[]): string {
  const base = (caption ?? "").trim();
  const present = new Set((base.match(HASHTAG_RE) ?? []).map((t) => t.toLowerCase()));
  const extra: string[] = [];
  for (const raw of tags) {
    const t = raw.trim();
    if (!t) continue;
    const tag = t.startsWith("#") ? t : `#${t}`;
    const key = tag.toLowerCase();
    if (present.has(key)) continue;
    present.add(key);
    extra.push(tag);
  }
  return [base, extra.join(" ")].filter(Boolean).join("\n\n");
}
