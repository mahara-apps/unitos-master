import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const SCRIPT = "supabase/master/tools/promote_master_control_plane.sh";

function runPromotion(
  mode: "--converge-existing" | "--bootstrap-clean" | "--recover-missing-1.4.10",
  verification: string,
  options: {
    recoveryConfirmation?: string;
    projectRef?: string;
    preflight?: string;
  } = {},
) {
  const directory = mkdtempSync(join(tmpdir(), "unitos-master-promotion-"));
  const calls = join(directory, "calls.txt");
  const fakePsql = join(directory, "psql");
  const fakeSupabase = join(directory, "supabase");
  writeFileSync(
    fakePsql,
    `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "${calls}"
if [[ "$*" == *"recovery-control-plane-preflight.sql"* ]]; then
  printf '%s\n' '${options.preflight ?? verification}'
elif [[ "$*" == *"verify-installation-master.sql"* ]]; then
  printf '%s\\n' '${verification}'
fi
`,
    { mode: 0o755 },
  );
  writeFileSync(
    fakeSupabase,
    `#!/usr/bin/env bash
printf 'supabase %s\\n' "$*" >> "${calls}"
if [[ "$*" == *"--dry-run"* ]]; then
  printf '%s\\n' '${options.preflight === "OTHER_MIGRATION" ? "20260920120000_other.sql" : "20260919143000_recover_missing_legacy_reconciliation.sql"}'
fi
`,
    { mode: 0o755 },
  );

  try {
    const stdout = execFileSync("bash", [SCRIPT, mode], {
      env: {
        PATH: `${directory}:${process.env["PATH"] ?? ""}`,
        UNITOS_MASTER_PROMOTION: "I_UNDERSTAND_MASTER_ONLY",
        MASTER_DATABASE_URL: `postgresql://tkjbhttylouamqxnbfgv.master.invalid/postgres`,
        UNITOS_MASTER_RECOVERY: options.recoveryConfirmation ?? "",
        MASTER_PROJECT_REF: options.projectRef ?? "",
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
      calls: existsSync(calls) ? readFileSync(calls, "utf8") : "",
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

  it("bloqueia recuperação sem confirmação e identidade específicas", () => {
    const result = runPromotion("--recover-missing-1.4.10", "1,controle,ok,PASS");
    expect(result.code).toBe(2);
    expect(result.calls).toBe("");
  });

  it("recupera somente o artefato dedicado após preflight e verifica", () => {
    const result = runPromotion("--recover-missing-1.4.10", "1,controle,ok,PASS", {
      recoveryConfirmation: "RECOVER_MISSING_1_4_10_ONLY",
      projectRef: "tkjbhttylouamqxnbfgv",
      preflight: "1,preflight,ok,PASS",
    });
    expect(result.code).toBe(0);
    expect(result.calls).toContain("recovery-control-plane-preflight.sql");
    expect(result.calls).toContain("20260919143000_recover_missing_legacy_reconciliation.sql");
    expect(result.calls).toContain("supabase db push");
    expect(result.calls).toContain("--dry-run");
    expect(result.calls).toContain("verify-installation-master.sql");
    expect(result.calls).not.toContain("convergence-control-plane.sql");
    expect(result.calls).not.toContain("bootstrap-control-plane.sql");
  });

  it("bloqueia quando o executor oficial seleciona qualquer outra migration", () => {
    const result = runPromotion("--recover-missing-1.4.10", "1,controle,ok,PASS", {
      recoveryConfirmation: "RECOVER_MISSING_1_4_10_ONLY",
      projectRef: "tkjbhttylouamqxnbfgv",
      preflight: "OTHER_MIGRATION",
    });
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("não selecionou exclusivamente 20260919143000");
    expect(result.calls.match(/supabase db push/g)).toHaveLength(1);
  });

  it("não aplica recuperação quando o preflight falha", () => {
    const result = runPromotion("--recover-missing-1.4.10", "1,controle,ok,PASS", {
      recoveryConfirmation: "RECOVER_MISSING_1_4_10_ONLY",
      projectRef: "tkjbhttylouamqxnbfgv",
      preflight: "1,preflight,divergente,FAIL",
    });
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("preflight da recuperação encontrou divergências");
    expect(result.calls).not.toContain("20260919143000_recover_missing_legacy_reconciliation.sql");
  });
});
