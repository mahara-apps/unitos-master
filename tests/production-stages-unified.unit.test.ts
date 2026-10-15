import { describe, expect, it } from "vitest";
import { autoProductionMapping, defaultProductionStages, type ProductionPreview } from "@/lib/production-stages";
import { stageBucketOrder } from "@/lib/agency-content.functions";

const stageId = "11111111-1111-4111-8111-111111111111";
const preview = (label: string): ProductionPreview => ({ fingerprint: "f", blocked: true, clients: [{
  clientId: "22222222-2222-4222-8222-222222222222", name: "Marajoara", pipelineId: null, skipped: false, exception: true,
  changes: [{ kind: "remove", label, stageId, posts: 3 }],
}] });

describe("etapas únicas do workspace", () => {
  it("liga etapa removida à etapa do padrão com o mesmo nome", () => {
    expect(autoProductionMapping(preview("  design "), defaultProductionStages())).toEqual({ [stageId]: "design" });
  });
  it("não inventa destino quando o nome não existe no padrão", () => {
    expect(autoProductionMapping(preview("Copy"), defaultProductionStages())).toEqual({});
  });
  it("Kanban geral segue a ordem do padrão, não a ordem fixa antiga", () => {
    const labels = ["Backlog", "Copy", "Aprovado", "Ideia"];
    expect(stageBucketOrder("Ideia", labels)).toBe(3);
    expect(stageBucketOrder("copy", labels)).toBe(1);
    expect(stageBucketOrder("Revisão", labels)).toBeGreaterThan(labels.length);
  });
});
