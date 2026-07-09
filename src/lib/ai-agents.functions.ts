import { createServerFn } from "@tanstack/react-start";
import { generateText, NoObjectGeneratedError, Output } from "ai";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

/**
 * NexusFlow — 8 agentes de IA.
 * Cada função é isolada, valida input com Zod, chama o gateway Lovable AI
 * (Gemini Pro para estratégia; GPT-5.4-mini para operacional com structured
 * outputs) e loga uso em `brand_ai_usage`. Falha de parsing cai para
 * `error.text` para preservar a resposta bruta.
 */

// ---------- Model routing ----------

const STRATEGIC_MODEL = "google/gemini-3.1-pro-preview";
const OPERATIONAL_MODEL = "openai/gpt-5.4-mini";

type AgentName =
  | "briefing.parse"
  | "voice.generate"
  | "personas.generate"
  | "cohorts.generate"
  | "swot.generate"
  | "pauta.suggest"
  | "content.generate"
  | "competitor.extract";

const AGENT_MODEL: Record<AgentName, { model: string; structuredOutputs: boolean }> = {
  "briefing.parse": { model: OPERATIONAL_MODEL, structuredOutputs: true },
  "voice.generate": { model: STRATEGIC_MODEL, structuredOutputs: false },
  "personas.generate": { model: STRATEGIC_MODEL, structuredOutputs: false },
  "cohorts.generate": { model: STRATEGIC_MODEL, structuredOutputs: false },
  "swot.generate": { model: STRATEGIC_MODEL, structuredOutputs: false },
  "pauta.suggest": { model: OPERATIONAL_MODEL, structuredOutputs: true },
  "content.generate": { model: OPERATIONAL_MODEL, structuredOutputs: true },
  "competitor.extract": { model: OPERATIONAL_MODEL, structuredOutputs: true },
};

// Preço aproximado (USD por 1M tokens). Ajustar depois com números reais.
const PRICE_PER_MTOK: Record<string, { input: number; output: number }> = {
  [STRATEGIC_MODEL]: { input: 1.25, output: 5.0 },
  [OPERATIONAL_MODEL]: { input: 0.25, output: 2.0 },
};

// ---------- Helpers ----------

function estimateCost(model: string, inTok: number, outTok: number) {
  const p = PRICE_PER_MTOK[model] ?? { input: 0, output: 0 };
  return (inTok * p.input + outTok * p.output) / 1_000_000;
}

async function runAgent<T extends z.ZodTypeAny>(opts: {
  agent: AgentName;
  brandId: string;
  clientId: string;
  userId: string;
  system: string;
  prompt: string;
  schema: T;
  supabase: import("@supabase/supabase-js").SupabaseClient;
}): Promise<z.infer<T>> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY não configurada");

  // Autorização: usuário precisa ser membro da marca.
  const { data: member, error: memberErr } = await opts.supabase
    .from("brand_members")
    .select("role")
    .eq("brand_id", opts.brandId)
    .eq("user_id", opts.userId)
    .maybeSingle();
  if (memberErr) throw memberErr;
  if (!member) throw new Error("Você não tem acesso a esta marca");

  // Autorização: cliente precisa pertencer à mesma marca.
  const { data: client, error: clientErr } = await opts.supabase
    .from("clients")
    .select("id")
    .eq("id", opts.clientId)
    .eq("brand_id", opts.brandId)
    .maybeSingle();
  if (clientErr) throw clientErr;
  if (!client) throw new Error("Cliente inválido para esta marca");

  const { model: modelId, structuredOutputs } = AGENT_MODEL[opts.agent];
  const gateway = createLovableAiGatewayProvider(key, undefined, { structuredOutputs });
  const model = gateway(modelId);

  let output: unknown;
  let inTok = 0;
  let outTok = 0;
  let success = true;
  let errMsg: string | null = null;

  try {
    const res = await generateText({
      model,
      system: opts.system,
      prompt: opts.prompt,
      output: Output.object({ schema: opts.schema }),
    });
    output = res.output;
    inTok = res.usage?.inputTokens ?? 0;
    outTok = res.usage?.outputTokens ?? 0;
  } catch (error) {
    if (NoObjectGeneratedError.isInstance(error)) {
      const raw = error.text ?? "";
      try {
        // Tentativa de parse defensiva: modelos às vezes vêm com markdown.
        const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
        output = JSON.parse(cleaned);
        inTok = error.usage?.inputTokens ?? 0;
        outTok = error.usage?.outputTokens ?? 0;
      } catch {
        success = false;
        errMsg = "Parsing falhou; texto bruto disponível para edição manual";
        output = { __raw: raw };
      }
    } else {
      success = false;
      errMsg = error instanceof Error ? error.message : String(error);
      throw error;
    }
  } finally {
    // Log de uso (best-effort; não bloqueia resposta se falhar)
    void opts.supabase.from("brand_ai_usage").insert({
      brand_id: opts.brandId,
      agent: opts.agent,
      model: modelId,
      input_tokens: inTok,
      output_tokens: outTok,
      cost_usd: estimateCost(modelId, inTok, outTok),
      success,
      error_message: errMsg,
      actor_id: opts.userId,
    });
  }

  return output as z.infer<T>;
}

