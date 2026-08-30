import { expect, it } from "vitest";
import { createUser } from "./helpers/fixtures";

it("fresh user consegue criar primeiro workspace", async () => {
  const u = await createUser("repro");
  const ins = await u.client
    .from("brands")
    .insert({ name: "Repro WS", slug: `repro-${Date.now()}`, created_by: u.id });
  console.log("insert error:", ins.error?.message ?? "none");
  expect(ins.error).toBeNull();
}, 60_000);
