import { describe, expect, it } from "vitest";
import { toCrossJSONAsync } from "seroval";
import { readFileSync } from "node:fs";
import { installationServerError } from "@/lib/installation/serializable-error";

describe("erros de instalação na fronteira das server functions", () => {
  it("converte falha PostgREST em Error serializável, preservando mensagem e código", async () => {
    const error = installationServerError({ message: "Operação recusada", code: "42501", details: {}, hint: null });
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("Operação recusada (42501)");
    await expect(toCrossJSONAsync(error)).resolves.toBeDefined();
  });

  it("não altera erros nativos e não mostra [object Object] para falhas inesperadas", () => {
    const native = new Error("Falha nativa");
    expect(installationServerError(native)).toBe(native);
    expect(installationServerError({ unexpected: true }).message).toBe("Falha ao consultar a instalação.");
  });

  it("remove propriedades incompatíveis de erros do provedor", async () => {
    class ProviderError extends Error {
      code = "42501";
      cause = { payload: new WeakMap() };
    }
    const error = installationServerError(new ProviderError("Acesso recusado"));
    expect(error.message).toBe("Acesso recusado (42501)");
    expect("cause" in error).toBe(false);
    await expect(toCrossJSONAsync(error)).resolves.toBeDefined();
  });

  it("não encaminha erros brutos do banco nas operações do gerenciador ou executor", () => {
    for (const path of [
      "src/lib/installation/manager.functions.ts",
      "src/lib/installation/runner.server.ts",
    ]) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toMatch(/\bthrow (?:\w+\.)?(?:error|readError|opError|updateError|progressError|installationError|instError);/i);
    }
  });
});