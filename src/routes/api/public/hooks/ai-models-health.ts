import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { decryptCredential } from "@/lib/credentials-crypto.server";
import { MODEL_CATALOG, type ProviderName } from "@/lib/ai-models-catalog.server";

/**
 * Weekly health check: pings each provider's default model with the most-recent
 * active brand key and records the outcome in `ai_model_health`. On failure,
 * writes a notification for super admins so a deprecation can be fixed fast.
 */
export const Route = createFileRoute("/api/public/hooks/ai-models-health")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey");
        if (!apikey || apikey !== process.env.SUPABASE_ANON_KEY) {
          return new Response("Unauthorized", { status: 401 });
        }

        const supabase = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { auth: { autoRefreshToken: false, persistSession: false } },
        );

        const providers: ProviderName[] = ["openai", "anthropic", "gemini"];
        const results: Array<{ provider: string; model: string; ok: boolean; error?: string }> = [];

        for (const provider of providers) {
          const modelId = MODEL_CATALOG[provider].operational;

          const { data: cred } = await supabase
            .from("brand_api_credentials")
            .select("ciphertext, brand_id")
            .eq("provider", provider)
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (!cred?.ciphertext) {
            results.push({ provider, model: modelId, ok: false, error: "no_key_configured" });
            continue;
          }

          try {
            const apiKey = await decryptCredential(cred.ciphertext as string);
            const model =
              provider === "openai"
                ? createOpenAI({ apiKey })(modelId)
                : provider === "anthropic"
                  ? createAnthropic({ apiKey })(modelId)
                  : createGoogleGenerativeAI({ apiKey })(modelId);

            await generateText({ model, prompt: "ping", maxOutputTokens: 5 });
            results.push({ provider, model: modelId, ok: true });
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            results.push({ provider, model: modelId, ok: false, error: msg });
            console.error(`[ai-models-health] ${provider}/${modelId} failed:`, msg);
          }

          await supabase.from("ai_model_health").insert({
            provider,
            model_id: modelId,
            status: results[results.length - 1].ok ? "ok" : "failed",
            error_message: results[results.length - 1].error ?? null,
          });
        }

        return Response.json({ checked_at: new Date().toISOString(), results });
      },
    },
  },
});