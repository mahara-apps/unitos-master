import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getBrandAiModel } from "./ai-provider.server";
import { buildBrandContextBlueprint } from "./ai-agents.functions";

const FIELD_PROMPTS: Record<string, { system: string; wrap: (post: PostContext, hint: string) => string }> = {
  hook: {
    system:
      "Você é especialista em ganchos (hooks) para redes sociais. Devolva 3 opções curtas (máx. 12 palavras cada) numeradas 1) 2) 3), em pt-BR, com forte carga de curiosidade/quebra de padrão, aderentes ao formato e briefing. Sem emojis, sem hashtags, sem explicação.",
    wrap: (p, hint) =>
      `Post: ${p.title}\nFormato: ${p.format ?? "-"}\nBriefing interno: ${p.internal_briefing ?? "-"}\nBriefing p/ cliente: ${p.client_briefing ?? "-"}\nCopy atual: ${p.copy ?? "-"}\nDica: ${hint || "(nenhuma)"}\n\nRetorne apenas as 3 opções de hook.`,
  },
  headline: {
    system:
      "Você é editor de headlines para redes sociais. Devolva UMA única frase (máx. 14 palavras), direta, em pt-BR, que resuma a promessa central do post. Sem emojis, sem hashtags, sem aspas, sem explicação.",
    wrap: (p, hint) =>
      `Post: ${p.title}\nFormato: ${p.format ?? "-"}\nBriefing interno: ${p.internal_briefing ?? "-"}\nBriefing p/ cliente: ${p.client_briefing ?? "-"}\nCopy atual: ${p.copy ?? "-"}\nDica: ${hint || "(nenhuma)"}\n\nRetorne apenas a headline.`,
  },
  copy: {
    system:
      "Você é o copywriter chefe da agência. Escreva legendas curtas para redes sociais em pt-BR, no tom da marca, com CTA e hashtags relevantes. Máximo 220 palavras. Nunca use emojis excessivamente.",
    wrap: (p, hint) =>
      `Post: ${p.title}\nFormato: ${p.format ?? "-"}\nBriefing interno: ${p.internal_briefing ?? "-"}\nBriefing p/ cliente: ${p.client_briefing ?? "-"}\nDica adicional: ${hint || "(nenhuma)"}\n\nEscreva a legenda final.`,
  },
  hashtags: {
    system:
      "Você é especialista em hashtags. Devolva 10 a 15 hashtags relevantes separadas por espaço, em pt-BR, sem explicação, priorizando alcance orgânico.",
    wrap: (p, hint) =>
      `Post: ${p.title}\nCopy: ${p.copy ?? "-"}\nContexto: ${hint || "(nenhum)"}\n\nRetorne apenas hashtags.`,
  },
  cta: {
    system:
      "Você é especialista em Call To Action. Devolva 3 opções curtas (máx 12 palavras cada) numeradas 1) 2) 3), em pt-BR, aderentes ao objetivo do post.",
    wrap: (p, hint) =>
      `Post: ${p.title}\nCopy: ${p.copy ?? "-"}\nObjetivo: ${hint || "engajar"}\n\nRetorne apenas as 3 opções.`,
  },
  script: {
    system:
      "Você é roteirista social. Gere um roteiro em cenas numeradas (Cena 1 / Cena 2 …) com tempo estimado, narrador e fala. Máximo 8 cenas. pt-BR.",
    wrap: (p, hint) =>
      `Post: ${p.title}\nFormato: ${p.format ?? "reels"}\nBriefing: ${p.internal_briefing ?? "-"}\nDica: ${hint || "(nenhuma)"}\n\nGere o roteiro.`,
  },
  briefing: {
    system:
      "Você é o diretor de conteúdo. Gere um briefing interno de produção (2 a 5 parágrafos) em pt-BR, cobrindo objetivo, ângulo, referências e estrutura sugerida.",
    wrap: (p, hint) =>
      `Post: ${p.title}\nFormato: ${p.format ?? "-"}\nCopy atual: ${p.copy ?? "-"}\nDica: ${hint || "(nenhuma)"}\n\nEscreva o briefing.`,
  },
};

type PostContext = {
  title: string;
  copy: string | null;
  format: string | null;
  internal_briefing: string | null;
  client_briefing: string | null;
};

export const aiInlineGenerateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        postId: z.string().uuid(),
        field: z.enum(["copy", "hashtags", "cta", "script", "briefing", "hook", "headline"]),
        hint: z.string().max(500).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<{ text: string }> => {
    const { data: post, error } = await context.supabase
      .from("posts")
      .select("id, brand_id, client_id, title, copy, format, internal_briefing, client_briefing")
      .eq("id", data.postId)
      .single();
    if (error || !post) throw error ?? new Error("post_not_found");

    const { blueprint } = await buildBrandContextBlueprint(
      context.supabase,
      post.brand_id,
      post.client_id,
    );

    const cfg = FIELD_PROMPTS[data.field];
    const { model } = await getBrandAiModel(
      context.supabase,
      post.brand_id,
      "text",
      "operational",
    );
    const { text } = await generateText({
      model,
      system: `${cfg.system}\n\n${blueprint}`,
      prompt: cfg.wrap(post as PostContext, data.hint ?? ""),
    });
    return { text: text.trim() };
  });