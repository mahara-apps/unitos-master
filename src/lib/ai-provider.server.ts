import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import type { LanguageModel } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptCredential } from "./credentials-crypto.server";
import {
  resolveModel,
  nextFallbackModel,
  saveCatalogOverride,
  isModelUnavailableError,
  type ProviderName,
  type ProviderRole,
} from "./ai-models-catalog.server";

import { IMAGE_PROVIDERS, supportsKind } from "./ai-capabilities";
import { classifyAiError, unwrapAiError } from "./ai-failures.server";
import { recordAiUsage, type AiUsageContext } from "./ai-usage.server";

export type { AiUsageContext };


export type { ProviderName, ProviderRole };
export type ProviderKind = "text" | "image";

/** Registro de cada tentativa por provedor — consumido pela observabilidade. */
export type ProviderAttempt = {
  provider: ProviderName;
  model: string;
  attempt: number;
  result: "success" | string;
};

export type BrandAiModel = {
  provider: ProviderName;
  modelId: string;
  model: LanguageModel;
  /** Provedor secundário elegível (fallback), quando configurado. */
  fallbackProvider: ProviderName | null;
  /**
   * Array mutável preenchido em runtime com cada tentativa/troca de provedor.
   * Os pipelines já existentes apenas o leem para gravar em `ai_jobs`.
   */
  providerAttempts: ProviderAttempt[];
};

/** Resumo curto (sem segredos) para gravar em ai_jobs. */
export function describeProviderAttempts(attempts: ProviderAttempt[]): string {
  return attempts
    .map((a) => `${a.provider}/${a.model}#${a.attempt}:${a.result}`)
    .join(" → ");
}

export type BrandProviderKey = {
  provider: ProviderName;
  apiKey: string;
};

/**
 * Resolve the brand's configured provider (selector in Conexões) and return
 * its decrypted API key. Throws when nothing usable is configured — the app
 * must NEVER silently fall back to Lovable AI.
 */
export async function getBrandProviderKey(
  supabase: SupabaseClient,
  brandId: string,
  kind: ProviderKind = "text",
  only?: ProviderName[],
): Promise<BrandProviderKey> {
  const { data: conn, error: connErr } = await supabase
    .from("brand_connections")
    .select("text_provider, image_provider, providers")
    .eq("brand_id", brandId)
    .maybeSingle();
  if (connErr) throw connErr;

  const selected = (
    kind === "image" ? conn?.image_provider : conn?.text_provider
  ) as ProviderName | undefined;

  const providers = (conn?.providers ?? {}) as Record<
    string,
    { connected?: boolean } | undefined
  >;
  const allowed = (p: string): p is ProviderName =>
    !only || (only as string[]).includes(p);

  const provider: ProviderName | undefined =
    selected && providers[selected]?.connected && allowed(selected)
      ? selected
      : (Object.entries(providers).find(
          ([k, v]) => v?.connected && allowed(k),
        )?.[0] as ProviderName | undefined);

  if (!provider) {
    throw new Error(
      "ai_provider_not_configured: nenhuma IA configurada para esta marca. Configure uma chave em Conexões.",
    );
  }

  const { data: credRow, error: credErr } = await supabase
    .from("brand_api_credentials")
    .select("ciphertext")
    .eq("brand_id", brandId)
    .eq("provider", provider)
    .maybeSingle();
  if (credErr) throw credErr;
  if (!credRow?.ciphertext) {
    throw new Error(
      `ai_provider_key_missing:${provider}: a chave do provedor não foi encontrada. Reconfigure em Conexões.`,
    );
  }

  const apiKey = await decryptCredential(credRow.ciphertext as string);
  return { provider, apiKey };
}

export function instantiateProviderModel(
  provider: ProviderName,
  apiKey: string,
  modelId: string,
): LanguageModel {
  if (provider === "openai") return createOpenAI({ apiKey })(modelId);
  if (provider === "anthropic") return createAnthropic({ apiKey })(modelId);
  if (provider === "groq") return createGroq({ apiKey })(modelId);
  return createGoogleGenerativeAI({ apiKey })(modelId);
}

const instantiateModel = instantiateProviderModel;

/**
 * Provedor secundário da marca (`brand_connections.text_fallback_provider`).
 * Só é elegível quando é diferente do principal, está conectado e possui
 * chave decifrável. Retorna null quando não há fallback usável — marcas com um
 * único provedor continuam funcionando exatamente como antes.
 */
