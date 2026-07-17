// ⚠️ Brain Chat Gateway — chamada ao LLM via Lovable AI Gateway.
// Server-only: lê LOVABLE_API_KEY.
import {
  generateText,
  streamText,
  stepCountIs,
  type ModelMessage,
  type StreamTextResult,
  type ToolSet,
} from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createLovableAiGatewayProvider } from "../../ai-gateway.server";
import type { BrainConsolidated } from "./consolidate";
import { buildMultimodalContent, type ChatAttachmentInput } from "./multimodal.server";
import { buildChatTools, type ToolCallLog } from "./tools.server";
import type { BrainContext } from "../core";

const DEFAULT_MODEL = "google/gemini-3.5-flash";

export interface ChatAttachmentMeta {
  name: string;
  kind: string;
  mime: string;
}

function buildInstructions(brain: BrainConsolidated): string {
  return [
    "Você é o assistente conversacional da Unitos — uma plataforma SaaS para agências.",
    "Você é apenas um cliente do Brain: SEMPRE responda com base no conhecimento consolidado a seguir.",
    "Nunca invente números, prazos ou nomes. Se o Brain não tiver a informação, use uma das ferramentas.",
    "Você tem ferramentas para: buscar clientes, buscar conteúdos, listar tarefas em atraso, criar tarefa e consultar o Brain diretamente. Use-as quando útil.",
    "Ao criar uma tarefa, confirme depois brevemente com o usuário o que foi criado.",
    "Responda em português do Brasil, em markdown, direto ao ponto, com bullets quando ajudar.",
    "",
    brain.markdown || "_(O Brain não retornou conhecimento relevante para esta pergunta.)_",
  ].join("\n");
}

async function buildMessages(
  supabase: SupabaseClient,
  history: Array<{ role: string; content: string }>,
  question: string,
  attachments: ChatAttachmentInput[],
): Promise<ModelMessage[]> {
  const past: ModelMessage[] = history
    .filter((m) => m.role === "user" || m.role === "assistant")
    .filter((m) => m.content.trim().length > 0)
    .slice(0, -1) // remove a última user msg — vamos reconstruí-la multimodal
    .map((m) => ({ role: m.role as "assistant" | "user", content: m.content }));

  if (attachments.length > 0) {
    const content = await buildMultimodalContent(supabase, question, attachments);
    past.push({ role: "user", content });
  } else {
    past.push({ role: "user", content: question || "(sem texto)" });
  }

  return past;
}

// ---------- Modo síncrono (fallback / diagnóstico) ----------
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

  const instructions = buildInstructions(args.brain);
  const messages: ModelMessage[] = args.history
    .filter((m) => m.role === "user" || m.role === "assistant")
    .filter((m) => m.content.trim().length > 0)
    .map((m) => ({
      role: m.role as "assistant" | "user",
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
    const result = await generateText({ model, instructions, messages, temperature: 0.4 });
    return { text: result.text.trim() || "_(sem resposta)_", model: DEFAULT_MODEL };
  } catch (err) {
    console.error("[brain.chat.callLlm] LLM error", err);
    const msg = err instanceof Error ? err.message : String(err);
    return {
      text: `Não consegui consultar o modelo agora.${args.brain.markdown ? " Segue o que o Brain já sabe sobre isso:\n\n" + args.brain.markdown : ""}\n\n_Detalhe técnico: ${msg}_`,
      model: DEFAULT_MODEL,
    };
  }
}

// ---------- Modo streaming com tools + multimodal (caminho principal) ----------
export interface StreamAnswerArgs {
  supabase: SupabaseClient;
  brainCtx: BrainContext;
  question: string;
  attachments: ChatAttachmentInput[];
  history: Array<{ role: string; content: string }>;
  brain: BrainConsolidated;
  toolCallLog: ToolCallLog[];
}

export async function streamAnswer(args: StreamAnswerArgs): Promise<{
  result: StreamTextResult<ToolSet, never>;
  model: string;
}> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY ausente");
  const gateway = createLovableAiGatewayProvider(key);
  const model = gateway(DEFAULT_MODEL);

  const messages = await buildMessages(args.supabase, args.history, args.question, args.attachments);
  const tools = buildChatTools(args.supabase, args.brainCtx, args.toolCallLog);

  const result = streamText({
    model,
    instructions: buildInstructions(args.brain),
    messages,
    tools,
    stopWhen: stepCountIs(50),
    temperature: 0.4,
  });

  return { result, model: DEFAULT_MODEL };
}
