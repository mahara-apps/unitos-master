import { describe, expect, it } from "vitest";
import { defaultProductionStages, needsProductionDestination, productionStagesSchema, type ProductionPreview } from "@/lib/production-stages";

describe("padrão de etapas de produção", () => {
  it("preserva chaves estáveis ao renomear uma etapa", () => {
    const stages = defaultProductionStages();
    const first = stages[0];
    if (!first) throw new Error("fixture inválido");
    first.label = "Entrada";
    expect(productionStagesSchema.parse(stages)[0]?.key).toBe("briefing");
  });
  it("rejeita chaves duplicadas que fundiriam colunas", () => {
    const first = defaultProductionStages()[0];
    expect(productionStagesSchema.safeParse([first, first]).success).toBe(false);
  });
  it("não permite remover a última etapa", () => {
    expect(productionStagesSchema.safeParse([]).success).toBe(false);
  });
  const stageId = "00000000-0000-4000-8000-000000000001";
  const preview: ProductionPreview = { fingerprint: "snapshot", blocked: true, clients: [{ clientId: "00000000-0000-4000-8000-000000000002", pipelineId: null, name: "QA", skipped: false, exception: false, changes: [{ kind: "remove", label: "Antiga", stageId, posts: 3 }] }] };
  it("exige destino explícito quando três peças mudariam de coluna", () => {
    expect(needsProductionDestination(preview, defaultProductionStages(), {})).toBe(true);
  });
  it("aceita apenas um destino presente no padrão", () => {
    expect(needsProductionDestination(preview, defaultProductionStages(), { [stageId]: "inexistente" })).toBe(true);
    expect(needsProductionDestination(preview, defaultProductionStages(), { [stageId]: "writing" })).toBe(false);
  });
  it("não exige movimentação nas exceções preservadas", () => {
    const skipped = { ...preview, clients: preview.clients.map((c) => ({ ...c, skipped: true })) };
    expect(needsProductionDestination(skipped, defaultProductionStages(), {})).toBe(false);
  });
});