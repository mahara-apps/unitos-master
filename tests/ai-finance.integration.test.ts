import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, seed, cleanup, type Fixture } from "./helpers/fixtures";
import { callRpc } from "@/lib/supabase-rpc";

let fx: Fixture;
beforeAll(async () => { fx = await seed(); }, 120_000);
afterAll(async () => { await cleanup(fx); }, 120_000);

describe("finanças de IA por workspace", () => {
  it("bloqueia apenas o provedor e deduplica notificações", async () => {
    for (let i = 0; i < 2; i++) {
      expect((await callRpc(admin, "ai_finance_block", { _brand: fx.brandId, _provider: "anthropic", _reason: "provider_credit" })).error).toBeNull();
    }
    const states = await admin.from("ai_provider_finance").select("provider,blocked,generation").eq("brand_id", fx.brandId);
    expect(states.error).toBeNull();
    expect(states.data).toEqual([{provider: "anthropic", blocked: true, generation: 1}]);
    const events = await admin.from("ai_finance_alert_events").select("event_key").eq("brand_id", fx.brandId).like("event_key", "provider:%");
    expect(events.error).toBeNull(); expect(events.data).toHaveLength(1);
    const forbidden = await callRpc(fx.userA.client, "ai_finance_block", { _brand: fx.brandId, _provider: "groq", _reason: "provider_credit" });
    expect(forbidden.error).not.toBeNull();
    const tamper = await fx.userA.client.from("ai_provider_finance").update({blocked:false}).eq("brand_id",fx.brandId);
    expect(tamper.error).not.toBeNull();
  });
  it("alerta por orçamento sem página aberta e sem repetir a faixa", async () => {
    const connection = await admin.from("brand_connections").upsert({brand_id:fx.brandId, monthly_budget_usd:10});
    expect(connection.error).toBeNull();
    const usage = await admin.from("brand_ai_usage").insert({brand_id:fx.brandId, model:"gpt-5-mini", provider:"openai", cost_usd:8, input_tokens:0, output_tokens:0, success:true});
    expect(usage.error).toBeNull();
    expect((await callRpc(admin,"ai_budget_evaluate",{_brand:fx.brandId})).error).toBeNull();
    const events = await admin.from("ai_finance_alert_events").select("event_key").eq("brand_id",fx.brandId).like("event_key","budget:%");
    expect(events.error).toBeNull(); expect(events.data).toHaveLength(1);
    expect(events.data?.[0]?.event_key.endsWith(":80")).toBe(true);
    const forbidden = await fx.userA.client.from("ai_budget_alert_settings").upsert({brand_id:fx.brandId,thresholds:[50,70,90]});
    expect(forbidden.error).not.toBeNull();
    const invalid = await admin.from("ai_budget_alert_settings").upsert({brand_id:fx.brandId,thresholds:[95,80,100]});
    expect(invalid.error).not.toBeNull();
  });
});