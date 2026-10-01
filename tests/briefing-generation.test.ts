import { describe, expect, it } from "vitest";
import {
  BriefingAnalysisSchema,
  BriefingTransportSchema,
  normalizeBriefingAnalysis,
} from "@/lib/briefing-analysis-schema";
import { briefingProviderOptions } from "@/lib/briefing-generation.server";

describe("geração provider-aware de briefing", () => {
  it("nunca envia reasoningEffort none ao GPT-OSS da Groq", () => {
    expect(briefingProviderOptions("groq")).toEqual({
      groq: {
        reasoningEffort: "low",
        structuredOutputs: true,
        strictJsonSchema: true,
      },
    });
    expect(JSON.stringify(briefingProviderOptions("groq"))).not.toContain('"none"');
    expect(briefingProviderOptions("gemini")).toEqual({});
  });

  it("usa contrato portátil e converte sentinelas para o formato canônico", () => {
    const payload = {
      executive_summary: "",
      material_type: "documento",
      extracted_text: "",
      briefing: {
        description: "", mission: "", positioning: "", values: "", audience: "",
        pain_points: "", demographics: "", offer: "", differentials: "", objections: "",
        journey: "", desires: "", tone_text: "", hashtags: [], goals: "",
      },
      evidence: [],
      speakers: [],
      confidence: -1,
    };
    expect(BriefingTransportSchema.safeParse(payload).success).toBe(true);
    const normalized = normalizeBriefingAnalysis(payload);
    expect(normalized?.executive_summary).toBeNull();
    expect(normalized?.briefing.description).toBeNull();
    expect(normalized?.briefing.hashtags).toBeNull();
    expect(normalized?.confidence).toBeNull();
  });

  it("mantém o schema wire sem limites frágeis e aplica limites depois", () => {
    const long = "x".repeat(900);
    expect(BriefingAnalysisSchema.shape.briefing.safeParse({
      description: long,
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
    }).success).toBe(true);

    const normalized = normalizeBriefingAnalysis({
      executive_summary: long,
      material_type: "texto",
      briefing: { description: long },
    });
    expect(normalized?.executive_summary).toHaveLength(400);
    expect(normalized?.briefing.description).toHaveLength(700);
  });
});