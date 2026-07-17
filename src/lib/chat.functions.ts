import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";
import { generateText, type ModelMessage } from "ai";
import { embedText } from "./brain-embed.server";

// ============ types ============
export type ChatAttachment = {
  path: string; // storage path inside chat-attachments bucket
  name: string;
  mime: string;
  size: number;
  kind: "image" | "audio" | "pdf" | "file";
};

export type ChatMessageRow = {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  attachments: ChatAttachment[];
  brain_context: BrainContextSummary | null;
  used_llm: boolean;
  model: string | null;
  created_at: string;
};

export type ChatConversationRow = {
  id: string;
  user_id: string;
  brand_id: string | null;
  client_id: string | null;
  title: string;
  last_message_at: string;
  created_at: string;
};

type BrainContextSummary = {
  memories: Array<{ summary: string; similarity: number; event_type: string }>;
  insights: Array<{ description: string; type: string; confidence: number | null }>;
  stats: Record<string, number>;
  used_llm: boolean;
  model?: string;
};

const DEFAULT_MODEL = "google/gemini-3.5-flash";
const HISTORY_LIMIT = 12;

// ============ list conversations ============
export const listChatConversationsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ChatConversationRow[]> => {
    const { data, error } = await context.supabase
      .from("chat_conversations")
      .select("id, user_id, brand_id, client_id, title, last_message_at, created_at")
      .order("last_message_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return (data ?? []) as ChatConversationRow[];
  });

// ============ create conversation ============
const CreateInput = z.object({
  title: z.string().max(200).optional(),
  brandId: z.string().uuid().nullable().optional(),
  clientId: z.string().uuid().nullable().optional(),
});
export const createChatConversationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => CreateInput.parse(i))
  .handler(async ({ data, context }): Promise<ChatConversationRow> => {
    const { data: row, error } = await context.supabase
      .from("chat_conversations")
      .insert({
        user_id: context.userId,
        title: data.title?.trim() || "Nova conversa",
        brand_id: data.brandId ?? null,
        client_id: data.clientId ?? null,
      })
      .select("id, user_id, brand_id, client_id, title, last_message_at, created_at")
      .single();
    if (error || !row) throw new Error(error?.message ?? "insert failed");
    return row as ChatConversationRow;
  });

// ============ rename / delete ============
export const renameChatConversationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid(), title: z.string().min(1).max(200) }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("chat_conversations")
      .update({ title: data.title })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteChatConversationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("chat_conversations").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ list messages ============
export const listChatMessagesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ conversationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<ChatMessageRow[]> => {
    const { data: rows, error } = await context.supabase
      .from("chat_messages")
      .select("id, conversation_id, role, content, attachments, brain_context, used_llm, model, created_at")
      .eq("conversation_id", data.conversationId)
      .order("created_at", { ascending: true })
      .limit(500);
    if (error) throw new Error(error.message);
    return (rows ?? []) as ChatMessageRow[];
  });

// ============ send message (Brain-first orchestrator) ============
const AttachmentSchema = z.object({
  path: z.string(),
  name: z.string(),
  mime: z.string(),
  size: z.number(),
  kind: z.enum(["image", "audio", "pdf", "file"]),
});
const SendInput = z.object({
  conversationId: z.string().uuid(),
  content: z.string().max(8000),
  attachments: z.array(AttachmentSchema).max(10).default([]),
});

