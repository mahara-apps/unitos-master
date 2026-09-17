import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const SCRIPT = "supabase/master/tools/promote_master_control_plane.sh";

function runPromotion(mode: "--converge-existing" | "--bootstrap-clean", verification: string) {
  const directory = mkdtempSync(join(tmpdir(), "unitos-master-promotion-"));
  const calls = join(directory, "calls.txt");
  const fakePsql = join(directory, "psql");
  writeFileSync(
    fakePsql,
    `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "${calls}"
if [[ "$*" == *"verify-installation-master.sql"* ]]; then
  printf '%s\\n' '${verification}'
fi
`,
    { mode: 0o755 },
  );

  try {
    const stdout = execFileSync("bash", [SCRIPT, mode], {
      env: {
        PATH: `${directory}:${process.env["PATH"] ?? ""}`,
        UNITOS_MASTER_PROMOTION: "I_UNDERSTAND_MASTER_ONLY",
        MASTER_DATABASE_URL: "postgresql://master.invalid/postgres",
      },
      encoding: "utf8",
      timeout: 10_000,
    });
    return { code: 0, stdout, calls: readFileSync(calls, "utf8") };
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string };
    return {
      code: failure.status ?? 1,
      stdout: `${failure.stdout ?? ""}${failure.stderr ?? ""}`,
      calls: readFileSync(calls, "utf8"),
    };
  }
}

describe("promoção local do Control-plane Master", () => {
  it("Master existente aplica apenas a convergência em transação e verifica", () => {
    const result = runPromotion("--converge-existing", "1,controle,ok,PASS");
    expect(result.code).toBe(0);
    expect(result.calls).toContain("--single-transaction");
    expect(result.calls).toContain("convergence-control-plane.sql");
    expect(result.calls).not.toContain(
      "--file /dev-server/supabase/master/bootstrap-control-plane.sql",
    );
    expect(result.calls).toContain("verify-installation-master.sql");
  });

  it("Master limpo aplica o bootstrap completo em transação", () => {
    const result = runPromotion("--bootstrap-clean", "1,controle,ok,PASS");
    expect(result.code).toBe(0);
    expect(result.calls).toContain("--single-transaction");
    expect(result.calls).toContain("bootstrap-control-plane.sql");
    expect(result.calls).toContain("verify-installation-master.sql");
  });

  it("falha a promoção quando o verificador Master encontra FAIL", () => {
    const result = runPromotion("--converge-existing", "1,controle,divergente,FAIL");
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("verificador Master encontrou divergências");
  });
});
