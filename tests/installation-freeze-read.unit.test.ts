import { describe, expect, it, vi } from "vitest";

import {
  assertInstallationOperationsWritable,
  isInstallationOperationsFreezeMissing,
  readInstallationOperationsFreezeForListing,
} from "@/lib/installation/freeze.server";

function clientWith(result: { data: unknown; error: unknown }) {
  return { rpc: vi.fn().mockResolvedValue(result) };
}

const inactive = {
  frozen: false,
  generation: 4,
  reason: null,
  changedBy: null,
  changedAt: null,
};

describe("leitura compatível do congelamento global", () => {
  it("distingue freeze inativo", async () => {
    await expect(
      readInstallationOperationsFreezeForListing(clientWith({ data: inactive, error: null })),
    ).resolves.toEqual({ status: "inactive", state: inactive });
  });

  it("distingue freeze ativo", async () => {
    const active = { ...inactive, frozen: true, reason: "recovery" };
    await expect(
      readInstallationOperationsFreezeForListing(clientWith({ data: active, error: null })),
    ).resolves.toEqual({ status: "active", state: active });
  });

  it.each([
    { code: "PGRST202", message: "Could not find the function in the schema cache" },
    { code: "42883", message: "function read_installation_operations_freeze does not exist" },
    { code: "42P01", message: 'relation "installation_operations_freeze" does not exist' },
  ])("permite somente leitura quando os objetos não existem: $code", async (error) => {
    expect(isInstallationOperationsFreezeMissing(error)).toBe(true);
    await expect(
      readInstallationOperationsFreezeForListing(clientWith({ data: null, error })),
    ).resolves.toEqual({ status: "unavailable", reason: "objects_missing" });
  });

  it.each([
    { code: "42501", message: "permission denied" },
    { code: "PGRST301", message: "JWT expired" },
    { code: "XX000", message: "database error" },
  ])("não mascara erro real de leitura ou autorização: $code", async (error) => {
    expect(isInstallationOperationsFreezeMissing(error)).toBe(false);
    await expect(
      readInstallationOperationsFreezeForListing(clientWith({ data: null, error })),
    ).rejects.toThrow("Não foi possível consultar o estado do congelamento global.");
  });

  it("não classifica mensagem genérica de objeto ausente sem identificar a RPC", () => {
    expect(isInstallationOperationsFreezeMissing({ message: "relation unrelated does not exist" })).toBe(
      false,
    );
  });

  it("rejeita payload inválido", async () => {
    await expect(
      readInstallationOperationsFreezeForListing(
        clientWith({ data: { frozen: "false", generation: 4 }, error: null }),
      ),
    ).rejects.toThrow("Estado do congelamento global inválido; operação bloqueada.");
  });
});

describe("escritas permanecem fail-closed", () => {
  it("bloqueia quando a RPC está ausente", async () => {
    await expect(
      assertInstallationOperationsWritable(
        clientWith({ data: null, error: { code: "PGRST202", message: "missing" } }),
      ),
    ).rejects.toThrow("Estado do congelamento global indisponível; operação bloqueada.");
  });

  it("bloqueia quando o freeze está ativo", async () => {
    await expect(
      assertInstallationOperationsWritable(
        clientWith({ data: { ...inactive, frozen: true }, error: null }),
      ),
    ).rejects.toThrow("Installation Manager congelado globalmente");
  });

  it("bloqueia erro de autorização e payload inválido", async () => {
    await expect(
      assertInstallationOperationsWritable(
        clientWith({ data: null, error: { code: "42501", message: "permission denied" } }),
      ),
    ).rejects.toThrow("operação bloqueada");
    await expect(
      assertInstallationOperationsWritable(
        clientWith({ data: { frozen: false }, error: null }),
      ),
    ).rejects.toThrow("operação bloqueada");
  });

  it("libera escrita somente com freeze válido e inativo", async () => {
    await expect(
      assertInstallationOperationsWritable(clientWith({ data: inactive, error: null })),
    ).resolves.toBeUndefined();
  });
});