/**
 * Limites compartilhados da análise de briefing.
 *
 * O fallback Groq/GPT-OSS usa parte do orçamento para reasoning por padrão.
 * Desativá-lo preserva a janela de saída para o JSON obrigatório.
 */
export const BRIEFING_MAX_OUTPUT_TOKENS = 8_192;

export const BRIEFING_PROVIDER_OPTIONS = {
  groq: {
    reasoningEffort: "none" as const,
    structuredOutputs: true,
    strictJsonSchema: true,
  },
};

export const BRIEFING_OUTPUT_INSTRUCTIONS = `Regras de tamanho da resposta:
- resumo executivo: no máximo 400 caracteres;
- cada campo textual do briefing: no máximo 700 caracteres;
- no máximo uma evidência curta por campo proposto, com trecho de até 300 caracteres;
- no máximo 20 evidências e 20 participantes;
- seja conciso e não repita informações entre campos.`;