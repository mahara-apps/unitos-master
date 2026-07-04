import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * AI Server Functions — camada de servidor segura.
 *
 * As chaves de API são lidas APENAS dentro dos handlers (nunca no escopo do
 * módulo) e nunca são expostas ao cliente. As implementações reais dos SDKs
 * estão comentadas e prontas para plugar — atualmente retornamos respostas
 * mockadas premium para desenvolvimento.
 */

// ---------- Schemas ----------

const PlatformSchema = z.enum(["instagram", "linkedin", "twitter", "tiktok"]);

const CopyInputSchema = z.object({
  title: z.string().trim().min(1, "Título é obrigatório").max(200),
  briefing: z.string().trim().max(2000).optional().default(""),
  platform: PlatformSchema,
});

const ImageInputSchema = z.object({
  context: z.string().trim().min(1, "Contexto é obrigatório").max(1000),
});

export type GenerateCopyInput = z.infer<typeof CopyInputSchema>;
export type GenerateImageInput = z.infer<typeof ImageInputSchema>;

export interface GenerateCopyResult {
  copy: string;
  model: string;
}

export interface GenerateImageResult {
  imageUrl: string;
  model: string;
}

// ---------- Prompts ----------

const SYSTEM_PROMPT = `Você é um copywriter sênior especializado em social media para marcas de tecnologia.
Regras estritas de formatação:
- Escreva em português do Brasil, tom profissional-humano.
- Use emojis com moderação e apenas quando somarem contexto.
- Estruture o texto em blocos curtos separados por quebras de linha duplas.
- Inclua uma chamada para ação clara ao final.
- Termine com 3 a 5 hashtags relevantes, em uma única linha.
- Nunca invente dados, métricas ou promessas comerciais.
- Adapte o comprimento e o tom à plataforma informada (Instagram: mais visual e direto; LinkedIn: mais insight de negócios).`;

// ---------- generateCopyFn ----------

export const generateCopyFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => CopyInputSchema.parse(input))
  .handler(async ({ data }): Promise<GenerateCopyResult> => {
    const apiKey = process.env.OPENAI_API_KEY;

    // Quando OPENAI_API_KEY estiver configurada, plugue o SDK real aqui.
    // O bloco abaixo já é o código de produção — descomente e remova o mock.
    //
    // if (!apiKey) {
    //   throw new Error("OPENAI_API_KEY não está configurada no servidor");
    // }
    //
    // const { default: OpenAI } = await import("openai");
    // const client = new OpenAI({ apiKey });
    //
    // const completion = await client.chat.completions.create({
    //   model: "gpt-4o-mini",
    //   temperature: 0.8,
    //   messages: [
    //     { role: "system", content: SYSTEM_PROMPT },
    //     {
    //       role: "user",
    //       content: [
    //         `Plataforma: ${data.platform}`,
    //         `Título do post: ${data.title}`,
    //         data.briefing ? `Briefing: ${data.briefing}` : "Briefing: (não informado)",
    //         "",
    //         "Gere a copy final pronta para publicação seguindo TODAS as regras do sistema.",
    //       ].join("\n"),
    //     },
    //   ],
    // });
    //
    // const copy = completion.choices[0]?.message?.content?.trim();
    // if (!copy) throw new Error("Resposta vazia da OpenAI");
    // return { copy, model: "gpt-4o-mini" };

    // Mock premium — simula latência real e retorna copy formatada.
    await new Promise((r) => setTimeout(r, 1200));
    void apiKey;
    void SYSTEM_PROMPT;

    const copy = buildMockCopy(data);
    return { copy, model: "mock/gpt-4o-mini" };
  });

// ---------- generateImageFn ----------

export const generateImageFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ImageInputSchema.parse(input))
  .handler(async ({ data }): Promise<GenerateImageResult> => {
    const apiKey = process.env.OPENAI_API_KEY;

    // Implementação real com DALL·E 3 (pronta para uso):
    //
    // if (!apiKey) throw new Error("OPENAI_API_KEY não está configurada");
    // const { default: OpenAI } = await import("openai");
    // const client = new OpenAI({ apiKey });
    // const res = await client.images.generate({
    //   model: "dall-e-3",
    //   prompt: `Imagem premium para social media. Contexto: ${data.context}. Estilo editorial moderno, iluminação suave, alta qualidade, pronta para feed.`,
    //   size: "1024x1024",
    //   quality: "hd",
    //   n: 1,
    // });
    // const imageUrl = res.data?.[0]?.url;
    // if (!imageUrl) throw new Error("Nenhuma imagem retornada");
    // return { imageUrl, model: "dall-e-3" };

    // Mock — placeholder Unsplash com seed determinística.
    await new Promise((r) => setTimeout(r, 1500));
    void apiKey;
    const seed = encodeURIComponent(data.context.slice(0, 40) || "nexusflow");
    return {
      imageUrl: `https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&w=1200&q=80&sig=${seed}`,
      model: "mock/dall-e-3",
    };
  });

// ---------- Helpers ----------

function buildMockCopy(data: GenerateCopyInput): string {
  const title = data.title.trim();
  const brief = data.briefing.trim();

  if (data.platform === "linkedin") {
    return [
      `✨ ${title}`,
      "",
      brief
        ? `Nos últimos meses, temos visto uma mudança clara: ${brief.toLowerCase()}.`
        : "Nos últimos meses, temos visto uma mudança clara na forma como equipes de conteúdo trabalham.",
      "",
      "Três aprendizados que estamos aplicando no NexusFlow:",
      "→ Fluxos de aprovação assíncronos reduzem retrabalho em até 40%.",
      "→ IA aplicada com contexto vira alavanca — não substituição.",
      "→ Visibilidade compartilhada com o cliente encurta ciclos de decisão.",
      "",
      "Se você lidera uma operação de conteúdo, vale repensar onde está o real gargalo.",
      "",
      "Curioso para trocar ideias? Deixe um comentário. 👇",
      "",
      "#Marketing #IA #Produtividade #ConteúdoDigital #Liderança",
    ].join("\n");
  }

  return [
    `✨ ${title}`,
    "",
    brief
      ? `${brief}`
      : "A gente sabe: produzir conteúdo bom, no ritmo certo, é o desafio real.",
    "",
    "É por isso que criamos um fluxo que junta:",
    "🎯 Briefing claro",
    "🤖 IA que respeita seu tom de voz",
    "✅ Aprovação em um clique",
    "",
    "Salva esse post pra quando bater aquela pressão de calendário. 💾",
    "",
    "#IA #SocialMedia #Marketing #NexusFlow #Produtividade",
  ].join("\n");
}