/**
 * Regra única de tamanho de resposta para gerações de texto estruturado.
 *
 * - limite de saída explícito (sem ele cada provedor usa um padrão próprio,
 *   às vezes baixo, e corta o JSON no meio);
 * - detecção de resposta cortada por tamanho (`finishReason === "length"`),
 *   que vira a falha `output_truncated` (mensagem pt-BR, não aciona fallback).
 */

export const TEXT_MAX_OUTPUT_TOKENS = {
  /** Legenda/roteiro de uma peça. */
  post: 4_096,
  /** Etapas da Estratégia IA (voz, personas, cohorts, SWOT). */
  strategy: 8_192,
  /** Plano de mídia com IA. */
  mediaPlan: 4_096,
  /** Resumos curtos do painel. */
  summary: 2_048,
} as const;

/** Marcador reconhecido por `classifyAiError` como `output_truncated`. */
export const TRUNCATED_MARKER = 'finish_reason":"length';

export function isTruncatedFinish(finishReason: unknown): boolean {
  return finishReason === "length";
}

export function truncatedError(): Error {
  return new Error(
    `ai_output_truncated: a resposta da IA foi interrompida por tamanho (${TRUNCATED_MARKER})`,
  );
}

/** Lança `output_truncated` quando o provedor parou por limite de tamanho. */
export function assertNotTruncated(finishReason: unknown): void {
  if (isTruncatedFinish(finishReason)) throw truncatedError();
}