// ---------- Schemas ----------

const BriefingSchema = z.object({
  publico_alvo: z.string().nullable(),
  tom_de_voz: z.string().nullable(),
  dores_do_cliente_final: z.array(z.string()),
  diferenciais: z.array(z.string()),
  hashtags_sugeridas: z.array(z.string()),
  concorrentes_mencionados: z.array(z.string()),
  volume_semanal_estimado: z.number().nullable(),
  completude_percentual: z.number(),
});

const VoiceCardSchema = z.object({
  voice_card: z.object({
    brand_personality: z.string(),
    tone_characteristics: z.array(z.string()),
    vocabulary_rules: z.object({
      words_to_use: z.array(z.string()),
      words_to_avoid: z.array(z.string()),
    }),
    brand_phrases_examples: z.array(z.string()),
  }),
});

const PersonasSchema = z.object({
  personas: z.array(
    z.object({
      nome: z.string(),
      descricao: z.string(),
      dores: z.array(z.string()),
      desejos: z.array(z.string()),
      canais_preferidos: z.array(z.string()),
      gatilhos_de_decisao: z.array(z.string()),
      objecoes_comuns: z.array(z.string()),
    }),
  ),
});

const CohortsSchema = z.object({
  cohorts: z.array(
    z.object({
      name: z.string(),
      target_personas: z.array(z.string()),
      behavioral_traits: z.string(),
      content_strategy: z.string(),
      conversion_criteria: z.string(),
    }),
  ),
});

const SwotSchema = z.object({
  swot_analysis: z.object({
    strengths: z.array(z.string()),
    weaknesses: z.array(z.string()),
    opportunities: z.array(z.string()),
    threats: z.array(z.string()),
  }),
  competitive_matrix: z.array(
    z.object({
      competitor_name: z.string(),
      our_advantages: z.string(),
      vulnerabilities: z.string(),
    }),
  ),
});

const PautasSchema = z.object({
  pautas: z.array(
    z.object({
      titulo: z.string(),
      pilar_type: z.string(),
      cohort_alvo: z.string(),
      formato: z.string(),
      plataforma: z.string(),
      gancho: z.string(),
    }),
  ),
});

const ContentSchema = z.object({
  legenda_principal: z.string(),
  variacoes_gancho: z.array(z.string()),
  cta: z.string(),
  hashtags: z.array(z.string()),
  roteiro_video: z.string().nullable(),
});