export const sendChatMessageFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => SendInput.parse(i))
  .handler(
    async ({ data, context }): Promise<{ user: ChatMessageRow; assistant: ChatMessageRow }> => {
      const question = data.content.trim();
      const hasAttachments = data.attachments.length > 0;
      if (!question && !hasAttachments) throw new Error("Mensagem vazia");

      // 1) Load conversation (scope + auto-title)
      const { data: convo, error: convoErr } = await context.supabase
        .from("chat_conversations")
        .select("id, brand_id, client_id, title")
        .eq("id", data.conversationId)
        .maybeSingle();
      if (convoErr || !convo) throw new Error("Conversa não encontrada");

      // 2) Persist user message immediately
      const { data: userRow, error: userErr } = await context.supabase
        .from("chat_messages")
        .insert({
          conversation_id: data.conversationId,
          user_id: context.userId,
          role: "user",
          content: question,
          attachments: data.attachments,
        })
        .select("id, conversation_id, role, content, attachments, brain_context, used_llm, model, created_at")
        .single();
      if (userErr || !userRow) throw new Error(userErr?.message ?? "insert user msg failed");

      // Auto-title on first message
      if (convo.title === "Nova conversa" && question) {
        const short = question.slice(0, 60);
        await context.supabase.from("chat_conversations").update({ title: short }).eq("id", convo.id);
      }

      // 3) BRAIN FIRST — retrieve consolidated context (never raw tables)
      const brainCtx = await consolidateBrainContext({
        supabase: context.supabase,
        brandId: convo.brand_id,
        clientId: convo.client_id,
        query: question || data.attachments.map((a) => a.name).join(", "),
      });

      // 4) Recent history (last N messages)
      const { data: history } = await context.supabase
        .from("chat_messages")
        .select("role, content")
        .eq("conversation_id", data.conversationId)
        .order("created_at", { ascending: false })
        .limit(HISTORY_LIMIT);
      const orderedHistory = (history ?? []).reverse();

      // 5) Try to answer WITHOUT LLM when there is a strong direct hit
      const directAnswer = tryDirectAnswerFromBrain(question, brainCtx);

      let answer: string;
      let usedLlm = false;
      let model: string | null = null;

      if (directAnswer && !hasAttachments) {
        answer = directAnswer;
      } else {
        const llm = await callLlmWithBrainContext({
          question,
          history: orderedHistory as Array<{ role: string; content: string }>,
          brain: brainCtx,
          attachments: data.attachments,
        });
        answer = llm.text;
        usedLlm = true;
        model = llm.model;
      }

      // 6) Persist assistant message with brain context summary
      const brainSummary: BrainContextSummary = {
        memories: brainCtx.memories.slice(0, 5).map((m) => ({
          summary: m.content_summary,
          similarity: m.similarity,
          event_type: m.event_type,
        })),
        insights: brainCtx.insights.slice(0, 5).map((i) => ({
          description: i.description,
          type: i.insight_type,
          confidence: i.confidence,
        })),
        stats: brainCtx.stats,
        used_llm: usedLlm,
        model: model ?? undefined,
      };

      const { data: asstRow, error: asstErr } = await context.supabase
        .from("chat_messages")
        .insert({
          conversation_id: data.conversationId,
          user_id: context.userId,
          role: "assistant",
          content: answer,
          attachments: [],
          brain_context: brainSummary,
          used_llm: usedLlm,
          model,
        })
        .select("id, conversation_id, role, content, attachments, brain_context, used_llm, model, created_at")
        .single();
      if (asstErr || !asstRow) throw new Error(asstErr?.message ?? "insert assistant failed");

      // 7) Feedback loop → Brain (best-effort event)
      try {
        await context.supabase.from("brain_events").insert({
          brand_id: convo.brand_id,
          client_id: convo.client_id,
          source_module: "chat",
          event_type: "chat.turn",
          actor_id: context.userId,
          payload: {
            conversation_id: convo.id,
            question: question.slice(0, 400),
            used_llm: usedLlm,
            memories_used: brainSummary.memories.length,
            insights_used: brainSummary.insights.length,
          },
        });
      } catch {
        // ignore — chat should never fail because of brain feedback
      }

      return { user: userRow as ChatMessageRow, assistant: asstRow as ChatMessageRow };
    },
  );

// ============ helpers ============

type BrainConsolidated = {
  memories: Array<{ content_summary: string; similarity: number; event_type: string }>;
  insights: Array<{ description: string; insight_type: string; confidence: number | null }>;
  memoryRows: Array<{ topic: string; summary: string; confidence: number | null }>;
  stats: Record<string, number>;
  markdown: string;
};

