import { describe, expect, it } from "vitest";
import { normalizeReelsCover, withReelsCover } from "@/lib/reels-cover";
import { findCaptionLeaks } from "@/lib/caption-hygiene";

describe("capa do Reels", () => {
  it("frase da capa tem no máximo 8 palavras", () => {
    const c = normalizeReelsCover({ has_cover: true, text: "um dois três quatro cinco seis sete oito nove dez" });
    expect(c?.text.split(" ")).toHaveLength(8);
  });
  it("sem capa fica registrado como Não", () => {
    expect(withReelsCover("Cena 1", normalizeReelsCover({ has_cover: false }))).toMatch(/^CAPA\nTem capa: Não\n\nROTEIRO\nCena 1$/);
  });
  it("capa completa vem antes do roteiro", () => {
    const out = withReelsCover("Cena 1: abre", normalizeReelsCover({ has_cover: true, text: "3 erros no Reels", designer_note: "fundo claro" }));
    expect(out).toBe("CAPA\nTem capa: Sim\nFrase da capa: 3 erros no Reels\nNota para o designer: fundo claro\n\nROTEIRO\nCena 1: abre");
  });
  it("sem resposta de capa, o roteiro fica como está", () => {
    expect(withReelsCover("Cena 1", normalizeReelsCover(undefined))).toBe("Cena 1");
  });
  it("texto da capa na legenda é bloqueado", () => {
    expect(findCaptionLeaks("Olá!\nFrase da capa: 3 erros")).toContain("capa do Reels");
  });
});