const CompetitorSchema = z.object({
  snapshot: z.object({
    bio_resumo: z.string(),
    oferta_principal: z.string().nullable(),
    tom_percebido: z.string(),
    ganchos_recorrentes: z.array(z.string()),
    formatos_observados: z.array(z.string()),
    frequencia_estimada: z.string().nullable(),
  }),
  pautas_inspiradas: z.array(
    z.object({ titulo: z.string(), angulo_diferenciado: z.string() }),
  ),
});

// ---------- Prompts ----------

const P = {
  briefing: `Você é um estrategista de marketing sênior lendo o briefing de um cliente novo de uma agência de conteúdo. Sua tarefa é estruturar o texto bruto abaixo em um JSON limpo, sem inventar informação que não esteja implícita ou explícita no texto.

Regras:
- Se um campo não puder ser inferido com confiança, retorne null ou array vazio — nunca invente.
- "volume_semanal_estimado" é um palpite baseado em pistas do texto (ex: "postamos bastante", "3x por semana"); se não houver pista nenhuma, retorne null.
- "completude_percentual" reflete quantos dos campos vieram preenchidos com confiança (0-100).
- Responda SOMENTE com o JSON, sem markdown, sem comentário, sem texto antes ou depois.`,

  voice: `Você é um redator sênior especialista em brand voice. A partir do briefing estruturado abaixo, crie um "Voice Card": um guia de voz canônico, curto e prático, que qualquer redator júnior da agência conseguiria seguir sem precisar perguntar nada ao estrategista sênior.

O Voice Card precisa ser específico o suficiente para eliminar ambiguidade. Evite adjetivos vagos tipo "tom amigável e profissional" sem exemplos concretos — cada característica de tom deve vir acompanhada de uma frase de exemplo real que poderia aparecer em um post desse cliente. Inclua entre 10 e 15 frases-exemplo e entre 2 e 4 modelos de CTA.

Responda SOMENTE com o JSON, sem markdown, sem texto antes ou depois.`,

  personas: `Você é um estrategista de marketing sênior. A partir do briefing estruturado abaixo, gere de 3 a 5 personas de público-alvo para este cliente. Cada persona deve ser acionável para produção de conteúdo — ou seja, alguém da equipe de conteúdo precisa conseguir olhar para a persona e saber que tipo de post, gancho e linguagem usar para ela.

Não gere personas genéricas ou intercambiáveis entre clientes diferentes. Ancore cada persona em detalhes do briefing (dores, diferenciais, contexto do negócio).

Responda SOMENTE com o JSON, sem markdown, sem texto antes ou depois.`,

  cohorts: `Você é um estrategista de marketing sênior especializado em segmentação comportamental. A partir do briefing e das personas abaixo, gere cohorts comportamentais — cortes de público baseados em comportamento e estágio de relacionamento com a marca (não em dados demográficos), com critérios claros de identificação e uma estratégia de conteúdo específica para cada cohort.

Cada cohort precisa ser diferente o suficiente das outras para justificar uma abordagem de conteúdo distinta. Evite cohorts redundantes.

Responda SOMENTE com o JSON, sem markdown, sem texto antes ou depois.`,

  swot: `Você é um estrategista de marketing sênior. A partir do briefing, personas e cohorts abaixo, gere uma Matriz SWOT (Forças, Fraquezas, Oportunidades, Ameaças) para este cliente, e uma tabela comparativa simples contra os concorrentes mencionados.

Cada item da SWOT deve ser específico ao negócio deste cliente — evite itens genéricos que serviriam para qualquer empresa do setor. Se não houver concorrentes mencionados no briefing, retorne a tabela comparativa como array vazio.

Responda SOMENTE com o JSON, sem markdown, sem texto antes ou depois.`,

  pauta: `Você é um estrategista de conteúdo. A partir da estratégia deste cliente (briefing, personas, cohorts, SWOT), gere sugestões de pauta para o período informado, distribuindo entre os cohorts e formatos recomendados. Diversifique pilares de conteúdo — não repita o mesmo ângulo em pautas consecutivas.

Responda SOMENTE com o JSON, sem markdown, sem texto antes ou depois.`,

  content: `Você é um redator de conteúdo para redes sociais escrevendo EXATAMENTE no tom de voz descrito no Voice Card abaixo. Sua prioridade #1 é soar como esta marca especificamente — não como um redator genérico de agência.

Antes de escrever, releia as frases-exemplo do Voice Card e as características de tom. Sua legenda deve ser indistinguível, em estilo, dessas frases-exemplo. Evite qualquer palavra listada em "palavras_evitar".

Use a pauta e a persona/cohort alvo para definir o ângulo e o gancho. Gere a legenda final, 2 variações alternativas de gancho, um CTA (baseado nos modelos do Voice Card) e 5-8 hashtags relevantes. Se o formato for Reels/vídeo, preencha "roteiro_video"; caso contrário retorne null.

Responda SOMENTE com o JSON, sem markdown, sem texto antes ou depois.`,

  competitor: `Você é um analista de inteligência competitiva para agências de marketing. A partir do texto colado abaixo (bio de perfil + posts recentes de um concorrente), extraia um snapshot estruturado e gere sugestões de pauta inspiradas nesse concorrente para o cliente da agência.

Não copie frases do concorrente literalmente nas pautas sugeridas — use os padrões identificados (ganchos, formatos, ofertas) como inspiração estrutural, nunca como texto a reproduzir.

Responda SOMENTE com o JSON, sem markdown, sem texto antes ou depois.`,
};