async function consolidateBrainContext(args: {
  supabase: import("@supabase/supabase-js").SupabaseClient;
  brandId: string | null;
  clientId: string | null;
  query: string;
}): Promise<BrainConsolidated> {
  const { supabase, brandId, query } = args;
  const empty: BrainConsolidated = {
    memories: [],
    insights: [],
    memoryRows: [],
    stats: {},
    markdown: "",
  };

  // 1) Semantic memories via pgvector (only if brand scoped)
  let memories: BrainConsolidated["memories"] = [];
  if (brandId && query) {
    const vec = await embedText(query);
    if (vec) {
      const { data } = await supabase.rpc("match_brain_events", {
        _brand_id: brandId,
        _query: vec as unknown as string,
        _match_count: 6,
      });
      memories = ((data ?? []) as Array<{ content_summary: string; similarity: number; event_type: string }>).map(
        (r) => ({ content_summary: r.content_summary, similarity: r.similarity, event_type: r.event_type }),
      );
    }
  }

  // 2) Active insights
  const insightsQuery = supabase
    .from("brain_insights")
    .select("insight_type, description, confidence, expires_at, brand_id")
    .order("created_at", { ascending: false })
    .limit(15);
  const { data: ins } = brandId
    ? await insightsQuery.or(`brand_id.eq.${brandId},brand_id.is.null`)
    : await insightsQuery.is("brand_id", null);
  const insights = ((ins ?? []) as Array<{
    insight_type: string;
    description: string;
    confidence: number | null;
    expires_at: string | null;
  }>)
    .filter((r) => !r.expires_at || new Date(r.expires_at) > new Date())
    .slice(0, 8)
    .map((r) => ({ insight_type: r.insight_type, description: r.description, confidence: r.confidence }));

  // 3) Consolidated memory rows (deterministic knowledge)
  const memoryQuery = supabase
    .from("brain_memory")
    .select("topic, summary, confidence, brand_id")
    .order("confidence", { ascending: false })
    .limit(15);
  const { data: memRows } = brandId
    ? await memoryQuery.eq("brand_id", brandId)
    : await memoryQuery.is("brand_id", null);
  const memoryRows = ((memRows ?? []) as Array<{ topic: string; summary: string; confidence: number | null }>)
    .slice(0, 8)
    .map((r) => ({ topic: r.topic, summary: r.summary, confidence: r.confidence }));

  // 4) Cheap SQL stats — never dump tables, only counters
  const stats: Record<string, number> = {};
  const postsQ = supabase.from("posts").select("*", { count: "exact", head: true });
  const tasksQ = supabase.from("tasks").select("*", { count: "exact", head: true });
  const projectsQ = supabase.from("projects").select("*", { count: "exact", head: true });
  const [posts, tasks, projects] = await Promise.all([
    brandId ? postsQ.eq("brand_id", brandId) : postsQ,
    brandId ? tasksQ.eq("brand_id", brandId) : tasksQ,
    brandId ? projectsQ.eq("brand_id", brandId) : projectsQ,
  ]);
  if (typeof posts.count === "number") stats.posts = posts.count;
  if (typeof tasks.count === "number") stats.tasks = tasks.count;
  if (typeof projects.count === "number") stats.projects = projects.count;

  // 5) Prompt-ready markdown block
  const parts: string[] = [];
  if (Object.keys(stats).length) {
    parts.push(
      `### Estatísticas atuais\n${Object.entries(stats)
        .map(([k, v]) => `- ${k}: ${v}`)
        .join("\n")}`,
    );
  }
  if (memoryRows.length) {
    parts.push(
      `### Memórias consolidadas\n${memoryRows
        .map(
          (m) =>
            `- **${m.topic}**${m.confidence != null ? ` _(conf ${Math.round((m.confidence ?? 0) * 100)}%)_` : ""}: ${m.summary}`,
        )
        .join("\n")}`,
    );
  }
  if (insights.length) {
    parts.push(
      `### Insights ativos\n${insights
        .map(
          (i) =>
            `- (${i.insight_type}${i.confidence != null ? ` · ${Math.round((i.confidence ?? 0) * 100)}%` : ""}) ${i.description}`,
        )
        .join("\n")}`,
    );
  }
  if (memories.length) {
    parts.push(
      `### Memórias semânticas (top)\n${memories
        .map((m) => `- ${m.content_summary} _(sim ${m.similarity.toFixed(2)})_`)
        .join("\n")}`,
    );
  }

  return {
    memories,
    insights,
    memoryRows,
    stats,
    markdown: parts.length ? `## Conhecimento do Brain\n${parts.join("\n\n")}` : "",
  };
}

function tryDirectAnswerFromBrain(question: string, ctx: BrainConsolidated): string | null {
  if (!question) return null;
  // Only skip LLM when there is a very high-similarity memory hit for a short question
  const top = ctx.memories[0];
  if (top && top.similarity >= 0.9 && question.length < 180) {
    return `**Encontrei no Brain (memória semelhante, ${(top.similarity * 100).toFixed(0)}%):**\n\n${top.content_summary}`;
  }
  return null;
}

async function callLlmWithBrainContext(args: {
  question: string;
  history: Array<{ role: string; content: string }>;
  brain: BrainConsolidated;
  attachments: ChatAttachment[];
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

  const messages: ModelMessage[] = [
    { role: "system", content: system },
    ...args.history.map((m) => ({
      role: (m.role === "assistant" ? "assistant" : "user") as "assistant" | "user",
      content: m.content,
    })),
  ];

  // Attachment metadata hint (files themselves are stored, only names go to model)
  if (args.attachments.length) {
    const list = args.attachments.map((a) => `- ${a.name} (${a.kind}, ${a.mime})`).join("\n");
    messages.push({
      role: "user",
      content: `Anexos enviados pelo usuário:\n${list}\n\nPergunta: ${args.question || "(sem texto)"}`,
    });
  }

  try {
    const result = await generateText({ model, messages, temperature: 0.4 });
    return { text: result.text.trim() || "_(sem resposta)_", model: DEFAULT_MODEL };
  } catch (err) {
    console.error("[chat] LLM error", err);
    const msg = err instanceof Error ? err.message : String(err);
    return {
      text: `Não consegui consultar o modelo agora. ${args.brain.markdown ? "Segue o que o Brain já sabe sobre isso:\n\n" + args.brain.markdown : ""}\n\n_Erro: ${msg}_`,
      model: DEFAULT_MODEL,
    };
  }
}