export async function getBrandFallbackProviderKey(
  supabase: SupabaseClient,
  brandId: string,
  primary: ProviderName,
): Promise<BrandProviderKey | null> {
  try {
    const { data: conn } = await supabase
      .from("brand_connections")
      .select("text_fallback_provider, providers")
      .eq("brand_id", brandId)
      .maybeSingle();
    const fallback = (conn as { text_fallback_provider?: string | null } | null)
      ?.text_fallback_provider as ProviderName | null | undefined;
    if (!fallback || fallback === primary) return null;
    const providers = (conn?.providers ?? {}) as Record<string, { connected?: boolean } | undefined>;
    if (!providers[fallback]?.connected) return null;
    if (!supportsKind(fallback, "text")) return null;

    const { data: credRow } = await supabase
      .from("brand_api_credentials")
      .select("ciphertext")
      .eq("brand_id", brandId)
      .eq("provider", fallback)
      .maybeSingle();
    if (!credRow?.ciphertext) return null;
    const apiKey = await decryptCredential(credRow.ciphertext as string);
    return { provider: fallback, apiKey };
  } catch (err) {
    console.warn("[ai-provider] fallback provider indisponível", err);
    return null;
  }
}

type ModelV2 = Extract<LanguageModel, { doGenerate: unknown }>;

/**
 * Formatos de uso vistos na prática: AI SDK v5 (`inputTokens`), AI SDK v4
 * (`promptTokens`) e o payload cru OpenAI/Groq (`prompt_tokens`,
 * `input_tokens`), que chega em `providerMetadata`/`rawResponse` de Groq.
 */
type UsageLike =
  | ({
      inputTokens?: number | null;
      outputTokens?: number | null;
      promptTokens?: number | null;
      completionTokens?: number | null;
      prompt_tokens?: number | null;
      completion_tokens?: number | null;
      input_tokens?: number | null;
      output_tokens?: number | null;
      totalTokens?: number | null;
      total_tokens?: number | null;
    } & Record<string, unknown>)
  | null
  | undefined;

function readUsage(usage: UsageLike): { inTok: number; outTok: number } {
  const num = (...vals: unknown[]) => {
    for (const v of vals) {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) return n;
    }
    return 0;
  };
  const inTok = num(usage?.inputTokens, usage?.promptTokens, usage?.prompt_tokens, usage?.input_tokens);
  const outTok = num(
    usage?.outputTokens,
    usage?.completionTokens,
    usage?.completion_tokens,
    usage?.output_tokens,
  );
  // Groq às vezes reporta só o total: preserva o volume no campo de entrada.
  if (inTok === 0 && outTok === 0) {
    const total = num(usage?.totalTokens, usage?.total_tokens);
    if (total > 0) return { inTok: total, outTok: 0 };
  }
  return { inTok, outTok };
}


/**
 * Envolve o modelo com duas responsabilidades:
 * 1. fallback: se o provedor rejeitar por modelo descontinuado/indisponível,
 *    tenta o próximo da cadeia do papel e promove o modelo no catálogo;
 * 2. medição: grava tokens, custo e sucesso/erro em `brand_ai_usage` para
 *    toda chamada — inclusive streaming — sem tocar nos pontos de chamada.
 */
