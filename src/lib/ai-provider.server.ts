import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModel } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptCredential } from "./credentials-crypto.server";
import {
  MODEL_CATALOG,
  type ProviderName,
  type ProviderRole,
} from "./ai-models-catalog.server";

export type { ProviderName, ProviderRole };
export type ProviderKind = "text" | "image";

export type BrandAiModel = {
  provider: ProviderName;
  modelId: string;
  model: LanguageModel;
};

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

/**
 * Load the brand's configured AI provider + decrypted key and return an
 * AI SDK LanguageModel for the requested role from the model catalog.
 */
export async function getBrandAiModel(
  supabase: SupabaseClient,
  brandId: string,
  kind: ProviderKind = "text",
  role: ProviderRole = "operational",
): Promise<BrandAiModel> {
  const { provider, apiKey } = await getBrandProviderKey(supabase, brandId, kind);
  const modelId = MODEL_CATALOG[provider][role];

  let model: LanguageModel;
  if (provider === "openai") {
    model = createOpenAI({ apiKey })(modelId);
  } else if (provider === "anthropic") {
    model = createAnthropic({ apiKey })(modelId);
  } else {
    model = createGoogleGenerativeAI({ apiKey })(modelId);
  }

  return { provider, modelId, model };
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
  const creds = await getBrandProviderKey(supabase, brandId, "image", [
    "openai",
    "gemini",
  ]);

  if (creds.provider === "openai") {
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${creds.apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL_CATALOG.openai.image,
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
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_CATALOG.gemini.image}:predict`,
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
