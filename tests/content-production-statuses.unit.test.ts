import { describe, expect, it } from "vitest";
import { defaultProductionStages, productionStagesSchema } from "@/lib/production-stages";
import { workspaceAdminActions } from "@/lib/workspace-admin";

describe("status canônicos de produção de conteúdo", () => {
  it("marca conclusão na etapa existente sem mudar identidade ou aprovação", () => {
    const original = defaultProductionStages();
    const result = productionStagesSchema.parse(original.map((stage) => ({
      ...stage, is_terminal: stage.key === "writing",
    })));
    expect(result.find((stage) => stage.key === "writing")?.is_terminal).toBe(true);
    expect(result.map((stage) => stage.key)).toEqual(original.map((stage) => stage.key));
    expect(result.map((stage) => stage.enables_approval_link)).toEqual(original.map((stage) => stage.enables_approval_link));
    expect(original.find((stage) => stage.key === "writing")?.is_terminal).toBe(false);
  });
  it("permite remover a marca de conclusão sem remover a etapa", () => {
    const result = productionStagesSchema.parse(defaultProductionStages().map((stage) => ({ ...stage, is_terminal: false })));
    expect(result).toHaveLength(6);
    expect(result.every((stage) => !stage.is_terminal)).toBe(true);
  });
  it.each(["owner", "admin", "super_admin"])("autoriza %s a configurar o grupo", (role) => {
    expect(workspaceAdminActions(role === "super_admin" ? "super_admin" : "admin", role).canConfigure).toBe(true);
  });
  it.each(["manager", "user"] as const)("mantém %s em leitura", (role) => {
    expect(workspaceAdminActions(role, role).canConfigure).toBe(false);
  });
  it("não autoriza enquanto o papel não foi comprovado", () => {
    expect(workspaceAdminActions(null, null).canConfigure).toBe(false);
  });
});