function withModelInstrumentation(
  base: ModelV2,
  ctx: {
    provider: ProviderName;
    role: ProviderRole;
    apiKey: string;
    brandId: string;
    usage?: AiUsageContext;
    /** Provedor secundário elegível — usado só em falha transitória. */
    fallback?: { provider: ProviderName; apiKey: string; modelId: string } | null;
    attempts: ProviderAttempt[];
  },
): ModelV2 {
  const log = (
    modelId: string,
    inTok: number,
    outTok: number,
    success: boolean,
    errorMessage?: string | null,
  ) => {
    void recordAiUsage({
      brandId: ctx.brandId,
      model: modelId,
      inputTokens: inTok,
      outputTokens: outTok,
      success,
      ...(errorMessage ? { errorMessage } : {}),
      agent: ctx.usage?.agent ?? `${ctx.role}.${ctx.provider}`,
      clientId: ctx.usage?.clientId ?? null,
      userId: ctx.usage?.userId ?? null,
    });
  };

  /** Conta tokens ao final do stream sem consumir/alterar o conteúdo. */
  const instrumentStream = (
    result: Awaited<ReturnType<ModelV2["doStream"]>>,
    modelId: string,
  ): Awaited<ReturnType<ModelV2["doStream"]>> => {
    let inTok = 0;
    let outTok = 0;
    let streamError: string | null = null;
    const meter = new TransformStream<unknown, unknown>({
      transform(chunk, controller) {
        const part = chunk as { type?: string; usage?: UsageLike; error?: unknown };
        if (part?.type === "finish" && part.usage) {
          const u = readUsage(part.usage);
          inTok = u.inTok || inTok;
          outTok = u.outTok || outTok;
        }
        if (part?.type === "error") {
          streamError =
            part.error instanceof Error ? part.error.message : String(part.error ?? "stream error");
        }
        controller.enqueue(chunk);
      },
      flush() {
        log(modelId, inTok, outTok, !streamError, streamError);
      },
    });
    return {
      ...result,
      stream: (result.stream as ReadableStream<unknown>).pipeThrough(meter),
    } as Awaited<ReturnType<ModelV2["doStream"]>>;
  };

  const attempt = async <T,>(
    op: "doGenerate" | "doStream",
    options: Parameters<ModelV2["doGenerate"]>[0],
  ): Promise<T> => {
    const tried: string[] = [base.modelId];
    let current: ModelV2 = base;
    let provider = ctx.provider;
    let apiKey = ctx.apiKey;
    let switchedProvider = false;
    let call = 0;
    for (;;) {
      const modelId = tried[tried.length - 1] ?? base.modelId;
      call += 1;
      try {
        const out = (await (current[op] as (o: unknown) => Promise<unknown>)(options)) as T;
        if (op === "doStream") {
          return instrumentStream(
            out as Awaited<ReturnType<ModelV2["doStream"]>>,
            modelId,
          ) as T;
        }
        const raw = out as {
          usage?: UsageLike;
          providerMetadata?: Record<string, { usage?: UsageLike } | undefined>;
          response?: { body?: { usage?: UsageLike } | null } | null;
        };
        // Groq/OpenAI-compatible às vezes só expõe os tokens no payload cru.
        const { inTok, outTok } = readUsage(
          raw.usage ??
            raw.providerMetadata?.[provider]?.usage ??
            raw.providerMetadata?.["openai"]?.usage ??
            raw.response?.body?.usage,
        );

        if (inTok === 0 && outTok === 0) {
          // Diagnóstico: aponta onde o provedor escondeu os tokens.
          console.warn(
            `[ai-provider] uso sem tokens ${provider}/${modelId} — chaves: ` +
              `raiz=${Object.keys((raw ?? {}) as object).join(",")} ` +
              `usage=${JSON.stringify(raw.usage ?? null)} ` +
              `providerMetadata=${JSON.stringify(raw.providerMetadata ?? null).slice(0, 400)}`,
          );
        }
        log(modelId, inTok, outTok, true);

        ctx.attempts.push({ provider, model: modelId, attempt: call, result: "success" });
        return out;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const { kind, retryable } = classifyAiError(err);
        ctx.attempts.push({ provider, model: modelId, attempt: call, result: kind });

        // 1) Modelo descontinuado/indisponível no MESMO provedor: promove o
        //    próximo da cadeia do papel (comportamento já existente).
        if (isModelUnavailableError(msg)) {
          const next = nextFallbackModel(provider, ctx.role, tried);
          if (next) {
            console.warn(
              `[ai-provider] ${provider}/${ctx.role}: ${modelId} indisponível — tentando ${next}`,
            );
            await saveCatalogOverride({
              provider,
              role: ctx.role,
              modelId: next,
              replacedModelId: modelId,
              reason: msg,
            });
            tried.push(next);
            current = instantiateModel(provider, apiKey, next) as ModelV2;
            continue;
          }
        }

        // 2) Falha transitória do PROVEDOR (503/429/quota/timeout): tenta uma
        //    única vez o provedor secundário da marca. Erros permanentes
        //    (chave inválida, config, request inválido) nunca trocam provedor.
        const transient =
          retryable &&
          (kind === "provider_unavailable" ||
            kind === "provider_rate_limit" ||
            kind === "provider_quota");
        if (transient && ctx.fallback && !switchedProvider) {
          switchedProvider = true;
          console.warn(
            `[ai-provider] ${provider} falhou (${kind}) — alternando para ${ctx.fallback.provider}/${ctx.fallback.modelId}`,
          );
          provider = ctx.fallback.provider;
          apiKey = ctx.fallback.apiKey;
          tried.length = 0;
          tried.push(ctx.fallback.modelId);
          current = instantiateModel(provider, apiKey, ctx.fallback.modelId) as ModelV2;
          continue;
        }

        log(modelId, 0, 0, false, msg);
        if (isModelUnavailableError(msg)) {
          throw new Error(
            `ai_model_unavailable:${provider}:${ctx.role}: o modelo ${modelId} foi descontinuado pelo provedor e não há substituto configurado. Detalhe: ${unwrapAiError(err).text.slice(0, 300)}`,
          );
        }
        throw err;
      }
    }
  };

  return {
    ...base,
    specificationVersion: base.specificationVersion,
    provider: base.provider,
    modelId: base.modelId,
    supportedUrls: base.supportedUrls,
    doGenerate: (options: Parameters<ModelV2["doGenerate"]>[0]) =>
      attempt<Awaited<ReturnType<ModelV2["doGenerate"]>>>("doGenerate", options),
    doStream: (options: Parameters<ModelV2["doStream"]>[0]) =>
      attempt<Awaited<ReturnType<ModelV2["doStream"]>>>("doStream", options),
  } as ModelV2;
}

