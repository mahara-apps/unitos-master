/**
 * Diretriz de idioma obrigatória para TODO prompt de geração de conteúdo.
 *
 * Motivo: prompts que pedem chaves de schema em inglês, sem dizer o idioma do
 * conteúdo, fazem o modelo responder valores em inglês (ex. voice card com
 * "Refined", "Warm" e frases em inglês). O idioma do conteúdo é sempre pt-BR;
 * apenas os NOMES dos campos permanecem em inglês por contrato do schema.
 *
 * O teste tests/ai-language.test.ts garante que os prompts de geração incluam
 * esta diretriz, para que o problema não volte em prompts novos.
 */
export const PT_BR_DIRECTIVE =
  "IDIOMA: escreva TODO o conteúdo em português do Brasil (pt-BR). " +
  "Os NOMES dos campos/chaves do JSON permanecem exatamente como especificados (inclusive em inglês), " +
  "mas nenhum valor textual pode sair em outro idioma. " +
  "Preserve como estão nomes próprios, marcas, hashtags e termos técnicos consagrados " +
  "(ex.: briefing, engajamento, reels, feed).";

/** Anexa a diretriz pt-BR a um prompt de sistema. */
export function withPtBr(system: string): string {
  return system.includes("IDIOMA:") ? system : `${system}\n\n${PT_BR_DIRECTIVE}`;
}
