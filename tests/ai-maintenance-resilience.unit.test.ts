import { afterEach, describe, expect, it, vi } from "vitest";
import { assertAiBudget } from "@/lib/ai-budget.server";
import { verifyProviderKey } from "@/lib/ai-provider-verify.server";
import { listProviderModels } from "@/lib/ai-model-health.server";
import { invalidateCatalogCache, resolveModel, saveCatalogOverride } from "@/lib/ai-models-catalog.server";
import { recordAiUsage, estimateCost } from "@/lib/ai-usage.server";

const db = vi.hoisted(() => ({ error: null as { message: string } | null, data: [] as unknown[] }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {
  from: () => ({ select: async () => ({ ...db }), insert: async () => ({ ...db }), upsert: async () => ({ ...db }) }),
} }));

afterEach(() => { vi.unstubAllGlobals(); invalidateCatalogCache(); db.error = null; db.data = []; });

describe("manutenção IA — orçamento sem bypass", () => {
  it.each([
    { data: null, error: null },
    { data: { allowed: "true" }, error: null },
    { data: { allowed: true }, error: { message: "offline" } },
  ])("rejeita resposta incompleta ou erro de leitura: %j", async (result) => {
    const client = { rpc: vi.fn().mockResolvedValue(result) };
    await expect(assertAiBudget(client, "workspace")).rejects.toThrow("ai_budget_check_failed");
  });
  it("rejeita falha de transporte", async () => {
    await expect(assertAiBudget({ rpc: vi.fn().mockRejectedValue(new Error("offline")) }, "workspace")).rejects.toThrow("ai_budget_check_failed");
  });
  it("preserva bloqueio do limite e contexto", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { allowed: false, blocked_by: "user", spent_usd: 10, limit_usd: 5 }, error: null });
    await expect(assertAiBudget({ rpc }, "workspace", { userId: "user", clientId: "client" })).rejects.toThrow("ai_budget_exceeded:user:10:5");
    expect(rpc).toHaveBeenCalledWith("check_ai_usage_budget", { _brand_id: "workspace", _client_id: "client", _user_id: "user" });
  });
  it("permite somente autorização confirmada", async () => {
    await expect(assertAiBudget({ rpc: vi.fn().mockResolvedValue({ data: { allowed: true }, error: null }) }, "workspace")).resolves.toBeUndefined();
  });
});

describe.each(["openai", "anthropic", "gemini", "groq"] as const)("verificação %s", (provider) => {
  it.each(["not json", "{}", '{"data":{},"models":{}}', '{"data":[{}],"models":[{}]}'])("não aprova resposta inválida %s", async (body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body)));
    expect((await verifyProviderKey(provider, "test-key")).status).toBe("unverified");
  });
  it("distingue lista realmente vazia de erro", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [], models: [] }))));
    expect(await verifyProviderKey(provider, "test-key")).toMatchObject({ status: "valid", models: [] });
  });
  it.each([401, 403, 429, 503])("classifica HTTP %s sem falso sucesso", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status })));
    expect((await verifyProviderKey(provider, "test-key")).status).toBe(status === 401 || status === 403 ? "invalid" : "unverified");
  });
  it("listagem falha explicitamente em erro de rede", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(listProviderModels(provider, "test-key")).rejects.toThrow("ai_model_listing_failed");
  });
  it("listagem inválida não se transforma em ausência", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}")));
    await expect(listProviderModels(provider, "test-key")).rejects.toThrow("ai_model_listing_failed");
  });
});

describe("catálogo e consumo confirmado", () => {
  it("não escolhe modelo padrão se o banco falhar", async () => {
    db.error = { message: "offline" };
    await expect(resolveModel("openai")).rejects.toThrow("ai_catalog_read_failed");
  });
  it("ignora overrides legados de imagem sem excluir dados", async () => {
    db.data = [{ provider: "openai", role: "image", model_id: "dall-e-3" }];
    expect(await resolveModel("openai")).toBe("gpt-5-mini");
  });
  it("não confirma promoção se gravação falhar", async () => {
    db.error = { message: "offline" };
    await expect(saveCatalogOverride({ provider: "openai", role: "operational", modelId: "gpt-5-mini", replacedModelId: "old" })).rejects.toThrow("ai_catalog_write_failed");
  });
  it("consumo estrito não confirma sucesso sem registro", async () => {
    db.error = { message: "offline" };
    await expect(recordAiUsage({ brandId: "workspace", model: "gpt-5-mini", inputTokens: 1, outputTokens: 1, success: true }, true)).rejects.toThrow("ai_usage_record_failed");
  });
  it("embeddings usam seu custo de entrada, não preço de geração de texto", () => {
    expect(estimateCost("text-embedding-3-small", 1_000_000, 0)).toBe(0.02);
    expect(estimateCost("gemini-embedding-001", 1_000_000, 0)).toBe(0.15);
  });
});