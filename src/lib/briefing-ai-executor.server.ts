import { generateText, NoObjectGeneratedError, NoOutputGeneratedError, Output } from "ai";
import type { ModelMessage } from "ai";
import { classifyAiError, unwrapAiError } from "./ai-failures.server";
import {
  describeProviderAttempts,
  getBrandAiCandidatesAdmin,
  type AiUsageContext,
  type ProviderAttempt,
} from "./ai-provider.server";
import {
  BriefingAnalysisSchema,
  normalizeBriefingAnalysis,
  type BriefingAnalysis,
} from "./briefing-analysis-schema";
import {
  BRIEFING_MAX_OUTPUT_TOKENS,
  briefingProviderOptions,
} from "./briefing-generation.server";
import { salvageStructuredOutput } from "./ai-output-salvage";

export type BriefingGenerationResult = {
  analysis: BriefingAnalysis;
  provider: string;
  model: string;
  attempts: ProviderAttempt[];
};

export async function generateBriefingAnalysis(input: {
  brandId: string;
  usage: AiUsageContext;
  system: string;
  messages: ModelMessage[];
}): Promise<BriefingGenerationResult> {
  const candidates = await getBrandAiCandidatesAdmin(input.brandId, "operational", input.usage);
  const attempts: ProviderAttempt[] = [];
  let lastError: unknown = new Error("ai_provider_not_configured");

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    if (!candidate) continue;
    try {
      const { output } = await generateText({
        model: candidate.model,
        system: input.system,
        maxOutputTokens: BRIEFING_MAX_OUTPUT_TOKENS,
        providerOptions: briefingProviderOptions(candidate.provider),
        output: Output.object({ schema: BriefingAnalysisSchema }),
        messages: input.messages,
      });
      attempts.push(...candidate.providerAttempts);
      const analysis = normalizeBriefingAnalysis(output);
      if (!analysis) throw new Error("ai_invalid_output: briefing analysis did not validate");
      return { analysis, provider: candidate.provider, model: candidate.modelId, attempts };
    } catch (error) {
      lastError = error;
      attempts.push(...candidate.providerAttempts);
      if (!candidate.providerAttempts.length) {
        const failure = classifyAiError(error);
        attempts.push({
          provider: candidate.provider,
          model: candidate.modelId,
          attempt: attempts.length + 1,
          result: failure.kind,
          detail: unwrapAiError(error).text.replace(/\s+/g, " ").slice(0, 500),
        });
      }

      const salvaged = salvageStructuredOutput(
        error,
        BriefingAnalysisSchema,
        normalizeBriefingAnalysis,
      );
      if (salvaged) {
        return { analysis: salvaged, provider: candidate.provider, model: candidate.modelId, attempts };
      }

      const { kind, retryable } = classifyAiError(error);
      const canFallback =
        index + 1 < candidates.length &&
        retryable &&
        (kind === "provider_unavailable" ||
          kind === "provider_rate_limit" ||
          kind === "provider_quota");
      if (!canFallback) {
        if (
          NoOutputGeneratedError.isInstance(error) ||
          NoObjectGeneratedError.isInstance(error)
        ) {
          throw new Error(
            `ai_no_structured_output: a IA não produziu uma análise estruturada. Provider attempts: ${describeProviderAttempts(attempts)}`,
            { cause: error },
          );
        }
        throw error;
      }
    }
  }

  throw lastError;
}