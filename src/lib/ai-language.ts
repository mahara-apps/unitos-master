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
  "Isso vale também para NOMES, RÓTULOS e TÍTULOS que você cria (nome de cohort, título de persona, " +
  "frases de exemplo, nomes de segmentos): são conteúdo e devem estar em português. " +
  "Preserve como estão apenas nomes próprios reais, marcas do cliente, hashtags e termos técnicos consagrados " +
  "(ex.: briefing, engajamento, reels, feed).";

/** Anexa a diretriz pt-BR a um prompt de sistema. */
export function withPtBr(system: string): string {
  return system.includes("IDIOMA:") ? system : `${system}\n\n${PT_BR_DIRECTIVE}`;
}

const EN_MARKERS = [
  "the",
  "and",
  "for",
  "with",
  "that",
  "your",
  "from",
  "our",
  "their",
  "they",
  "you",
  "this",
  "these",
  "who",
  "while",
  "through",
  "seekers",
  "essentials",
  "insights",
  "growth",
];

const PT_MARKERS = [
  "de",
  "da",
  "do",
  "das",
  "dos",
  "que",
  "para",
  "com",
  "uma",
  "não",
  "nos",
  "por",
  "como",
  "mais",
  "sem",
  "seu",
  "sua",
  "conteúdo",
];

/** Coleta recursivamente todos os valores textuais de um payload JSON. */
export function collectTextValues(payload: unknown, out: string[] = []): string[] {
  if (typeof payload === "string") {
    if (payload.trim()) out.push(payload);
    return out;
  }
  if (Array.isArray(payload)) {
    for (const v of payload) collectTextValues(v, out);
    return out;
  }
  if (payload && typeof payload === "object") {
    for (const v of Object.values(payload as Record<string, unknown>)) collectTextValues(v, out);
  }
  return out;
}

/**
 * Heurística conservadora: o conteúdo parece predominantemente em inglês?
 *
 * Usada só para disparar UMA retentativa da etapa antes de persistir. Conta
 * palavras-função de cada idioma; só acusa inglês com evidência clara, para não
 * rejeitar texto pt-BR com termos técnicos em inglês (reels, feed, briefing).
 */
export function looksEnglish(values: string[]): boolean {
  const words = values
    .join(" ")
    .toLowerCase()
    .normalize("NFC")
    .split(/[^a-zà-ÿ]+/)
    .filter(Boolean);
  if (words.length < 12) return false;
  let en = 0;
  let pt = 0;
  for (const w of words) {
    if (EN_MARKERS.includes(w)) en += 1;
    else if (PT_MARKERS.includes(w)) pt += 1;
  }
  return en >= 3 && en > pt * 2;
}

/** Trecho fixo da mensagem de erro de idioma (permite reconhecer a falha). */
export const EN_OUTPUT_MARKER = "retornado em inglês";

/** A falha é "resposta em inglês" (e não outro problema de formato)? */
export function isEnglishOutputError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return msg.includes(EN_OUTPUT_MARKER);
}

/** Lança erro de output inválido quando a etapa voltou em inglês. */
export function assertPtBrPayload(payload: unknown, label: string): void {
  if (looksEnglish(collectTextValues(payload))) {
    throw new Error(
      `ai_invalid_output: ${label} ${EN_OUTPUT_MARKER} — o conteúdo precisa estar em português do Brasil.`,
    );
  }
}

/** Reforço enviado na ÚNICA retentativa quando a resposta voltou em inglês. */
export const PT_BR_RETRY_NOTE =
  "ATENÇÃO: a resposta anterior saiu em inglês, o que é inválido. " +
  "Reescreva TODO o conteúdo em português do Brasil (pt-BR), mantendo o mesmo formato.";

/**
 * Executa a geração e, se o conteúdo vier predominantemente em inglês, refaz
 * UMA vez com o reforço `PT_BR_RETRY_NOTE`. Se a segunda resposta ainda estiver
 * em inglês, lança `ai_invalid_output` — nada em inglês é entregue ou salvo.
 */
export async function runWithPtBrRetry<T>(
  run: (retryNote: string | null) => Promise<T>,
  payloadOf: (result: T) => unknown,
  label: string,
): Promise<T> {
  const first = await run(null);
  if (!looksEnglish(collectTextValues(payloadOf(first)))) return first;
  const second = await run(PT_BR_RETRY_NOTE);
  assertPtBrPayload(payloadOf(second), label);
  return second;
}

/** Acrescenta o reforço de idioma ao prompt quando houver retentativa. */
export function withRetryNote(prompt: string, retryNote: string | null): string {
  return retryNote ? `${prompt}\n\n${retryNote}` : prompt;
}
