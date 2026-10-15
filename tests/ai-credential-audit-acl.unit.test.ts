import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Instalações clientes concedem escrita a `authenticated` em toda tabela nova;
// o histórico de chaves precisa revogar isso explicitamente (falha da Casa 8 em 1.4.75).
describe("ai_credential_audit ACL no pacote cliente", () => {
  const delta = readFileSync("supabase/baseline-snapshot/007_delta_migrations.sql", "utf8");
  it("revoga INSERT/UPDATE/DELETE de authenticated", () => {
    expect(delta).toMatch(
      /REVOKE INSERT, UPDATE, DELETE[^;]*ON public\.ai_credential_audit FROM authenticated/,
    );
  });
});
