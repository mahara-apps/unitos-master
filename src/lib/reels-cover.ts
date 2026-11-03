/**
 * Bloco "Capa" do Reels: se tem capa, a frase da capa e a nota para o designer.
 * Só texto (nunca gera imagem) e nunca vai para a legenda publicada.
 */
export type ReelsCover = { hasCover: boolean; text: string; designerNote: string };

export const COVER_MAX_WORDS = 8;

function str(v: unknown): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
}

/** Aceita a resposta da IA em formatos variados; null quando não veio nada aproveitável. */
export function normalizeReelsCover(raw: unknown): ReelsCover | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const flag = o.has_cover ?? o.hasCover;
  const text = str(o.text ?? o.frase).split(" ").filter(Boolean).slice(0, COVER_MAX_WORDS).join(" ");
  const designerNote = str(o.designer_note ?? o.designerNote ?? o.nota);
  const hasCover = flag === false || flag === "false" || flag === "não" ? false : flag === true || flag === "true" || !!text;
  if (!hasCover && !designerNote) return { hasCover: false, text: "", designerNote: "" };
  if (hasCover && !text && !designerNote) return null;
  return { hasCover, text: hasCover ? text : "", designerNote };
}

/** Texto da capa no topo do roteiro, editável na aba Roteiro. */
export function formatReelsCover(cover: ReelsCover): string {
  if (!cover.hasCover) return "CAPA\nTem capa: Não";
  const lines = ["CAPA", "Tem capa: Sim"];
  if (cover.text) lines.push(`Frase da capa: ${cover.text}`);
  if (cover.designerNote) lines.push(`Nota para o designer: ${cover.designerNote}`);
  return lines.join("\n");
}

export function withReelsCover(script: string, cover: ReelsCover | null): string {
  const body = script.trim();
  if (!cover || /^\s*CAPA\s*\n\s*Tem capa:/i.test(body)) return body;
  return `${formatReelsCover(cover)}\n\nROTEIRO\n${body}`;
}
