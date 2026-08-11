import type { SupabaseClient } from "@supabase/supabase-js";
import { generateText, NoObjectGeneratedError, Output } from "ai";
import type { z } from "zod";
import { getBrandAiModel } from "@/lib/ai-provider.server";
import { buildBrandContextBlueprint } from "@/lib/ai-agents.functions";

/**
 * Camada de agente para a Pauta mensal.
 *
 * Mesmo contrato dos agentes de IA do app (`ai-agents.functions.ts`):
 *   1. valida acesso do usuário à marca e do cliente à marca
 *   2. injeta o Brand Context Blueprint (identidade, briefing, concorrentes, docs)
 *   3. checa o orçamento de IA (`check_ai_usage_budget`) antes de gastar tokens
 *   4. usa o provider/modelo configurado pela marca (`getBrandAiModel`)
 *   5. loga uso e custo em `brand_ai_usage`
 *
 * Vive num módulo `.server` para poder ser reaproveitado por
 * `monthly-plans.functions.ts` sem arrastar código de servidor pro bundle.
 */

const PRICE_PER_MTOK: Record<string, { input: number; output: number }> = {
  "google/gemini-2.5-pro": { input: 1.25, output: 5.0 },
  "google/gemini-2.5-flash": { input: 0.25, output: 2.0 },
};

function estimateCost(model: string, inTok: number, outTok: number) {
  const p = PRICE_PER_MTOK[model] ?? { input: 0, output: 0 };
  return (inTok * p.input + outTok * p.output) / 1_000_000;
}

function tryParseFallback(text: string | undefined) {
  if (!text) return null;
  try {
    const cleaned = text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();
    const m = cleaned.match(/\{[\s\S]*\}/);
    return JSON.parse(m ? m[0] : cleaned);
  } catch {
    return null;
  }
}

export type PlanAgentResult<T> = {
  output: T;
  modelId: string;
  brandBlueprintUsed: boolean;
};

export async function runPlanAgent<T extends z.ZodTypeAny>(opts: {
  agent: "pauta.suggest" | "content.generate";
  supabase: SupabaseClient;
  brandId: string;
  clientId: string;
  userId: string;
  system?: string;
  prompt: string;
  schema: T;
  /** Contexto extra já montado (estratégia IA, métricas, brain, briefing). */
  extraContext?: string;
}): Promise<PlanAgentResult<z.infer<T>>> {
  // Autorização — membro da marca.
  const { data: member, error: memberErr } = await opts.supabase
    .from("brand_members")
    .select("role")
    .eq("brand_id", opts.brandId)
    .eq("user_id", opts.userId)
    .maybeSingle();
  if (memberErr) throw memberErr;
  if (!member) throw new Error("Você não tem acesso a esta marca");

  // Autorização — cliente pertence à marca.
  const { data: client, error: clientErr } = await opts.supabase
    .from("clients")
    .select("id")
    .eq("id", opts.clientId)
    .eq("brand_id", opts.brandId)
    .maybeSingle();
  if (clientErr) throw clientErr;
  if (!client) throw new Error("Cliente inválido para esta marca");

  let brandBlueprint = "";
  try {
    const { blueprint } = await buildBrandContextBlueprint(
      opts.supabase,
      opts.brandId,
      opts.clientId,
    );
    brandBlueprint = blueprint ?? "";
  } catch (err) {
    console.warn("[runPlanAgent] blueprint failed", err);
  }

  const system = [brandBlueprint, opts.extraContext, opts.system]
    .filter((s): s is string => !!s && s.trim().length > 0)
    .join("\n\n---\n\n");

  // Orçamento — falha aberta em erro de infra, bloqueia quando estourado.
  try {
    const { data: budget, error: budgetErr } = await opts.supabase.rpc(
      "check_ai_usage_budget",
      { _brand_id: opts.brandId, _client_id: opts.clientId, _user_id: opts.userId },
    );
    if (budgetErr) {
      console.warn("[runPlanAgent] budget check failed", budgetErr);
    } else if (budget && (budget as { allowed?: boolean }).allowed === false) {
      const b = budget as { blocked_by?: string; limit_usd?: number; spent_usd?: number };
      throw new Error(
        `ai_budget_exceeded:${b.blocked_by ?? "brand"}:${b.spent_usd ?? 0}:${b.limit_usd ?? 0}`,
      );
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("ai_budget_exceeded")) throw err;
    console.warn("[runPlanAgent] budget check threw", err);
  }

  const { model, modelId } = await getBrandAiModel(opts.supabase, opts.brandId, "text");

  let output: unknown = null;
  let inTok = 0;
  let outTok = 0;
  let success = true;
  let errMsg: string | null = null;

  try {
    const res = await generateText({
      model,
      ...(system ? { system } : {}),
      prompt: opts.prompt,
      output: Output.object({ schema: opts.schema }),
    });
    output = res.output;
    inTok = res.usage?.inputTokens ?? 0;
    outTok = res.usage?.outputTokens ?? 0;
  } catch (error) {
    if (NoObjectGeneratedError.isInstance(error)) {
      const safe = opts.schema.safeParse(tryParseFallback(error.text));
      if (safe.success) {
        output = safe.data;
        inTok = error.usage?.inputTokens ?? 0;
        outTok = error.usage?.outputTokens ?? 0;
      } else {
        success = false;
        errMsg = "Parsing falhou na geração da pauta";
      }
    } else {
      success = false;
      errMsg = error instanceof Error ? error.message : String(error);
    }
    if (!success) {
      await logUsage();
      throw new Error(errMsg ?? "ai_generation_failed");
    }
  }

  await logUsage();
  return { output: output as z.infer<T>, modelId, brandBlueprintUsed: !!brandBlueprint };

  async function logUsage() {
    try {
      const { error } = await opts.supabase.from("brand_ai_usage").insert({
        brand_id: opts.brandId,
        client_id: opts.clientId,
        agent: opts.agent,
        model: modelId,
        input_tokens: inTok,
        output_tokens: outTok,
        cost_usd: estimateCost(modelId, inTok, outTok),
        success,
        error_message: errMsg,
        actor_id: opts.userId,
      });
      if (error) console.warn("[runPlanAgent] brand_ai_usage insert failed", error);
    } catch (e) {
      console.warn("[runPlanAgent] brand_ai_usage insert threw", e);
    }
  }
}