// ---------- Server functions ----------

// 1. briefing.parse
export const briefingParseFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        brandId: z.string().uuid(),
        clientId: z.string().uuid(),
        texto: z.string().min(20),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const out = await runAgent({
      agent: "briefing.parse",
      brandId: data.brandId,
      clientId: data.clientId,
      userId: context.userId,
      supabase: context.supabase,
      system: P.briefing,
      prompt: `Texto bruto do briefing:\n"""\n${data.texto}\n"""`,
      schema: BriefingSchema,
    });

    const { data: row, error } = await context.supabase
      .from("brand_briefings")
      .insert({
        brand_id: data.brandId,
        client_id: data.clientId,
        raw_text: data.texto,
        data: out,
        completude: out.completude_percentual ?? 0,
        created_by: context.userId,
      })
      .select()
      .single();
    if (error) throw error;
    return { row, output: out };
  });

// 2. voice.generate
export const voiceGenerateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        brandId: z.string().uuid(),
        clientId: z.string().uuid(),
        briefingJson: z.unknown(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const out = await runAgent({
      agent: "voice.generate",
      brandId: data.brandId,
      clientId: data.clientId,
      userId: context.userId,
      supabase: context.supabase,
      system: P.voice,
      prompt: `Briefing estruturado do cliente:\n${JSON.stringify(data.briefingJson, null, 2)}`,
      schema: VoiceCardSchema,
    });

    await context.supabase
      .from("brand_voice_cards")
      .update({ is_active: false })
      .eq("brand_id", data.brandId)
      .eq("client_id", data.clientId)
      .eq("is_active", true);

    const { data: row, error } = await context.supabase
      .from("brand_voice_cards")
      .insert({
        brand_id: data.brandId,
        client_id: data.clientId,
        data: out,
        created_by: context.userId,
      })
      .select()
      .single();
    if (error) throw error;
    return { row, output: out };
  });

// 3. personas.generate
export const personasGenerateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        brandId: z.string().uuid(),
        clientId: z.string().uuid(),
        briefingJson: z.unknown(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const out = await runAgent({
      agent: "personas.generate",
      brandId: data.brandId,
      clientId: data.clientId,
      userId: context.userId,
      supabase: context.supabase,
      system: P.personas,
      prompt: `Briefing estruturado do cliente:\n${JSON.stringify(data.briefingJson, null, 2)}`,
      schema: PersonasSchema,
    });

    await context.supabase
      .from("brand_personas")
      .update({ is_active: false })
      .eq("brand_id", data.brandId)
      .eq("client_id", data.clientId)
      .eq("is_active", true);

    const { data: row, error } = await context.supabase
      .from("brand_personas")
      .insert({
        brand_id: data.brandId,
        client_id: data.clientId,
        data: out,
        created_by: context.userId,
      })
      .select()
      .single();
    if (error) throw error;
    return { row, output: out };
  });

