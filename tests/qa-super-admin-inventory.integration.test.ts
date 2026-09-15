import { describe, expect, it } from "vitest";
import { admin } from "./helpers/fixtures";

describe("inventário do banco após a suíte de integração", () => {
  it("nenhuma conta QA possui SUPER ADMIN", async () => {
    const { data, error } = await admin
      .from("user_profiles")
      .select("id, is_super_admin, role")
      .or("is_super_admin.eq.true,role.eq.super_admin");
    if (error) throw new Error(error.message);
    const ids = (data ?? []).map((row) => row.id as string);
    const emails: string[] = [];
    for (const id of ids) {
      const user = await admin.auth.admin.getUserById(id);
      if (user.data.user?.email) emails.push(user.data.user.email.toLowerCase());
    }
    expect(
      emails.filter((email) => email.includes("unitos-tests.dev") || email.startsWith("qa+")),
    ).toEqual([]);
  });

  it("SUPER ADMIN legítimo preservado (pelo menos um, não-QA)", async () => {
    const { data, error } = await admin
      .from("user_profiles")
      .select("id")
      .or("is_super_admin.eq.true,role.eq.super_admin");
    if (error) throw new Error(error.message);
    expect((data ?? []).length).toBeGreaterThan(0);
  });
});
