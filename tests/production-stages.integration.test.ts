import { beforeAll, afterAll, expect, it } from "vitest";
import { seed, cleanup, type Fixture } from "./helpers/fixtures";
import { callRpc } from "@/lib/supabase-rpc";
import { defaultProductionStages, productionPreviewSchema } from "@/lib/production-stages";

let fx: Fixture;
beforeAll(async () => { fx = await seed(); });
afterAll(async () => { if (fx) await cleanup(fx); });

it("Owner aplica o padrão revisado sem duplicar quadros ao repetir a operação", async () => {
  const stages = defaultProductionStages();
  const args = { _brand: fx.brandId, _stages: stages, _keep_exceptions: false, _mapping: {} };
  const initial = await callRpc(fx.userOwner.client, "production_stages_preview", args);
  expect(initial.error).toBeNull();
  const preview = productionPreviewSchema.parse(initial.data);
  const before = await fx.userOwner.client.from("production_stage_defaults").select("brand_id").eq("brand_id", fx.brandId);
  expect(before.error).toBeNull();
  expect(before.data).toEqual([]);
  const request = { ...args, _fingerprint: preview.fingerprint, _operation: crypto.randomUUID() };
  const result = await callRpc(fx.userOwner.client, "production_stages_apply", request);
  expect(result.error).toBeNull();
  const again = await callRpc(fx.userOwner.client, "production_stages_apply", request);
  expect(again.error).toBeNull();
  expect(again.data).toEqual(result.data);
  const pipes = await fx.userOwner.client.from("content_pipelines").select("id,client_id,follows_brand_default").eq("brand_id", fx.brandId).eq("is_default", true);
  expect(pipes.error).toBeNull();
  expect(pipes.data?.filter((p) => p.client_id === fx.clientA)).toHaveLength(1);
  expect(pipes.data?.every((p) => p.follows_brand_default)).toBe(true);
});

it("Manager não pode editar o padrão nem aplicar alterações globais", async () => {
  const result = await callRpc(fx.userManager.client, "production_stages_save", { _brand: fx.brandId, _stages: defaultProductionStages() });
  expect(result.error?.message).toContain("production_stages_forbidden");
});