// 4. cohorts.generate
export const cohortsGenerateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        brandId: z.string().uuid(),
        clientId: z.string().uuid(),
        briefingJson: z.unknown(),
        personasJson: z.unknown(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const out = await runAgent({
      agent: "cohorts.generate",
      brandId: data.brandId,
      clientId: data.clientId,
      userId: context.userId,
      supabase: context.supabase,
      system: P.cohorts,
      prompt: `Briefing estruturado:\n${JSON.stringify(data.briefingJson, null, 2)}\n\nPersonas geradas:\n${JSON.stringify(data.personasJson, null, 2)}`,
      schema: CohortsSchema,
    });

    await context.supabase
      .from("brand_cohorts")
      .update({ is_active: false })
      .eq("brand_id", data.brandId)
      .eq("client_id", data.clientId)
      .eq("is_active", true);

    const { data: row, error } = await context.supabase
      .from("brand_cohorts")
      .insert({
        brand_id: data.brandId,
        client_id: data.clientId,
        data: out,
        created_by: context.userId,
      })
      .select()
      .single();
    if (error) throw error;
    return { row, output: out };
  });

// 5. swot.generate
export const swotGenerateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        brandId: z.string().uuid(),
        clientId: z.string().uuid(),
        briefingJson: z.unknown(),
        personasJson: z.unknown(),
        cohortsJson: z.unknown(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const out = await runAgent({
      agent: "swot.generate",
      brandId: data.brandId,
      clientId: data.clientId,
      userId: context.userId,
      supabase: context.supabase,
      system: P.swot,
      prompt: [
        `Briefing estruturado:\n${JSON.stringify(data.briefingJson, null, 2)}`,
        `Personas:\n${JSON.stringify(data.personasJson, null, 2)}`,
        `Cohorts:\n${JSON.stringify(data.cohortsJson, null, 2)}`,
      ].join("\n\n"),
      schema: SwotSchema,
    });

    await context.supabase
      .from("brand_swot")
      .update({ is_active: false })
      .eq("brand_id", data.brandId)
      .eq("client_id", data.clientId)
      .eq("is_active", true);

    const { data: row, error } = await context.supabase
      .from("brand_swot")
      .insert({
        brand_id: data.brandId,
        client_id: data.clientId,
        data: out,
        created_by: context.userId,
      })
      .select()
      .single();
    if (error) throw error;
    return { row, output: out };
  });

// 6. pauta.suggest
export const pautaSuggestFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        brandId: z.string().uuid(),
        clientId: z.string().uuid(),
        briefingJson: z.unknown(),
        personasJson: z.unknown(),
        cohortsJson: z.unknown(),
        swotJson: z.unknown(),
        quantidade: z.number().int().min(1).max(30),
        periodo: z.string(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const out = await runAgent({
      agent: "pauta.suggest",
      brandId: data.brandId,
      clientId: data.clientId,
      userId: context.userId,
      supabase: context.supabase,
      system: P.pauta,
      prompt: [
        `Briefing: ${JSON.stringify(data.briefingJson)}`,
        `Personas: ${JSON.stringify(data.personasJson)}`,
        `Cohorts: ${JSON.stringify(data.cohortsJson)}`,
        `SWOT: ${JSON.stringify(data.swotJson)}`,
        `Quantidade de pautas desejadas: ${data.quantidade}`,
        `Período: ${data.periodo}`,
      ].join("\n"),
      schema: PautasSchema,
    });

    if (Array.isArray(out.pautas) && out.pautas.length) {
      await context.supabase.from("brand_pautas").insert(
        out.pautas.map((p) => ({
          brand_id: data.brandId,
          client_id: data.clientId,
          titulo: p.titulo,
          pilar: p.pilar,
          cohort_alvo: p.cohort_alvo,
          formato_recomendado: p.formato_recomendado,
          plataforma: p.plataforma,
          gancho: p.gancho,
          data: p,
          created_by: context.userId,
        })),
      );
    }

    return { output: out };
  });

