// ⚠️ Brain Chat Gateway — chamada ao LLM via Lovable AI Gateway.
// Server-only: lê LOVABLE_API_KEY.
import { generateText, type ModelMessage } from "ai";
import { createLovableAiGatewayProvider } from "../../ai-gateway.server";
import type { BrainConsolidated } from "./consolidate";

const DEFAULT_MODEL = "google/gemini-2.5-flash";

export interface ChatAttachmentMeta {
  name: string;
  kind: string;
  mime: string;
}

export async function callLlm(args: {
  question: string;
  history: Array<{ role: string; content: string }>;
  brain: BrainConsolidated;
  attachments: ChatAttachmentMeta[];
}): Promise<{ text: string; model: string }> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY ausente");
  const gateway = createLovableAiGatewayProvider(key);
  const model = gateway(DEFAULT_MODEL);

  const system = [
    "Você é o assistente conversacional da Unitos — uma plataforma SaaS para agências.",
    "Você é apenas um cliente do Brain: SEMPRE responda com base no conhecimento consolidado a seguir.",
    "Nunca invente números, prazos ou nomes. Se o Brain não tiver a informação, diga isso com transparência.",
    "Responda em português do Brasil, em markdown, direto ao ponto, com bullets quando ajudar.",
    "",
    args.brain.markdown || "_(O Brain não retornou conhecimento relevante para esta pergunta.)_",
  ].join("\n");

  const messages: ModelMessage[] = args.history.map((m) => ({
    role: (m.role === "assistant" ? "assistant" : "user") as "assistant" | "user",
    content: m.content,
  }));

  if (args.attachments.length) {
    const list = args.attachments.map((a) => `- ${a.name} (${a.kind}, ${a.mime})`).join("\n");
    messages.push({
      role: "user",
      content: `Anexos enviados pelo usuário:\n${list}\n\nPergunta: ${args.question || "(sem texto)"}`,
    });
  }

  try {
    const result = await generateText({ model, system, messages, temperature: 0.4 });
    return { text: result.text.trim() || "_(sem resposta)_", model: DEFAULT_MODEL };
  } catch (err) {
    console.error("[brain.chat.callLlm] LLM error", err);
    const msg = err instanceof Error ? err.message : String(err);
    return {
      text: `Não consegui consultar o modelo agora. ${args.brain.markdown ? "Segue o que o Brain já sabe sobre isso:\n\n" + args.brain.markdown : ""}\n\n_Erro: ${msg}_`,
      model: DEFAULT_MODEL,
    };
  }
}