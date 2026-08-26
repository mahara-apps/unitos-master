import { describe, it, expect, beforeEach } from "vitest";
import {
  isIdentityChange,
  isWorkspaceScopedQueryKey,
  WORKSPACE_STABLE_QUERY_KEYS,
} from "@/lib/session-reset";
import {
  __resetActiveWorkspace,
  getActiveWorkspace,
  publishActiveWorkspace,
  markActiveWorkspaceUnresolved,
} from "@/lib/active-workspace";

const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";

describe("PERF2 — identidade e SIGNED_IN", () => {
  it("Teste 1 — SIGNED_IN da mesma identidade não é troca de identidade", () => {
    expect(isIdentityChange("SIGNED_IN", U1, U1)).toBe(false);
  });

  it("Teste 2 — SIGNED_IN de identidade diferente é troca de identidade", () => {
    expect(isIdentityChange("SIGNED_IN", U1, U2)).toBe(true);
  });

  it("SIGNED_OUT e sessão ausente sempre limpam o contexto", () => {
    expect(isIdentityChange("SIGNED_OUT", U1, null)).toBe(true);
    expect(isIdentityChange("SIGNED_IN", U1, null)).toBe(true);
  });

  it("primeiro SIGNED_IN sem usuário anterior (boot) não limpa contexto", () => {
    expect(isIdentityChange("SIGNED_IN", null, U1)).toBe(false);
  });
});

describe("PERF2 — WorkspaceQueryReset (predicate)", () => {
  it("Teste 7 — queries não relacionadas ao workspace são preservadas", () => {
    for (const key of WORKSPACE_STABLE_QUERY_KEYS) {
      expect(isWorkspaceScopedQueryKey([key])).toBe(false);
    }
  });

  it("queries escopadas por workspace/cliente são descartadas", () => {
    expect(isWorkspaceScopedQueryKey(["dashboard-agency", "brand", 30])).toBe(true);
    expect(isWorkspaceScopedQueryKey(["clients", "brand"])).toBe(true);
    expect(isWorkspaceScopedQueryKey(["my-access", "brand"])).toBe(true);
    expect(isWorkspaceScopedQueryKey(undefined)).toBe(true);
  });
});

describe("PERF2 — resolvendo x sem workspace", () => {
  beforeEach(() => __resetActiveWorkspace());

  it("Teste 8 — contexto não resolvido não equivale a ausência de workspace", () => {
    expect(getActiveWorkspace()).toEqual({ brandId: null, resolved: false });
    publishActiveWorkspace(null, true);
    expect(getActiveWorkspace()).toEqual({ brandId: null, resolved: true });
  });

  it("Teste 9 — workspace resolvido permanece disponível para o feature gate", () => {
    publishActiveWorkspace("brand-a", true);
    expect(getActiveWorkspace().brandId).toBe("brand-a");
    markActiveWorkspaceUnresolved();
    expect(getActiveWorkspace().resolved).toBe(false);
  });
});