// 7. content.generate
export const contentGenerateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        brandId: z.string().uuid(),
        clientId: z.string().uuid(),
        voiceCardJson: z.unknown(),
        pautaJson: z.unknown(),
        personaOuCohortJson: z.unknown(),
        plataforma: z.string(),
        formato: z.string(),
        pautaId: z.string().uuid().optional(),
        postId: z.string().uuid().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const out = await runAgent({
      agent: "content.generate",
      brandId: data.brandId,
      clientId: data.clientId,
      userId: context.userId,
      supabase: context.supabase,
      system: P.content,
      prompt: [
        `Voice Card:\n${JSON.stringify(data.voiceCardJson, null, 2)}`,
        `Pauta:\n${JSON.stringify(data.pautaJson, null, 2)}`,
        `Persona/cohort alvo:\n${JSON.stringify(data.personaOuCohortJson, null, 2)}`,
        `Plataforma: ${data.plataforma}`,
        `Formato: ${data.formato}`,
      ].join("\n\n"),
      schema: ContentSchema,
    });

    const { data: row, error } = await context.supabase
      .from("brand_ai_content")
      .insert({
        brand_id: data.brandId,
        client_id: data.clientId,
        post_id: data.postId ?? null,
        pauta_id: data.pautaId ?? null,
        plataforma: data.plataforma,
        formato: data.formato,
        data: out,
        created_by: context.userId,
      })
      .select()
      .single();
    if (error) throw error;
    return { row, output: out };
  });

// 8. competitor.extract
export const competitorExtractFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        brandId: z.string().uuid(),
        clientId: z.string().uuid(),
        handle: z.string().optional(),
        bioColada: z.string().min(1),
        postsColados: z.string().min(1),
        briefingJson: z.unknown(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const out = await runAgent({
      agent: "competitor.extract",
      brandId: data.brandId,
      clientId: data.clientId,
      userId: context.userId,
      supabase: context.supabase,
      system: P.competitor,
      prompt: [
        `Bio do perfil do concorrente:\n"""\n${data.bioColada}\n"""`,
        `Posts recentes (texto colado, um por linha ou bloco):\n"""\n${data.postsColados}\n"""`,
        `Briefing do cliente da agência (para contraste/diferenciação):\n${JSON.stringify(data.briefingJson, null, 2)}`,
      ].join("\n\n"),
      schema: CompetitorSchema,
    });

    const { data: row, error } = await context.supabase
      .from("brand_competitors")
      .insert({
        brand_id: data.brandId,
        client_id: data.clientId,
        handle: data.handle ?? null,
        bio_colada: data.bioColada,
        posts_colados: data.postsColados,
        snapshot: out.snapshot,
        pautas_inspiradas: out.pautas_inspiradas,
        created_by: context.userId,
      })
      .select()
      .single();
    if (error) throw error;
    return { row, output: out };
  });

// ---------- Utilitário: salvar edição manual + criar versão ----------

