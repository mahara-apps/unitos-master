import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";

it("valida em Postgres isolado prévia, aplicação, idempotência, exceções, destinos, novos clientes e RBAC", () => {
  const output = execFileSync("bash", ["tests/production-stages-local.sh"], { encoding: "utf8", timeout: 9000 });
  expect(output).toContain("PASS: production stages SQL contracts");
});