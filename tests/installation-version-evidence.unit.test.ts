import { describe, expect, it } from "vitest";

import { versionForCompletedOperation } from "@/lib/installation/runner.server";

describe("promoção de versão exige evidência completa", () => {
  it("não promove quando faltam etapas ou a operação falha", () => {
    expect(
      versionForCompletedOperation({ kind: "update", acceptedSuccess: false, version: "1.3.97" }),
    ).toBeNull();
    expect(
      versionForCompletedOperation({
        kind: "provision",
        acceptedSuccess: false,
        version: "1.3.97",
      }),
    ).toBeNull();
  });

  it("não promove validação e promove somente NEW/UPDATE concluído", () => {
    expect(
      versionForCompletedOperation({ kind: "validate", acceptedSuccess: true, version: "1.3.97" }),
    ).toBeNull();
    expect(
      versionForCompletedOperation({ kind: "update", acceptedSuccess: true, version: "1.3.97" }),
    ).toBe("1.3.97");
  });
});
