import { z } from "zod";

export const BriefingFieldsSchema = z.object({
  description: z.string().nullable(),
  mission: z.string().nullable(),
  positioning: z.string().nullable(),
  values: z.string().nullable(),
  audience: z.string().nullable(),
  pain_points: z.string().nullable(),
  demographics: z.string().nullable(),
  offer: z.string().nullable(),
  differentials: z.string().nullable(),
  objections: z.string().nullable(),
  journey: z.string().nullable(),
  desires: z.string().nullable(),
  tone_text: z.string().nullable(),
  hashtags: z.array(z.string()).nullable(),
  goals: z.string().nullable(),
});

export const BriefingEvidenceSchema = z.object({
  field: z.string(),
  excerpt: z.string().nullable(),
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
  evidence: z.string().nullable(),
  needs_review: z.boolean().nullable(),
});

/**
 * Contrato enviado aos providers. Todos os campos declarados são obrigatórios
 * no JSON Schema; ausência semântica usa null/arrays vazios. Isso mantém o
 * response_format portátil entre Gemini e providers OpenAI-compatible.
 */
export const BriefingAnalysisSchema = z.object({
  executive_summary: z.string().nullable(),
  material_type: z.string().nullable(),
  extracted_text: z.string().nullable(),
  briefing: BriefingFieldsSchema,
  evidence: z.array(BriefingEvidenceSchema),
  speakers: z.array(BriefingSpeakerSchema),
  confidence: z.number().min(0).max(1).nullable(),
});

export type BriefingAnalysis = z.infer<typeof BriefingAnalysisSchema>;

const RecoverableBriefingAnalysisSchema = BriefingAnalysisSchema.partial({
  extracted_text: true,
  evidence: true,
  speakers: true,
  confidence: true,
});

/** Normaliza apenas metadados historicamente omitidos; campos centrais seguem obrigatórios. */
export function normalizeBriefingAnalysis(value: unknown): BriefingAnalysis | null {
  const parsed = RecoverableBriefingAnalysisSchema.safeParse(value);
  if (!parsed.success) return null;
  return BriefingAnalysisSchema.parse({
    ...parsed.data,
    extracted_text: parsed.data.extracted_text ?? null,
    evidence: parsed.data.evidence ?? [],
    speakers: parsed.data.speakers ?? [],
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