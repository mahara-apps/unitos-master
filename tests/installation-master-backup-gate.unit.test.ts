import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const SCRIPT = "supabase/master/tools/verify_master_backup_gate.py";
const MASTER_PROJECT_REF = "tkjbhttylouamqxnbfgv";

function run(
  scope: "global" | "installation",
  env: Record<string, string> = {},
  auditFileOverride?: string,
) {
  const directory = mkdtempSync(join(tmpdir(), "unitos-backup-gate-"));
  const auditFile = join(directory, "audit.jsonl");
  try {
    const stdout = execFileSync("python3", [SCRIPT, "--scope", scope], {
      env: {
        PATH: process.env["PATH"] ?? "",
        MASTER_PROJECT_REF,
        UNITOS_MASTER_BACKUP_AUDIT_FILE: auditFileOverride ?? auditFile,
        ...env,
      },
      encoding: "utf8",
    });
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
  it("aceita backup restaurável comprovado e registra o Master exato", () => {
    const blocked = run("global");
    expect(blocked.code).toBe(2);
    expect(blocked.output).toContain("backup restaurável ou aceite explicitamente");

    const allowed = run("global", {
      UNITOS_MASTER_BACKUP_CONFIRMATION: "BACKUP_RESTORABLE_VERIFIED",
      UNITOS_MASTER_BACKUP_EVIDENCE: "snapshot-master-2026-09-20T15:00:00Z",
      UNITOS_MASTER_BACKUP_OPERATOR: "operador-control-plane",
    });
    expect(allowed.code).toBe(0);
    expect(allowed.output).toContain("BACKUP_GATE=backup_verified");
    const audit = readFileSync(allowed.auditFile, "utf8");
    expect(audit).toContain('"decision": "backup_verified"');
    expect(audit).toContain(`"project_ref": "${MASTER_PROJECT_REF}"`);
  });

  it("aceita ausência de backup somente com risco global explícito e auditável", () => {
    const allowed = run("global", {
      UNITOS_MASTER_NO_BACKUP_CONFIRMATION:
        "ACCEPT_EXISTING_CONTROL_PLANE_WITHOUT_RESTORABLE_BACKUP",
      UNITOS_MASTER_NO_BACKUP_PROJECT_REF: MASTER_PROJECT_REF,
      UNITOS_MASTER_NO_BACKUP_OPERATOR: "operador-control-plane",
      UNITOS_MASTER_NO_BACKUP_RISK_ACCEPTED:
        "Aceito o risco de executar no Control-plane existente sem backup restaurável.",
    });
    expect(allowed.code).toBe(0);
    expect(allowed.output).toContain(`project_ref=${MASTER_PROJECT_REF}`);
    expect(allowed.output).toContain("BACKUP_GATE=global_no_backup_accepted");
    expect(allowed.output).not.toContain("risco de executar");
    const audit = readFileSync(allowed.auditFile, "utf8");
    expect(audit).toContain(`"project_ref": "${MASTER_PROJECT_REF}"`);
    expect(audit).toContain('"risk_accepted"');
  });

  it("bloqueia escopo de instalação, identidade divergente e risco não documentado", () => {
    const base = {
      UNITOS_MASTER_NO_BACKUP_CONFIRMATION:
        "ACCEPT_EXISTING_CONTROL_PLANE_WITHOUT_RESTORABLE_BACKUP",
      UNITOS_MASTER_NO_BACKUP_PROJECT_REF: MASTER_PROJECT_REF,
      UNITOS_MASTER_NO_BACKUP_OPERATOR: "operador-control-plane",
      UNITOS_MASTER_NO_BACKUP_RISK_ACCEPTED:
        "Aceito o risco de executar no Control-plane existente sem backup restaurável.",
    };
    expect(run("installation", base).output).toContain("somente escopo global");
    expect(
      run("global", { ...base, UNITOS_MASTER_NO_BACKUP_PROJECT_REF: "aaaaaaaaaaaaaaaaaaaa" })
        .output,
    ).toContain("não identifica exatamente");
    expect(
      run("global", { ...base, UNITOS_MASTER_NO_BACKUP_RISK_ACCEPTED: "aceito" }).output,
    ).toContain("risco aceito deve ser documentado");
  });

  it("bloqueia identidade canônica ausente ou divergente mesmo com backup", () => {
    const backup = {
      UNITOS_MASTER_BACKUP_CONFIRMATION: "BACKUP_RESTORABLE_VERIFIED",
      UNITOS_MASTER_BACKUP_EVIDENCE: "snapshot-master-test",
      UNITOS_MASTER_BACKUP_OPERATOR: "operador-control-plane",
    };
    expect(run("global", { ...backup, MASTER_PROJECT_REF: "" }).output).toContain(
      "MASTER_PROJECT_REF ausente",
    );
    expect(
      run("global", { ...backup, MASTER_PROJECT_REF: "aaaaaaaaaaaaaaaaaaaa" }).output,
    ).toContain("não coincide com o Master canônico");
  });

  it("rejeita o formato antigo de exceção descartável", () => {
    const rejected = run("global", {
      UNITOS_MASTER_BACKUP_EXCEPTION: "ACCEPT_DISPOSABLE_INSTALLATION_BACKUP_RISK",
      UNITOS_MASTER_BACKUP_EXCEPTION_INSTALLATION_ID: "0b6b7f5c-44e5-4e85-a33c-37014ed044a2",
      UNITOS_MASTER_BACKUP_EXCEPTION_DISPOSABLE: "INSTALLATION_NOT_DELIVERED_AND_DISPOSABLE",
      UNITOS_MASTER_BACKUP_EXCEPTION_OPERATOR: "operador-control-plane",
      UNITOS_MASTER_BACKUP_EXCEPTION_RISK_ACCEPTED:
        "Aceito perda integral dos dados descartáveis desta instalação.",
    });
    expect(rejected.code).toBe(2);
    expect(rejected.output).toContain("aceite explicitamente o risco global");
  });

  it("exige destino JSONL absoluto e não registra segredos", () => {
    const decision = {
      UNITOS_MASTER_NO_BACKUP_CONFIRMATION:
        "ACCEPT_EXISTING_CONTROL_PLANE_WITHOUT_RESTORABLE_BACKUP",
      UNITOS_MASTER_NO_BACKUP_PROJECT_REF: MASTER_PROJECT_REF,
      UNITOS_MASTER_NO_BACKUP_OPERATOR: "operador-control-plane",
      UNITOS_MASTER_NO_BACKUP_RISK_ACCEPTED:
        "Aceito o risco global sem backup; senha-super-secreta não deve ir ao terminal.",
    };
    const relative = run("global", decision, "audit.jsonl");
    expect(relative.code).toBe(2);
    expect(relative.output).toContain("caminho absoluto .jsonl");

    const wrongExtension = run("global", decision, "/tmp/audit.txt");
    expect(wrongExtension.code).toBe(2);
    expect(wrongExtension.output).toContain("caminho absoluto .jsonl");

    const allowed = run("global", decision);
    expect(allowed.code).toBe(0);
    expect(allowed.output).not.toContain("senha-super-secreta");
    expect(allowed.output).not.toContain("postgresql://");
  });

  it("não permite que a decisão de risco substitua a autorização da operação", () => {
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