export const saveArtifactVersionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        brandId: z.string().uuid(),
        clientId: z.string().uuid(),
        entityType: z.enum(["briefing", "voice", "personas", "cohorts", "swot"]),
        entityId: z.string().uuid(),
        data: z.unknown(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const tableMap = {
      briefing: "brand_briefings",
      voice: "brand_voice_cards",
      personas: "brand_personas",
      cohorts: "brand_cohorts",
      swot: "brand_swot",
    } as const;
    const table = tableMap[data.entityType];

    // snapshot da versão anterior
    const { data: prev } = await context.supabase
      .from(table)
      .select("data")
      .eq("id", data.entityId)
      .eq("client_id", data.clientId)
      .single();
    if (prev) {
      await context.supabase.from("brand_ai_versions").insert({
        brand_id: data.brandId,
        client_id: data.clientId,
        entity_type: data.entityType,
        entity_id: data.entityId,
        data: prev.data,
        changed_by: context.userId,
      });
    }

    const { error } = await context.supabase
      .from(table)
      .update({ data: data.data as never })
      .eq("id", data.entityId)
      .eq("client_id", data.clientId);
    if (error) throw error;
    return { ok: true };
  });

// ---------- Loader: contexto atual do CLIENTE ----------

export const loadClientContextFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({ brandId: z.string().uuid(), clientId: z.string().uuid() })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const [briefing, voice, personas, cohorts, swot, usage] = await Promise.all([
      context.supabase
        .from("brand_briefings")
        .select("*")
        .eq("brand_id", data.brandId)
        .eq("client_id", data.clientId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      context.supabase
        .from("brand_voice_cards")
        .select("*")
        .eq("brand_id", data.brandId)
        .eq("client_id", data.clientId)
        .eq("is_active", true)
        .maybeSingle(),
      context.supabase
        .from("brand_personas")
        .select("*")
        .eq("brand_id", data.brandId)
        .eq("client_id", data.clientId)
        .eq("is_active", true)
        .maybeSingle(),
      context.supabase
        .from("brand_cohorts")
        .select("*")
        .eq("brand_id", data.brandId)
        .eq("client_id", data.clientId)
        .eq("is_active", true)
        .maybeSingle(),
      context.supabase
        .from("brand_swot")
        .select("*")
        .eq("brand_id", data.brandId)
        .eq("client_id", data.clientId)
        .eq("is_active", true)
        .maybeSingle(),
      context.supabase
        .from("brand_ai_usage")
        .select("cost_usd,created_at,agent,model,input_tokens,output_tokens,success")
        .eq("brand_id", data.brandId)
        .gte("created_at", new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()),
    ]);

    const totalCost = (usage.data ?? []).reduce((s, r) => s + Number(r.cost_usd ?? 0), 0);

    return {
      briefing: briefing.data,
      voice: voice.data,
      personas: personas.data,
      cohorts: cohorts.data,
      swot: swot.data,
      usage: { last30d: usage.data ?? [], totalCostUsd: totalCost },
    };
  });

