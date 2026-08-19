// ⚠️ Server-only: converte anexos de chat_messages em blocos multimodais que
// o AI SDK (via @ai-sdk/openai-compatible) sabe encaminhar ao Gateway.
//
// Suporte:
//   - image/*      → { type: 'image', image: <signedUrl> }
//   - application/pdf, text/*, application/json → { type: 'file', data: bytes, mediaType }
//   - audio/*      → apenas texto informativo (o converter openai-compat só
//                    aceita wav/mp3, e nossas gravações são webm — pulamos).
//   - outros       → apenas texto informativo.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserContent } from "ai";

export interface ChatAttachmentInput {
  path: string;
  name: string;
  mime: string;
  size: number;
  kind: "image" | "audio" | "pdf" | "file";
}

const BUCKET = "chat-attachments";
const MAX_FILE_MB = 20;

async function signedUrl(supabase: SupabaseClient, path: string): Promise<string | null> {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

async function downloadBase64(url: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length > MAX_FILE_MB * 1024 * 1024) return null;
    return buf;
  } catch {
    return null;
  }
}

/**
 * Retorna o array de blocos UserContent para uma mensagem de usuário que
 * contém texto + anexos. Devolve também um "resumo" texto dos anexos que
 * não puderam ser materializados (para o modelo saber que eles existem).
 */
export async function buildMultimodalContent(
  supabase: SupabaseClient,
  text: string,
  attachments: ChatAttachmentInput[],
): Promise<UserContent> {
  const blocks: UserContent = [];
  const skipped: string[] = [];

  if (text.trim()) blocks.push({ type: "text", text });

  for (const att of attachments) {
    const url = await signedUrl(supabase, att.path);
    if (!url) {
      skipped.push(`${att.name} (falha ao gerar URL)`);
      continue;
    }

    if (att.kind === "image" && att.mime.startsWith("image/")) {
      // image aceita URL direta — mais eficiente que base64.
      blocks.push({ type: "image", image: new URL(url), mediaType: att.mime });
      continue;
    }

    if (att.kind === "pdf" || att.mime === "application/pdf") {
      const bytes = await downloadBase64(url);
      if (!bytes) {
        skipped.push(`${att.name} (>20MB ou falha no download)`);
        continue;
      }
      blocks.push({ type: "file", data: bytes, mediaType: "application/pdf", filename: att.name });
      continue;
    }

    if (att.mime.startsWith("text/") || att.mime === "application/json") {
      const bytes = await downloadBase64(url);
      if (bytes) {
        const asText = new TextDecoder().decode(bytes).slice(0, 20_000);
        blocks.push({
          type: "text",
          text: `\n\n--- Anexo: ${att.name} ---\n${asText}\n--- fim ---`,
        });
        continue;
      }
    }

    // audio + demais → apenas menção
    skipped.push(`${att.name} (${att.mime}) — envio como referência textual`);
  }

  if (skipped.length) {
    blocks.push({
      type: "text",
      text: `\n\nAnexos não materializados (o usuário anexou, mas você não recebe o conteúdo binário):\n- ${skipped.join("\n- ")}`,
    });
  }

  if (blocks.length === 0) {
    blocks.push({ type: "text", text: "(mensagem vazia)" });
  }

  return blocks;
}
