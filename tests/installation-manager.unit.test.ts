import { describe, expect, it } from "vitest";

import {
  MASTER_RELEASE_VERSION,
  canRetryFailedProvision,
  canStartOperation,
  findSensitiveInput,
  healthAfterOperation,
  isMasterInstallation,
  isUpdateAvailable,
  runningStatusFor,
  slugifyInstallation,
  statusAfterOperation,
  validateInstallationInput,
} from "@/lib/installation/manager-contract";

describe("Installation Manager — disponível somente no MASTER", () => {
  it("reconhece o MASTER pelo Supabase/domínio", () => {
    expect(isMasterInstallation({ supabaseUrl: "https://tkjbhttylouamqxnbfgv.supabase.co" })).toBe(
      true,
    );
    expect(isMasterInstallation({ appUrl: "https://unitos-master.lovable.app" })).toBe(true);
  });

  it("instalação cliente NÃO tem o módulo", () => {
    expect(
      isMasterInstallation({
        supabaseUrl: "https://abcdefghijklmnop.supabase.co",
        appUrl: "https://app.cliente.com.br",
      }),
    ).toBe(false);
  });

  it("role=client desliga o módulo mesmo no banco do MASTER", () => {
    expect(
      isMasterInstallation({
        supabaseUrl: "https://tkjbhttylouamqxnbfgv.supabase.co",
        role: "client",
      }),
    ).toBe(false);
  });

  it("fail-closed sem ambiente algum", () => {
    expect(isMasterInstallation({})).toBe(false);
  });
});

describe("criação de instalação", () => {
  it("aceita metadados de uma instalação independente", () => {
    const r = validateInstallationInput({
      name: "Agência Alfa",
      domain: "app.alfa.com.br",
      supabaseUrl: "https://alfaprojectref.supabase.co",
      gitRepoUrl: "https://github.com/alfa/unitos",
      deployProject: "alfa-prod",
    });
    expect(r).toEqual({ ok: true, slug: "agencia-alfa" });
  });

  it("recusa nome curto e gera slug estável", () => {
    expect(validateInstallationInput({ name: "AB" }).ok).toBe(false);
    expect(slugifyInstallation("Instalação São Paulo")).toBe("instalacao-sao-paulo");
  });

  it("recusa domínio ou URL inválidos", () => {
    expect(validateInstallationInput({ name: "Alfa Um", domain: "localhost" }).ok).toBe(false);
    expect(validateInstallationInput({ name: "Alfa Um", supabaseUrl: "não-url" }).ok).toBe(false);
  });

  it("nunca aceita secrets/credenciais do destino", () => {
    expect(findSensitiveInput({ name: "X", notes: "SERVICE_ROLE=abc" })).toBe("service_role");
    const r = validateInstallationInput({
      name: "Agência Beta",
      notes: "cron_secret: 12345678901234567890",
    });
    expect(r.ok).toBe(false);
  });
});

describe("isolamento entre instalações", () => {
  it("recusa reuso do Supabase do MASTER", () => {
    const r = validateInstallationInput({
      name: "Agência Gama",
      supabaseUrl: "https://tkjbhttylouamqxnbfgv.supabase.co",
    });
    expect(r.ok).toBe(false);
  });

  it("recusa reuso do domínio do MASTER", () => {
    const r = validateInstallationInput({
      name: "Agência Delta",
      domain: "unitos-master.lovable.app",
    });
    expect(r.ok).toBe(false);
  });
});

describe("estados do provisionamento", () => {
  it("provisionar só a partir de estados elegíveis", () => {
    expect(canStartOperation("provision", "preparing")).toBe(true);
    expect(canStartOperation("provision", "error")).toBe(true);
    expect(canStartOperation("provision", "provisioning")).toBe(false);
    expect(canStartOperation("update", "preparing")).toBe(false);
    expect(canStartOperation("validate", "validating")).toBe(false);
  });

  it("permite atualizar após validação falhar por schema antigo", () => {
    expect(canStartOperation("update", "error")).toBe(true);
    expect(canStartOperation("update", "updating")).toBe(false);
  });

  it("retry terminal aceita error ou update_available somente sem provision concluído/ativo", () => {
    const failed = { id: "failed-op", kind: "provision" as const, status: "failed" as const };
    expect(
      canRetryFailedProvision({
        installationStatus: "update_available",
        lastProvisionOperation: failed,
      }),
    ).toBe(true);
    expect(
      canRetryFailedProvision({ installationStatus: "error", lastProvisionOperation: failed }),
    ).toBe(true);
    expect(
      canRetryFailedProvision({
        installationStatus: "update_available",
        lastProvisionOperation: failed,
        activeOperationId: "live-op",
      }),
    ).toBe(false);
    expect(
      canRetryFailedProvision({
        installationStatus: "update_available",
        lastProvisionOperation: failed,
        lastProvisionedAt: "2026-09-16T12:00:00.000Z",
      }),
    ).toBe(false);
    expect(
      canRetryFailedProvision({
        installationStatus: "update_available",
        lastProvisionOperation: failed,
        hasSuccessfulProvision: true,
      }),
    ).toBe(false);
  });

  it("update_available sem provision failed continua bloqueado para provision", () => {
    expect(canStartOperation("provision", "update_available")).toBe(false);
    expect(
      canRetryFailedProvision({
        installationStatus: "update_available",
        lastProvisionOperation: {
          id: "update-op",
          kind: "update",
          status: "failed",
        },
      }),
    ).toBe(false);
  });

  it("UPDATE preserva os estados elegíveis anteriores", () => {
    expect(canStartOperation("update", "update_available")).toBe(true);
    expect(canStartOperation("update", "error")).toBe(true);
    expect(canStartOperation("update", "preparing")).toBe(false);
  });

  it("estado em execução por tipo de operação", () => {
    expect(runningStatusFor("provision")).toBe("provisioning");
    expect(runningStatusFor("update")).toBe("updating");
    expect(runningStatusFor("validate")).toBe("validating");
  });

  it("falha vira erro e saúde falhando", () => {
    expect(statusAfterOperation("provision", { ok: false })).toBe("error");
    expect(healthAfterOperation({ ok: false })).toBe("failing");
  });

  it("sucesso com ressalvas vira atenção", () => {
    expect(
      statusAfterOperation("validate", {
        ok: true,
        warnings: true,
        version: MASTER_RELEASE_VERSION,
      }),
    ).toBe("attention");
    expect(healthAfterOperation({ ok: true, warnings: true })).toBe("degraded");
  });

  it("sucesso sem versão reportada vira atenção", () => {
    expect(statusAfterOperation("provision", { ok: true, version: null })).toBe("attention");
  });
});

describe("versão da instalação", () => {
  it("versão igual ao release = atualizada", () => {
    expect(statusAfterOperation("validate", { ok: true, version: MASTER_RELEASE_VERSION })).toBe(
      "up_to_date",
    );
    expect(isUpdateAvailable(MASTER_RELEASE_VERSION)).toBe(false);
  });

  it("versão antiga = atualização disponível", () => {
    expect(statusAfterOperation("validate", { ok: true, version: "2026.08.0" })).toBe(
      "update_available",
    );
    expect(isUpdateAvailable("2026.08.0")).toBe(true);
  });

  it("sem versão conhecida não sinaliza atualização", () => {
    expect(isUpdateAvailable(null)).toBe(false);
  });
});
