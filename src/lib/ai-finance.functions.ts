import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callRpc } from "./supabase-rpc";

const scope = z.object({ brandId: z.string().uuid() });

export const getAiFinance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth]).inputValidator((v) => scope.parse(v))
  .handler(async ({ data, context }) => {
    const [states, settings, members, superAdmin] = await Promise.all([
      context.supabase.from("ai_provider_finance").select("provider,blocked,reason,updated_at").eq("brand_id", data.brandId),
      context.supabase.from("ai_budget_alert_settings").select("thresholds").eq("brand_id", data.brandId).maybeSingle(),
      context.supabase.from("brand_members").select("role,is_active").eq("brand_id", data.brandId).eq("user_id", context.userId).maybeSingle(),
      callRpc<boolean>(context.supabase, "is_super_admin", { _user_id: context.userId }),
    ]);
    if (states.error || settings.error || members.error || superAdmin.error) throw new Error("Não foi possível consultar os avisos de IA.");
    const canManage = superAdmin.data === true || (members.data?.is_active === true && ["owner", "admin"].includes(members.data.role));
    return { states: states.data ?? [], thresholds: settings.data?.thresholds ?? [80, 95, 100], canManage };
  });

export const saveAiBudgetThresholds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => scope.extend({ thresholds: z.tuple([z.number().int().min(1).max(100), z.number().int().min(1).max(100), z.number().int().min(1).max(100)])
    .refine(([a,b,c]) => a < b && b < c, "As faixas devem ser crescentes.") }).parse(v))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("ai_budget_alert_settings").upsert({ brand_id: data.brandId, thresholds: data.thresholds });
    if (error) throw new Error("Não foi possível salvar as faixas. Somente administradores podem alterá-las.");
    return { ok: true };
  });

export const verifyAiFinancialAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => scope.extend({ provider: z.enum(["openai", "anthropic", "gemini", "groq"]), confirmPaidCheck: z.literal(true) }).parse(v))
  .handler(async ({ data, context }) => {
    const [member, superAdmin] = await Promise.all([
      context.supabase.from("brand_members").select("role,is_active").eq("brand_id", data.brandId).eq("user_id", context.userId).maybeSingle(),
      callRpc<boolean>(context.supabase, "is_super_admin", { _user_id: context.userId }),
    ]);
    if (member.error || superAdmin.error || !(superAdmin.data === true || (member.data?.is_active && ["owner", "admin"].includes(member.data.role)))) throw new Error("Somente administradores podem verificar a disponibilidade financeira.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: state, error: stateError } = await supabaseAdmin.from("ai_provider_finance").select("generation,updated_at").eq("brand_id", data.brandId).eq("provider", data.provider).maybeSingle();
    if (stateError || !state) throw new Error("Atualize os avisos antes de verificar novamente.");
    const { data: credential, error } = await supabaseAdmin.from("brand_api_credentials").select("ciphertext").eq("brand_id", data.brandId).eq("provider", data.provider).maybeSingle();
    if (error || !credential) throw new Error("Chave de IA não encontrada. Verifique Conexões.");
    const { decryptCredential } = await import("./credentials-crypto.server");
    const { instantiateProviderModel } = await import("./ai-provider.server");
    const { resolveModel } = await import("./ai-models-catalog.server");
    const { recordAiUsage } = await import("./ai-usage.server");
    const { captureProviderFinance } = await import("./ai-finance.server");
    const { classifyAiError, userFacingAiError } = await import("./ai-failures.server");
    const { streamText } = await import("ai");
    const modelId = await resolveModel(data.provider, "operational");
    if (!modelId) throw new Error("Modelo de verificação indisponível.");
    try {
      const result = streamText({ model: instantiateProviderModel(data.provider, await decryptCredential(credential.ciphertext), modelId), prompt: "Responda apenas: OK", maxRetries: 0, maxOutputTokens: 32, abortSignal: AbortSignal.timeout(20_000) });
      const text = await result.text;
      const finish = await result.finishReason;
      if (!text.trim() || finish === "content-filter") throw new Error("A IA não confirmou disponibilidade de geração.");
      const usage = await result.usage;
      await recordAiUsage({ brandId: data.brandId, model: modelId, provider: data.provider, success: true, inputTokens: usage.inputTokens ?? 0, outputTokens: usage.outputTokens ?? 0, userId: context.userId, agent: "finance.verify" });
      const cleared = await supabaseAdmin.from("ai_provider_finance").update({ blocked: false, reason: null }).eq("brand_id", data.brandId).eq("provider", data.provider).eq("generation", state.generation).eq("updated_at", state.updated_at).select("provider");
      if (cleared.error || cleared.data?.length !== 1) throw new Error("O estado da IA mudou durante a verificação. Atualize os avisos.");
      return { ok: true };
    } catch (error) {
      const financial = await captureProviderFinance(data.brandId, data.provider, error);
      if (financial) { await recordAiUsage({ brandId: data.brandId, model: modelId, provider: data.provider, success: false, inputTokens: 0, outputTokens: 0, errorKind: classifyAiError(error).kind, userId: context.userId, agent: "finance.verify" }); throw financial; }
      const { kind } = classifyAiError(error);
      await recordAiUsage({ brandId: data.brandId, model: modelId, provider: data.provider, success: false, inputTokens: 0, outputTokens: 0, errorKind: kind, userId: context.userId, agent: "finance.verify" });
      throw new Error(userFacingAiError(error).body);
    }
  });