/**
 * Teto mensal: bloqueia a chamada quando a marca/cliente estourou o orçamento.
 * Best-effort — falha de RPC não impede a geração.
 */
async function assertBudget(
  supabase: SupabaseClient,
  brandId: string,
  usage?: AiUsageContext,
): Promise<void> {
  try {
    const { data } = await supabase.rpc("check_ai_usage_budget", {
      _brand_id: brandId,
      _client_id: usage?.clientId ?? null,
      _user_id: usage?.userId ?? null,
    });
    const b = data as
      | { allowed?: boolean; blocked_by?: string; limit_usd?: number; spent_usd?: number }
      | null;
    if (b && b.allowed === false) {
      throw new Error(
        `ai_budget_exceeded:${b.blocked_by ?? "brand"}:${b.spent_usd ?? 0}:${b.limit_usd ?? 0}`,
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.startsWith("ai_budget_exceeded")) throw err;
    console.warn("[ai-provider] check_ai_usage_budget falhou", msg);
  }
}

/**
 * Load the brand's configured AI provider + decrypted key and return an
 * AI SDK LanguageModel for the requested role from the model catalog.
 */
export async function getBrandAiModel(
  supabase: SupabaseClient,
  brandId: string,
  kind: ProviderKind = "text",
  role: ProviderRole = "operational",
  usage?: AiUsageContext,
): Promise<BrandAiModel> {
  const { provider, apiKey } = await getBrandProviderKey(supabase, brandId, kind);
  const modelId = await resolveModel(provider, role);
  if (!modelId) {
    throw new Error(
      `ai_model_unavailable:${provider}:${role}: o provedor não oferece modelo para esta função.`,
    );
  }

  await assertBudget(supabase, brandId, usage);

  // Provedor secundário (opcional): usado apenas em falha transitória.
  let fallback: { provider: ProviderName; apiKey: string; modelId: string } | null = null;
  if (kind === "text") {
    const cred = await getBrandFallbackProviderKey(supabase, brandId, provider);
    if (cred) {
      const fbModel = await resolveModel(cred.provider, role);
      if (fbModel) fallback = { provider: cred.provider, apiKey: cred.apiKey, modelId: fbModel };
    }
  }

  const providerAttempts: ProviderAttempt[] = [];
  const base = instantiateModel(provider, apiKey, modelId) as ModelV2;
  const model = withModelInstrumentation(base, {
    provider,
    role,
    apiKey,
    brandId,
    fallback,
    attempts: providerAttempts,
    ...(usage ? { usage } : {}),
  });

  return {
    provider,
    modelId,
    model,
    fallbackProvider: fallback?.provider ?? null,
    providerAttempts,
  };
}



/* ------------------------------------------------------------------ */
/* Embeddings (1536 dims — matches the brain_embeddings vector column) */
/* ------------------------------------------------------------------ */

const EMBED_DIMS = 1536;

/**
 * Create an embedding with the brand's own API key. Anthropic has no
 * embedding endpoint, so OpenAI/Gemini keys are used. Returns null on
 * failure so the Brain degrades instead of crashing.
 */
export async function embedTextWithBrandKey(
  supabase: SupabaseClient,
  brandId: string,
  text: string,
): Promise<number[] | null> {
  const trimmed = text.replace(/\s+/g, " ").trim().slice(0, 8000);
  if (!trimmed) return null;

  let creds: BrandProviderKey;
  try {
    creds = await getBrandProviderKey(supabase, brandId, "text", [
      "openai",
      "gemini",
    ]);
  } catch (err) {
    console.error("[ai-provider] embedding sem chave configurada", err);
    return null;
  }

  try {
    if (creds.provider === "openai") {
      const res = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${creds.apiKey}`,
        },
        body: JSON.stringify({
          model: "text-embedding-3-small",
          input: trimmed,
          dimensions: EMBED_DIMS,
        }),
      });
      if (!res.ok) {
        console.error("[ai-provider] openai embeddings", res.status, await res.text().catch(() => ""));
        return null;
      }
      const json = (await res.json()) as { data?: Array<{ embedding: number[] }> };
      return json.data?.[0]?.embedding ?? null;
    }

    const res = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": creds.apiKey,
        },
        body: JSON.stringify({
          content: { parts: [{ text: trimmed }] },
          outputDimensionality: EMBED_DIMS,
        }),
      },
    );
    if (!res.ok) {
      console.error("[ai-provider] gemini embeddings", res.status, await res.text().catch(() => ""));
      return null;
    }
    const json = (await res.json()) as { embedding?: { values?: number[] } };
    return json.embedding?.values ?? null;
  } catch (err) {
    console.error("[ai-provider] embedding falhou", err);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Image generation                                                    */
/* ------------------------------------------------------------------ */

export type BrandGeneratedImage = {
  provider: ProviderName;
  base64: string;
  contentType: string;
};

/**
 * Generate an image with the brand's own image provider key.
 * Anthropic has no image model, so only OpenAI/Gemini are eligible.
 */
export async function generateBrandImage(
  supabase: SupabaseClient,
  brandId: string,
  prompt: string,
): Promise<BrandGeneratedImage> {
  const creds = await getBrandProviderKey(
    supabase,
    brandId,
    "image",
    IMAGE_PROVIDERS,
  );
  if (!supportsKind(creds.provider, "image")) {
    throw new Error(
      `ai_image_unsupported:${creds.provider}: este provedor não gera imagens. Selecione OpenAI ou Gemini em Conexões.`,
    );
  }
  const imageModelId = await resolveModel(creds.provider, "image");
  if (!imageModelId) {
    throw new Error(`ai_image_unsupported:${creds.provider}: sem modelo de imagem disponível.`);
  }

  if (creds.provider === "openai") {
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${creds.apiKey}`,
      },
      body: JSON.stringify({
        model: imageModelId,
        prompt,
        size: "1024x1024",
        n: 1,
      }),
    });
    if (!res.ok) {
      throw new Error(
        `ai_image_failed: ${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`,
      );
    }
    const json = (await res.json()) as { data?: Array<{ b64_json?: string }> };
    const b64 = json.data?.[0]?.b64_json;
    if (!b64) throw new Error("ai_image_empty: modelo não retornou imagem");
    return { provider: "openai", base64: b64, contentType: "image/png" };
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${imageModelId}:predict`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": creds.apiKey,
      },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: { sampleCount: 1, aspectRatio: "1:1" },
      }),
    },
  );
  if (!res.ok) {
    throw new Error(
      `ai_image_failed: ${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`,
    );
  }
  const json = (await res.json()) as {
    predictions?: Array<{ bytesBase64Encoded?: string; mimeType?: string }>;
  };
  const pred = json.predictions?.[0];
  if (!pred?.bytesBase64Encoded) {
    throw new Error("ai_image_empty: modelo não retornou imagem");
  }
  return {
    provider: "gemini",
    base64: pred.bytesBase64Encoded,
    contentType: pred.mimeType ?? "image/png",
  };
}

/* ------------------------------------------------------------------ */
/* Admin variants — for background jobs with no user session           */
/* ------------------------------------------------------------------ */

/** Resolve o modelo da marca usando o client admin (jobs em background). */
export async function getBrandAiModelAdmin(
  brandId: string,
  kind: ProviderKind = "text",
  role: ProviderRole = "operational",
  usage?: AiUsageContext,
): Promise<BrandAiModel> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return getBrandAiModel(supabaseAdmin, brandId, kind, role, usage);

}

/** Embedding com a chave da marca usando o client admin. */
export async function embedTextAdmin(
  brandId: string,
  text: string,
): Promise<number[] | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return embedTextWithBrandKey(supabaseAdmin, brandId, text);
}
