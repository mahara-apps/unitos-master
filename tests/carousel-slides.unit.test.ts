import { describe, expect, it } from "vitest";
import { formatSlides, needsCarouselSlides, normalizeSlides, parseSlides } from "@/lib/carousel-slides";

describe("textos das artes do carrossel", () => {
  it("parse lê o formato canônico preservando ordem", () => {
    const s = parseSlides("Arte 1 — Gancho\nApoio: a\nDesign: d\n\nArte 2 — Fim\nApoio: b");
    expect(s.map((x) => x.title)).toEqual(["Gancho", "Fim"]);
    expect(s[0]).toEqual({ title: "Gancho", body: "a", design_note: "d" });
  });
  it("round-trip formato → parse", () => {
    const slides = [{ title: "A", body: "x", design_note: "" }, { title: "B", body: "", design_note: "n" }];
    expect(parseSlides(formatSlides(slides))).toEqual(slides);
  });
  it("descarta arte sem título e limita a 10", () => {
    expect(normalizeSlides([{ title: "" }, { title: "ok" }])).toHaveLength(1);
    expect(normalizeSlides(Array.from({ length: 12 }, (_, i) => ({ title: `t${i}` })))).toHaveLength(10);
  });
  it("texto livre antigo não vira artes", () => {
    expect(parseSlides("um roteiro qualquer sem marcação")).toEqual([]);
  });
  it("só carrossel ganha o passo de artes", () => {
    expect(needsCarouselSlides("carrossel")).toBe(true);
    expect(needsCarouselSlides("feed")).toBe(false);
    expect(needsCarouselSlides("reels")).toBe(false);
  });
});
