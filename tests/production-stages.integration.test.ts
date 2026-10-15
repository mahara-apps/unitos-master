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

it("conclusão de conteúdo salva o padrão e só altera o quadro após prévia e aplicação", async () => {
  const stages = defaultProductionStages().map((stage) => ({ ...stage, is_terminal: stage.key === "writing" }));
  const before = await fx.userOwner.client.from("content_pipelines").select("id").eq("brand_id", fx.brandId).eq("client_id", fx.clientA).eq("is_default", true).single();
  expect(before.error).toBeNull();
  if (!before.data) throw new Error("Quadro de teste ausente");
  const initial = await fx.userOwner.client.from("content_pipeline_stages").select("id,is_terminal").eq("pipeline_id", before.data.id).eq("key", "writing").single();
  expect(initial.error).toBeNull();
  if (!initial.data) throw new Error("Etapa de teste ausente");
  const saved = await callRpc(fx.userOwner.client, "production_stages_save", { _brand: fx.brandId, _stages: stages });
  expect(saved.error).toBeNull();
  const unchanged = await fx.userOwner.client.from("content_pipeline_stages").select("is_terminal").eq("id", initial.data.id).single();
  expect(unchanged.error).toBeNull();
  expect(unchanged.data?.is_terminal).toBe(initial.data.is_terminal);
  const args = { _brand: fx.brandId, _stages: stages, _keep_exceptions: false, _mapping: {} };
  const proposal = await callRpc(fx.userOwner.client, "production_stages_preview", args);
  expect(proposal.error).toBeNull();
  const preview = productionPreviewSchema.parse(proposal.data);
  const applied = await callRpc(fx.userOwner.client, "production_stages_apply", { ...args, _fingerprint: preview.fingerprint, _operation: crypto.randomUUID() });
  expect(applied.error).toBeNull();
  const result = await fx.userOwner.client.from("content_pipeline_stages").select("id,is_terminal").eq("id", initial.data.id).single();
  expect(result.error).toBeNull();
  expect(result.data).toEqual({ id: initial.data.id, is_terminal: true });
});