// ---------- Unified pipeline (one-click onboarding) ----------
//
// Runs briefing.parse → voice → personas → cohorts → swot → pauta sequentially,
// persisting each artifact scoped to (brandId, clientId). Fails fast on the
// first agent that errors; whatever succeeded stays persisted. UI-visible
// per-step progress is driven client-side by orchestrating the individual
// server fns above — this unified entry point is here for programmatic/API
// use where a single atomic call is preferable.
export const runCustomerPipelineFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        brandId: z.string().uuid(),
        clientId: z.string().uuid(),
        texto: z.string().min(20),
        pautasQuantidade: z.number().int().min(1).max(30).default(8),
        pautasPeriodo: z.string().default("próximos 15 dias"),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const common = {
      brandId: data.brandId,
      clientId: data.clientId,
      userId: context.userId,
      supabase: context.supabase,
    };

    // 1. briefing
    const briefing = await runAgent({
      ...common,
      agent: "briefing.parse",
      system: P.briefing,
      prompt: `Texto bruto do briefing:\n"""\n${data.texto}\n"""`,
      schema: BriefingSchema,
    });
    await context.supabase.from("brand_briefings").insert({
      brand_id: data.brandId,
      client_id: data.clientId,
      raw_text: data.texto,
      data: briefing,
      completude: briefing.completude_percentual ?? 0,
      created_by: context.userId,
    });

    // 2. voice
    const voice = await runAgent({
      ...common,
      agent: "voice.generate",
      system: P.voice,
      prompt: `Briefing estruturado do cliente:\n${JSON.stringify(briefing, null, 2)}`,
      schema: VoiceCardSchema,
    });
    await context.supabase
      .from("brand_voice_cards")
      .update({ is_active: false })
      .eq("brand_id", data.brandId)
      .eq("client_id", data.clientId)
      .eq("is_active", true);
    await context.supabase.from("brand_voice_cards").insert({
      brand_id: data.brandId,
      client_id: data.clientId,
      data: voice,
      created_by: context.userId,
    });

    // 3. personas
    const personas = await runAgent({
      ...common,
      agent: "personas.generate",
      system: P.personas,
      prompt: `Briefing estruturado:\n${JSON.stringify(briefing, null, 2)}`,
      schema: PersonasSchema,
    });
    await context.supabase
      .from("brand_personas")
      .update({ is_active: false })
      .eq("brand_id", data.brandId)
      .eq("client_id", data.clientId)
      .eq("is_active", true);
    await context.supabase.from("brand_personas").insert({
      brand_id: data.brandId,
      client_id: data.clientId,
      data: personas,
      created_by: context.userId,
    });

    // 4. cohorts
    const cohorts = await runAgent({
      ...common,
      agent: "cohorts.generate",
      system: P.cohorts,
      prompt: `Briefing:\n${JSON.stringify(briefing, null, 2)}\n\nPersonas:\n${JSON.stringify(personas, null, 2)}`,
      schema: CohortsSchema,
    });
    await context.supabase
      .from("brand_cohorts")
      .update({ is_active: false })
      .eq("brand_id", data.brandId)
      .eq("client_id", data.clientId)
      .eq("is_active", true);
    await context.supabase.from("brand_cohorts").insert({
      brand_id: data.brandId,
      client_id: data.clientId,
      data: cohorts,
      created_by: context.userId,
    });

    // 5. swot
    const swot = await runAgent({
      ...common,
      agent: "swot.generate",
      system: P.swot,
      prompt: [
        `Briefing:\n${JSON.stringify(briefing, null, 2)}`,
        `Personas:\n${JSON.stringify(personas, null, 2)}`,
        `Cohorts:\n${JSON.stringify(cohorts, null, 2)}`,
      ].join("\n\n"),
      schema: SwotSchema,
    });
    await context.supabase
      .from("brand_swot")
      .update({ is_active: false })
      .eq("brand_id", data.brandId)
      .eq("client_id", data.clientId)
      .eq("is_active", true);
    await context.supabase.from("brand_swot").insert({
      brand_id: data.brandId,
      client_id: data.clientId,
      data: swot,
      created_by: context.userId,
    });

    // 6. pautas
    const pautas = await runAgent({
      ...common,
      agent: "pauta.suggest",
      system: P.pauta,
      prompt: [
        `Briefing: ${JSON.stringify(briefing)}`,
        `Personas: ${JSON.stringify(personas)}`,
        `Cohorts: ${JSON.stringify(cohorts)}`,
        `SWOT: ${JSON.stringify(swot)}`,
        `Quantidade: ${data.pautasQuantidade}`,
        `Período: ${data.pautasPeriodo}`,
      ].join("\n"),
      schema: PautasSchema,
    });
    if (Array.isArray(pautas.pautas) && pautas.pautas.length) {
      await context.supabase.from("brand_pautas").insert(
        pautas.pautas.map((p) => ({
          brand_id: data.brandId,
          client_id: data.clientId,
          titulo: p.titulo,
          pilar: p.pilar,
          cohort_alvo: p.cohort_alvo,
          formato_recomendado: p.formato_recomendado,
          plataforma: p.plataforma,
          gancho: p.gancho,
          data: p,
          created_by: context.userId,
        })),
      );
    }

    return { briefing, voice, personas, cohorts, swot, pautas };
  });