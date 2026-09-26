import { describe, expect, it } from "vitest";
import { toCrossJSONAsync } from "seroval";
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
});