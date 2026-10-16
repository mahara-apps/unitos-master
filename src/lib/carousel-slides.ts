/**
 * Textos das artes de um Carrossel (puro, compartilhado servidor/UI).
 *
 * Persistência: `posts.script` guarda `[{ cena: 1, fala: <texto> }]` (mesmo
 * formato do roteiro de vídeo), onde o texto segue o formato canônico abaixo.
 * Assim nenhum caminho de salvamento muda e texto livre antigo continua legível.
 *
 *   Arte 1 — Título
 *   Apoio: texto de apoio
 *   Design: nota para o designer
 */

export type CarouselSlide = { title: string; body: string; design_note: string };

export const CAROUSEL_MIN_SLIDES = 3;
export const CAROUSEL_MAX_SLIDES = 10;
const TITLE_MAX = 120;
const BODY_MAX = 400;
const NOTE_MAX = 300;

const clean = (v: unknown, max: number) =>
  String(v ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

/** Descarta artes sem título, preserva ordem e corta em 10. */
export function normalizeSlides(raw: unknown): CarouselSlide[] {
  const arr = Array.isArray(raw) ? raw : [];
  return arr
    .map((s) => {
      const o = (s ?? {}) as Record<string, unknown>;
      return {
        title: clean(o.title, TITLE_MAX),
        body: clean(o.body, BODY_MAX),
        design_note: clean(o.design_note, NOTE_MAX),
      };
    })
    .filter((s) => s.title.length > 0)
    .slice(0, CAROUSEL_MAX_SLIDES);
}

export function formatSlides(slides: CarouselSlide[]): string {
  return slides
    .map((s, i) =>
      [
        `Arte ${i + 1} — ${s.title}`,
        s.body ? `Apoio: ${s.body}` : "",
        s.design_note ? `Design: ${s.design_note}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");
}

const HEADER = /^\s*(?:arte|slide|card|tela)\s*(\d+)\s*[—–\-:.)]*\s*(.*)$/i;

/** Lê o formato canônico; texto que não segue o formato vira lista vazia. */
export function parseSlides(text: string | null | undefined): CarouselSlide[] {
  const slides: CarouselSlide[] = [];
  let cur: CarouselSlide | null = null;
  for (const rawLine of String(text ?? "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const h = line.match(HEADER);
    if (h) {
      cur = { title: (h[2] ?? "").replace(/^t[ií]tulo:\s*/i, "").trim(), body: "", design_note: "" };
      slides.push(cur);
      continue;
    }
    if (!cur) continue;
    const m = line.match(/^(apoio|texto|corpo|design|nota|designer|t[ií]tulo)\s*:\s*(.*)$/i);
    const key = m?.[1]?.toLowerCase() ?? "";
    const val = (m?.[2] ?? line).trim();
    if (key.startsWith("t")  && key !== "texto") cur.title = cur.title || val;
    else if (key.startsWith("design") || key === "nota") cur.design_note = [cur.design_note, val].filter(Boolean).join(" ");
    else if (!cur.title) cur.title = val;
    else cur.body = [cur.body, val].filter(Boolean).join(" ");
  }
  return normalizeSlides(slides);
}

/** Passos de agentes por formato canônico. */
export function needsCarouselSlides(formatKey: string | null | undefined): boolean {
  return formatKey === "carrossel";
}
