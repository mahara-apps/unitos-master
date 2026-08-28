import { describe, it, expect } from "vitest";
import { callRpc } from "@/lib/supabase-rpc";
import { invitableRoles, toAssignableRole } from "@/components/settings/team-shared";

/**
 * Regressão do erro real "Cannot read properties of undefined (reading 'rest')":
 * `SupabaseClient.rpc` faz `return this.rest.rpc(...)`. Chamar o método
 * desanexado perde o `this` e quebra em runtime.
 */
describe("callRpc — preserva o contexto do client Supabase", () => {
  const makeClient = () => ({
    rest: {
      rpc: (fn: string, args: Record<string, unknown>) =>
        Promise.resolve({ data: { fn, args }, error: null }),
    },
    rpc(fn: string, args: Record<string, unknown>) {
      // Mesma implementação do supabase-js.
      return (this as unknown as { rest: { rpc: typeof this.rest.rpc } }).rest.rpc(fn, args);
    },
  });

  it("chama a RPC com o client como `this`", async () => {
    const client = makeClient();
    const res = await callRpc(client as never, "link_existing_user_to_brand", {
      _brand_id: "b1",
      _email: "a@b.com",
      _role: "owner",
    });
    expect(res.error).toBeNull();
    expect(res.data).toMatchObject({ fn: "link_existing_user_to_brand" });
  });

  it("a chamada desanexada (bug original) falha com o erro reportado", async () => {
    const client = makeClient();
    const detached = client.rpc as (f: string, a: Record<string, unknown>) => unknown;
    expect(() => detached("x", {})).toThrow(/reading 'rest'/);
  });
});

/**
 * RBAC: o Admin (proprietário) pode conceder Admin — não existe regra de
 * "apenas um Admin" por workspace. Espelha `public.can_invite_brand_role`.
 */
describe("papéis concedíveis por autoridade", () => {
  it("super admin concede todos os papéis internos", () => {
    expect(invitableRoles("super_admin")).toEqual(["owner", "manager", "user"]);
  });

  it("admin (proprietário) pode adicionar outro admin", () => {
    expect(invitableRoles("admin")).toContain("owner");
  });

  it("manager concede apenas user", () => {
    expect(invitableRoles("manager")).toEqual(["user"]);
  });

  it("user e cliente não concedem papéis", () => {
    expect(invitableRoles("user")).toEqual([]);
    expect(invitableRoles("client")).toEqual([]);
    expect(invitableRoles(null)).toEqual([]);
  });

  it("papéis legados normalizam para user, nunca para admin", () => {
    expect(toAssignableRole("editor")).toBe("user");
    expect(toAssignableRole("designer")).toBe("user");
    expect(toAssignableRole("owner")).toBe("owner");
  });
});
