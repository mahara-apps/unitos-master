export type SingleFieldOutputDisposition =
  | "structured"
  | "recovered_envelope"
  | "plain_text";

export type SingleFieldOutput = {
  value: string;
  disposition: SingleFieldOutputDisposition;
};

const MIN_TEXT_LENGTH = 20;

function stripMarkdownFence(input: string): string {
  const trimmed = input.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return (fenced?.[1] ?? trimmed).trim();
}

function repairJsonStringControls(input: string): string {
  let output = "";
  let inString = false;
  let escaped = false;
  for (const character of input) {
    if (escaped) {
      output += character;
      escaped = false;
      continue;
    }
    if (character === "\\") {
      output += character;
      escaped = true;
      continue;
    }
    if (character === '"') {
      inString = !inString;
      output += character;
      continue;
    }
    if (inString && (character === "\n" || character === "\r" || character === "\t")) {
      output += character === "\n" ? "\\n" : character === "\r" ? "\\r" : "\\t";
      continue;
    }
    output += character;
  }
  return output;
}

function parseJsonObject(input: string): Record<string, unknown> | null {
  for (const candidate of [input, repairJsonStringControls(input)]) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // A recuperação determinística do envelope é tentada depois.
    }
  }
  return null;
}

/**
 * Recupera apenas um envelope completo de campo único. O fechamento usado é
 * sempre a última aspa antes da chave final, portanto aspas internas emitidas
 * sem escape pelo modelo permanecem parte do texto, sem heurística destrutiva.
 */
function recoverMalformedSingleFieldEnvelope(input: string, key: string): string | null {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = input.match(
    new RegExp(`^\\{\\s*"${escapedKey}"\\s*:\\s*"([\\s\\S]*)"\\s*\\}$`),
  );
  const value = match?.[1]?.trim();
  return value && value.length >= MIN_TEXT_LENGTH ? value : null;
}

function looksLikeStructuredEnvelope(input: string): boolean {
  return input.startsWith("{") || input.startsWith("[");
}

/**
 * Interpreta respostas de agentes que possuem um campo textual principal.
 * JSON reconhecível nunca cai no fallback de prosa.
 */
export function parseSingleFieldOutput(
  input: string,
  key: string,
  allowedSiblingKeys: readonly string[] = [],
): SingleFieldOutput | null {
  const cleaned = stripMarkdownFence(input ?? "");
  if (!cleaned) return null;

  const parsed = parseJsonObject(cleaned);
  if (parsed) {
    const allowed = new Set([key, ...allowedSiblingKeys]);
    if (Object.keys(parsed).some((candidate) => !allowed.has(candidate))) return null;
    const value = parsed[key];
    if (typeof value !== "string" || value.trim().length < MIN_TEXT_LENGTH) return null;
    return { value: value.trim(), disposition: "structured" };
  }

  if (looksLikeStructuredEnvelope(cleaned)) {
    const recovered = recoverMalformedSingleFieldEnvelope(cleaned, key);
    return recovered ? { value: recovered, disposition: "recovered_envelope" } : null;
  }

  if (cleaned.length < MIN_TEXT_LENGTH) return null;
  return { value: cleaned, disposition: "plain_text" };
}

/** Compatibilidade de leitura: preserva byte a byte todo valor ambíguo. */
export function normalizeStoredSingleField(input: string, key: string): string {
  const parsed = parseSingleFieldOutput(input, key);
  if (!parsed || parsed.disposition === "plain_text") return input;
  return parsed.value;
}