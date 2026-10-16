import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { findCaptionLeaks, mergeHashtags } from "@/lib/caption-hygiene";

describe("legenda publicada não leva texto interno", () => {
  it("detecta texto das artes do carrossel", () => {
    expect(findCaptionLeaks("Abertura\nArte 1 — Gancho\nApoio: texto")).toContain(
      "texto de arte do carrossel",
    );
  });
  it("detecta briefing e público-alvo", () => {
    expect(findCaptionLeaks("Briefing interno: responder dúvidas\nPúblico-alvo: Sócias").length).toBe(2);
  });
  it("legenda normal passa limpa", () => {
    expect(findCaptionLeaks("Sua clínica perde pacientes? Veja como mudar 👇\n\n#marketing")).toEqual([]);
  });
});

describe("hashtags no agendamento", () => {
  it("não repete hashtag que já está na legenda", () => {
    expect(mergeHashtags("Texto\n\n#Marketing", ["marketing", "#clinica"])).toBe(
      "Texto\n\n#Marketing\n\n#clinica",
    );
  });
  it("sem hashtags extras mantém só a legenda", () => {
    expect(mergeHashtags("Texto #a", ["#A"])).toBe("Texto #a");
  });
});

describe("roteiro com falha não deixa a peça sem legenda", () => {
  const src = readFileSync("src/lib/post-agents.server.ts", "utf8");
  it("falha que não é de configuração vira pendência e segue", () => {
    expect(src).toMatch(/if \(kind !== "config"\) \{\s*\/\/[^\n]*\n\s*degraded\.push\(`roteirista_social:/);
  });
});
