import { describe, expect, it } from "vitest";
import {
  BriefingAnalysisSchema,
  effectiveProviderAttempt,
  normalizeBriefingAnalysis,
} from "@/lib/briefing-analysis-schema";

const completeBriefing = {
  description: "Marca de moda circular",
  mission: null,
  positioning: null,
  values: null,
  audience: null,
  pain_points: null,
  demographics: null,
  offer: null,
  differentials: null,
  objections: null,
  journey: null,
  desires: null,
  tone_text: null,
  hashtags: [],
  goals: null,
};

describe("contrato portátil da análise de briefing", () => {
  it("exige todas as propriedades de topo e do briefing", () => {
    const topLevel = BriefingAnalysisSchema.safeParse({});
    expect(topLevel.success).toBe(false);
    if (!topLevel.success) {
      expect(topLevel.error.issues.map((issue) => issue.path[0])).toEqual(
        expect.arrayContaining([
          "executive_summary",
          "material_type",
          "extracted_text",
          "briefing",
          "evidence",
          "speakers",
          "confidence",
        ]),
      );
    }

    const nested = BriefingAnalysisSchema.safeParse({
      executive_summary: null,
      material_type: null,
      extracted_text: null,
      briefing: {},
      evidence: [],
      speakers: [],
      confidence: null,
    });
    expect(nested.success).toBe(false);
    if (!nested.success) {
      const fields = nested.error.issues
        .filter((issue) => issue.path[0] === "briefing")
        .map((issue) => issue.path[1]);
      expect(fields).toEqual(expect.arrayContaining(["description", "mission", "hashtags"]));
    }
  });

  it("normaliza metadados omitidos sem aceitar briefing incompleto", () => {
    const normalized = normalizeBriefingAnalysis({
      executive_summary: "Resumo",
      material_type: "Transcrição de reunião",
      briefing: completeBriefing,
    });
    expect(normalized).toMatchObject({
      extracted_text: null,
      evidence: [],
      speakers: [],
      confidence: null,
    });
    expect(BriefingAnalysisSchema.safeParse(normalized).success).toBe(true);
    expect(normalizeBriefingAnalysis({ executive_summary: "incompleto" })).toBeNull();
  });

  it("registra o provider/model que efetivamente concluiu o fallback", () => {
    expect(
      effectiveProviderAttempt(
        [
          { provider: "gemini", model: "gemini-flash-latest", result: "provider_unavailable" },
          { provider: "groq", model: "openai/gpt-oss-20b", result: "success" },
        ],
        { provider: "gemini", model: "gemini-flash-latest" },
      ),
    ).toEqual({ provider: "groq", model: "openai/gpt-oss-20b" });
  });
});