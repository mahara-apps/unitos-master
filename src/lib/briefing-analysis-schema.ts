import { z } from "zod";

export const BriefingFieldsSchema = z.object({
  description: z.string().max(700).nullable(),
  mission: z.string().max(700).nullable(),
  positioning: z.string().max(700).nullable(),
  values: z.string().max(700).nullable(),
  audience: z.string().max(700).nullable(),
  pain_points: z.string().max(700).nullable(),
  demographics: z.string().max(700).nullable(),
  offer: z.string().max(700).nullable(),
  differentials: z.string().max(700).nullable(),
  objections: z.string().max(700).nullable(),
  journey: z.string().max(700).nullable(),
  desires: z.string().max(700).nullable(),
  tone_text: z.string().max(700).nullable(),
  hashtags: z.array(z.string().max(80)).max(30).nullable(),
  goals: z.string().max(700).nullable(),
});

export const BriefingEvidenceSchema = z.object({
  field: z.string(),
  excerpt: z.string().max(300).nullable(),
  conflict: z.boolean().nullable(),
  confidence: z.number().min(0).max(1).nullable(),
});

export const BriefingSpeakerSchema = z.object({
  name: z.string().nullable(),
  role: z
    .enum([
      "cliente",
      "gestor",
      "usuario",
      "fornecedor",
      "especialista",
      "interno",
      "indefinido",
    ])
    .nullable(),
  evidence: z.string().max(300).nullable(),
  needs_review: z.boolean().nullable(),
});

/**
 * Contrato enviado aos providers. Todos os campos declarados são obrigatórios
 * no JSON Schema; ausência semântica usa null/arrays vazios. Isso mantém o
 * response_format portátil entre Gemini e providers OpenAI-compatible.
 */
export const BriefingAnalysisSchema = z.object({
  executive_summary: z.string().max(400).nullable(),
  material_type: z.string().max(120).nullable(),
  extracted_text: z.string().max(4_000).nullable(),
  briefing: BriefingFieldsSchema,
  evidence: z.array(BriefingEvidenceSchema).max(20),
  speakers: z.array(BriefingSpeakerSchema).max(20),
  confidence: z.number().min(0).max(1).nullable(),
});

export type BriefingAnalysis = z.infer<typeof BriefingAnalysisSchema>;

const RecoverableBriefingAnalysisSchema = z.object({
  executive_summary: z.string().max(400).nullable(),
  material_type: z.string().max(120).nullable(),
  extracted_text: z.string().max(4_000).nullable().optional(),
  briefing: BriefingFieldsSchema.partial(),
  evidence: z.array(BriefingEvidenceSchema.partial()).max(20).optional(),
  speakers: z.array(BriefingSpeakerSchema.partial()).max(20).optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
});

const EMPTY_BRIEFING: z.infer<typeof BriefingFieldsSchema> = {
  description: null,
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
  hashtags: null,
  goals: null,
};

/** Normaliza apenas metadados historicamente omitidos; campos centrais seguem obrigatórios. */
export function normalizeBriefingAnalysis(value: unknown): BriefingAnalysis | null {
  const parsed = RecoverableBriefingAnalysisSchema.safeParse(value);
  if (!parsed.success) return null;
  return BriefingAnalysisSchema.parse({
    ...parsed.data,
    briefing: { ...EMPTY_BRIEFING, ...parsed.data.briefing },
    extracted_text: parsed.data.extracted_text ?? null,
    evidence: (parsed.data.evidence ?? [])
      .filter((item) => typeof item.field === "string" && item.field.length > 0)
      .map((item) => ({
        field: item.field as string,
        excerpt: item.excerpt ?? null,
        conflict: item.conflict ?? null,
        confidence: item.confidence ?? null,
      })),
    speakers: (parsed.data.speakers ?? []).map((item) => ({
      name: item.name ?? null,
      role: item.role ?? null,
      evidence: item.evidence ?? null,
      needs_review: item.needs_review ?? null,
    })),
    confidence: parsed.data.confidence ?? null,
  });
}

export function effectiveProviderAttempt(
  attempts: Array<{ provider: string; model: string; result: string }>,
  fallback: { provider: string; model: string },
): { provider: string; model: string } {
  const successful = [...attempts].reverse().find((attempt) => attempt.result === "success");
  const latest = successful ?? attempts[attempts.length - 1];
  return latest ? { provider: latest.provider, model: latest.model } : fallback;
}