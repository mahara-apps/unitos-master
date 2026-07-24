import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModel } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptCredential } from "./credentials-crypto.server";

export type ProviderName = "openai" | "anthropic" | "gemini";
export type ProviderKind = "text" | "image";

/** Default model id per provider, used when caller doesn't override. */
const DEFAULT_TEXT_MODEL: Record<ProviderName, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-3-5-sonnet-latest",
  gemini: "gemini-1.5-pro-latest",
};

type PreferredModels = Partial<Record<ProviderName, string>>;

export type BrandAiModel = {
  provider: ProviderName;
  modelId: string;
  model: LanguageModel;
};

/**
 * Load the brand's configured AI provider + decrypted key and return an
 * AI SDK LanguageModel. Throws when nothing is configured — the app must
 * NEVER silently fall back to Lovable AI.
 */
export async function getBrandAiModel(
  supabase: SupabaseClient,
  brandId: string,
  kind: ProviderKind = "text",
  preferred?: PreferredModels,
): Promise<BrandAiModel> {
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

  const provider: ProviderName | undefined =
    selected && providers[selected]?.connected
      ? selected
      : (Object.entries(providers).find(([, v]) => v?.connected)?.[0] as
          | ProviderName
          | undefined);

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
  const modelId = preferred?.[provider] ?? DEFAULT_TEXT_MODEL[provider];

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