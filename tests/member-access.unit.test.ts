import { describe, expect, it } from "vitest";
import { canManageMemberAccess } from "@/lib/member-access";
const base = { actorId: "a", targetId: "b", targetRole: "user", targetIsSuperAdmin: false };
describe("reenviar acesso / senha provisória", () => {
  it("Super Admin pode", () => expect(canManageMemberAccess({ ...base, actorAuthority: "super_admin" })).toBe(true));
  it("Admin pode", () => expect(canManageMemberAccess({ ...base, actorAuthority: "admin" })).toBe(true));
  it("Manager não pode", () => expect(canManageMemberAccess({ ...base, actorAuthority: "manager" })).toBe(false));
  it("User não pode", () => expect(canManageMemberAccess({ ...base, actorAuthority: "user" })).toBe(false));
  it("Admin não altera Owner", () => expect(canManageMemberAccess({ ...base, actorAuthority: "admin", targetRole: "owner" })).toBe(false));
  it("Admin não altera Super Admin", () => expect(canManageMemberAccess({ ...base, actorAuthority: "admin", targetIsSuperAdmin: true })).toBe(false));
  it("Super Admin altera Owner", () => expect(canManageMemberAccess({ ...base, actorAuthority: "super_admin", targetRole: "owner" })).toBe(true));
  it("ninguém altera a si mesmo", () => expect(canManageMemberAccess({ ...base, actorAuthority: "super_admin", targetId: "a" })).toBe(false));
});
