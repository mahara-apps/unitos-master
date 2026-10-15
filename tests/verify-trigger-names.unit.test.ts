import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";

const verify = readFileSync("supabase/install/verify-installation-client.sql", "utf8");
const migrations = readdirSync("supabase/migrations")
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(`supabase/migrations/${f}`, "utf8"))
  .join("\n");

function finalTriggers(): Set<string> {
  const live = new Set<string>();
  const re = /(CREATE(?:\s+OR\s+REPLACE)?\s+TRIGGER|DROP\s+TRIGGER(?:\s+IF\s+EXISTS)?)\s+"?(\w+)"?/gi;
  for (const m of migrations.matchAll(re)) {
    if (/^DROP/i.test(m[1])) live.delete(m[2]);
    else live.add(m[2]);
  }
  return live;
}

describe("verify-installation-client: nomes de trigger", () => {
  it("toda trigger exigida pelo verificador existe ao fim das migrations", () => {
    const live = finalTriggers();
    const required = new Set<string>();
    for (const m of verify.matchAll(/tgname\s+IN\s*\(([^)]*)\)/gi)) {
      for (const n of m[1].matchAll(/'(\w+)'/g)) required.add(n[1]);
    }
    const missing = [...required].filter((n) => !live.has(n));
    expect(missing).toEqual([]);
  });

  it("check 91 exige a trava de workspace atual", () => {
    expect(verify).toContain("'production_stage_workspace_guard'");
  });
});
