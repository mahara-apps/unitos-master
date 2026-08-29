/**
 * Extração de texto no NAVEGADOR para os formatos que a chamada multimodal não
 * lê (docx, planilhas, texto puro, legendas). O resultado é enviado ao mesmo
 * pipeline de importação como material de texto — nenhuma regra nova de
 * negócio, apenas conversão de formato antes do envio.
 */

const TEXT_EXTENSIONS = [".txt", ".md", ".csv", ".json", ".vtt", ".srt"];

function extensionOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i < 0 ? "" : name.slice(i).toLowerCase();
}

export type ExtractResult = { text: string; chars: number };

export async function extractTextFromFile(file: File): Promise<ExtractResult> {
  const ext = extensionOf(file.name);

  if (TEXT_EXTENSIONS.includes(ext)) {
    const text = await file.text();
    return finish(text, file.name);
  }

  if (ext === ".docx") {
    const mammoth = (await import(
      /* @vite-ignore */ "mammoth/mammoth.browser.js"
    )) as unknown as {
      extractRawText: (o: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }>;
      default?: { extractRawText: (o: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }> };
    };
    const api = mammoth.default ?? mammoth;
    const buffer = await file.arrayBuffer();
    const res = await api.extractRawText({ arrayBuffer: buffer });

    return finish(res.value ?? "", file.name);
  }

  if (ext === ".xlsx" || ext === ".xls") {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const parts: string[] = [];
    for (const sheetName of wb.SheetNames) {
      const sheet = wb.Sheets[sheetName];
      if (!sheet) continue;
      const csv = XLSX.utils.sheet_to_csv(sheet);
      if (csv.trim()) parts.push(`## Planilha: ${sheetName}\n${csv.trim()}`);
    }
    return finish(parts.join("\n\n"), file.name);
  }

  throw new Error(`Não sei extrair texto de ${ext || "arquivo sem extensão"}.`);
}

/** Limite defensivo por arquivo: mantém o prompt dentro de um tamanho sadio. */
export const MAX_EXTRACTED_CHARS = 60_000;

function finish(raw: string, filename: string): ExtractResult {
  const text = raw.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) throw new Error(`${filename} não contém texto legível.`);
  const clipped = text.length > MAX_EXTRACTED_CHARS ? text.slice(0, MAX_EXTRACTED_CHARS) : text;
  return { text: clipped, chars: clipped.length };
}

/** Junta material de texto (colado + extraído) num único bloco rotulado. */
export function composeTextMaterial(
  blocks: Array<{ label: string; text: string }>,
): string {
  return blocks
    .filter((b) => b.text.trim().length > 0)
    .map((b) => `### ${b.label}\n${b.text.trim()}`)
    .join("\n\n---\n\n");
}
