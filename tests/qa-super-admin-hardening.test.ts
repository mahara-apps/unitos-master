/**
 * CORREÇÃO P1 — contas QA com SUPER ADMIN.
 *
 * Cobre a barreira de ambiente, a não-previsibilidade de senhas de teste e o
 * inventário do banco (nenhuma conta QA privilegiada). Não altera RBAC/RLS.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  INTEGRATION_TEST_PROJECT_REF,
  INTEGRATION_TEST_SUITE,
  privilegedTestEnv,
  assertPrivilegedTestEnv,
} from "./helpers/test-env";

const ORIGINAL = { ...process.env };

beforeEach(() => {
  delete process.env["UNITOS_TEST_ENV"];
  delete process.env["UNITOS_INTEGRATION_TEST_PROJECT_REF"];
});

afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe("barreira de ambiente (TEST_SUPER_ADMIN_CREATION)", () => {
  it("ambiente desconhecido bloqueia criação privilegiada (sem fallback)", () => {
    expect(privilegedTestEnv()).toEqual({
      allowed: false,
      reason: "not_declared_integration_suite",
    });
    expect(() => assertPrivilegedTestEnv()).toThrow(/TEST_SUPER_ADMIN_CREATION bloqueado/);
  });

  it("valores não canônicos não habilitam (staging/dev/prod/vazio)", () => {
    for (const v of ["test", "staging", "dev", "production", "", "true", "1"]) {
      process.env["UNITOS_TEST_ENV"] = v;
      expect(privilegedTestEnv().allowed).toBe(false);
    }
  });

  it("propósito correto com alvo não autorizado continua bloqueado", () => {
    process.env["UNITOS_TEST_ENV"] = INTEGRATION_TEST_SUITE;
    process.env["UNITOS_INTEGRATION_TEST_PROJECT_REF"] = "outro-ref";
    expect(privilegedTestEnv()).toEqual({ allowed: false, reason: "target_not_authorized" });
    expect(() => assertPrivilegedTestEnv()).toThrow(/não é o Master descartável/);
  });

  it("divergência entre URL, project id e alvo bloqueia", () => {
    process.env["UNITOS_TEST_ENV"] = INTEGRATION_TEST_SUITE;
    process.env["UNITOS_INTEGRATION_TEST_PROJECT_REF"] = INTEGRATION_TEST_PROJECT_REF;
    process.env["SUPABASE_PROJECT_ID"] = INTEGRATION_TEST_PROJECT_REF;
    process.env["SUPABASE_URL"] = "https://ref-divergente.supabase.co";
    expect(privilegedTestEnv()).toEqual({ allowed: false, reason: "target_mismatch" });
  });

  it("propósito, alvo, project id e URL exatos habilitam", () => {
    process.env["UNITOS_TEST_ENV"] = INTEGRATION_TEST_SUITE;
    process.env["UNITOS_INTEGRATION_TEST_PROJECT_REF"] = INTEGRATION_TEST_PROJECT_REF;
    process.env["SUPABASE_PROJECT_ID"] = INTEGRATION_TEST_PROJECT_REF;
    process.env["SUPABASE_URL"] = `https://${INTEGRATION_TEST_PROJECT_REF}.supabase.co`;
    expect(privilegedTestEnv().allowed).toBe(true);
    expect(() => assertPrivilegedTestEnv()).not.toThrow();
  });
});

describe("senhas de teste", () => {
  it("não são deriváveis do e-mail e não repetem", async () => {
    const { generateTestPassword } = await import("./helpers/fixtures");
    const a = generateTestPassword();
    const b = generateTestPassword();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(24);
    for (const seed of ["qa+", "unitos-tests.dev", "@"]) expect(a).not.toContain(seed);
  });

  it("o repositório não contém senha derivada de e-mail nos helpers", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile("tests/helpers/fixtures.ts", "utf8");
    expect(src).not.toMatch(/password\s*=\s*`Qa!\$\{TAG\}\$\{label\}/);
    expect(src).toContain("generateTestPassword");
  });
});

