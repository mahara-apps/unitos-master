import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const SCRIPT = "supabase/master/tools/verify_master_backup_gate.py";
const INSTALLATION_ID = "0b6b7f5c-44e5-4e85-a33c-37014ed044a2";

function run(
  scope: "global" | "installation",
  env: Record<string, string> = {},
  installationId = "",
) {
  const directory = mkdtempSync(join(tmpdir(), "unitos-backup-gate-"));
  const auditFile = join(directory, "audit.jsonl");
  try {
    const stdout = execFileSync(
      "python3",
      [SCRIPT, "--scope", scope, "--installation-id", installationId],
      {
        env: {
          PATH: process.env["PATH"] ?? "",
          UNITOS_MASTER_BACKUP_AUDIT_FILE: auditFile,
          ...env,
        },
        encoding: "utf8",
      },
    );
    return { code: 0, output: stdout, auditFile };
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string };
    return {
      code: failure.status ?? 1,
      output: `${failure.stdout ?? ""}${failure.stderr ?? ""}`,
      auditFile,
    };
  }
}

describe("gate de backup do Control-plane Master", () => {
  it("mantém backup restaurável obrigatório para mudança compartilhada", () => {
    const blocked = run("global");
    expect(blocked.code).toBe(2);
    expect(blocked.output).toContain("backup restaurável obrigatório");

    const allowed = run("global", {
      UNITOS_MASTER_BACKUP_CONFIRMATION: "BACKUP_RESTORABLE_VERIFIED",
      UNITOS_MASTER_BACKUP_EVIDENCE: "snapshot-master-2026-09-20T15:00:00Z",
      UNITOS_MASTER_BACKUP_OPERATOR: "operador-control-plane",
    });
    expect(allowed.code).toBe(0);
    expect(allowed.output).toContain("BACKUP_GATE=backup_verified");
    expect(readFileSync(allowed.auditFile, "utf8")).toContain('"decision": "backup_verified"');
  });

  it("aceita exceção somente para instalação descartável explicitamente identificada", () => {
    const allowed = run(
      "installation",
      {
        UNITOS_MASTER_BACKUP_EXCEPTION: "ACCEPT_DISPOSABLE_INSTALLATION_BACKUP_RISK",
        UNITOS_MASTER_BACKUP_EXCEPTION_INSTALLATION_ID: INSTALLATION_ID,
        UNITOS_MASTER_BACKUP_EXCEPTION_DISPOSABLE: "INSTALLATION_NOT_DELIVERED_AND_DISPOSABLE",
        UNITOS_MASTER_BACKUP_EXCEPTION_OPERATOR: "operador-control-plane",
        UNITOS_MASTER_BACKUP_EXCEPTION_RISK_ACCEPTED:
          "Aceito perda integral dos dados descartáveis desta instalação.",
      },
      INSTALLATION_ID,
    );
    expect(allowed.code).toBe(0);
    expect(allowed.output).toContain(`installation_id=${INSTALLATION_ID}`);
    expect(allowed.output).toContain("BACKUP_GATE=disposable_exception");
    const audit = readFileSync(allowed.auditFile, "utf8");
    expect(audit).toContain(`"installation_id": "${INSTALLATION_ID}"`);
    expect(audit).toContain('"risk_accepted"');
  });

  it("bloqueia exceção global, identidade divergente e risco não documentado", () => {
    const base = {
      UNITOS_MASTER_BACKUP_EXCEPTION: "ACCEPT_DISPOSABLE_INSTALLATION_BACKUP_RISK",
      UNITOS_MASTER_BACKUP_EXCEPTION_INSTALLATION_ID: INSTALLATION_ID,
      UNITOS_MASTER_BACKUP_EXCEPTION_DISPOSABLE: "INSTALLATION_NOT_DELIVERED_AND_DISPOSABLE",
      UNITOS_MASTER_BACKUP_EXCEPTION_OPERATOR: "operador-control-plane",
      UNITOS_MASTER_BACKUP_EXCEPTION_RISK_ACCEPTED:
        "Aceito perda integral dos dados descartáveis desta instalação.",
    };
    expect(run("global", base).output).toContain("nunca pode ter escopo global");
    expect(run("installation", base, "11111111-1111-4111-8111-111111111111").output).toContain(
      "não identifica exatamente",
    );
    expect(
      run(
        "installation",
        { ...base, UNITOS_MASTER_BACKUP_EXCEPTION_RISK_ACCEPTED: "aceito" },
        INSTALLATION_ID,
      ).output,
    ).toContain("risco aceito deve ser documentado");
  });

  it("não permite que a exceção substitua a autorização da operação", () => {
    const promotion = execFileSync(
      "cat",
      ["supabase/master/tools/promote_master_control_plane.sh"],
      { encoding: "utf8" },
    );
    expect(promotion).toContain('UNITOS_MASTER_PROMOTION:-}" != "I_UNDERSTAND_MASTER_ONLY"');
    expect(promotion).toContain('UNITOS_MASTER_RECOVERY:-}" != "RECOVER_MISSING_1_4_10_ONLY"');
    expect(promotion).toContain("recovery-control-plane-preflight.sql");
    expect(promotion).toContain("verify_master_recovery_stage.py");
    expect(promotion).toContain('verify_master_backup_gate.py" --scope global');
  });
});