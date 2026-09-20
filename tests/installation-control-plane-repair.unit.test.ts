import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  APEX_OPERATION_ID,
  CONTROL_PLANE_PROJECT_REF,
  CONTROL_PLANE_RISK_CONFIRMATION,
  canExecuteControlPlaneRepair,
  formatControlPlaneRepairReport,
  getControlPlaneRepairReport,
} from "../src/lib/installation/control-plane-repair-contract";

describe("reparação controlada do Control-plane", () => {
  it("nasce BLOCK e documenta todos os bloqueios remotos confirmados", () => {
    const report = getControlPlaneRepairReport();
    expect(report.verdict).toBe("BLOCK");
    expect(report.mode).toBe("PREPARATION_ONLY");
    expect(report.blockers.map((item) => item.id)).toEqual([
      "freeze",
      "executor",
      "recovery",
      "cron",
      "versions",
      "endpoints",
    ]);
  });

  it("preserva identidade canônica, confirmação literal e operação Apex", () => {
    const report = getControlPlaneRepairReport();
    expect(report.projectRef).toBe(CONTROL_PLANE_PROJECT_REF);
    expect(report.apexProtection.operationId).toBe(APEX_OPERATION_ID);
    expect(report.apexProtection.invariant).toContain("attempt_count 0");
    expect(report.gates.find((gate) => gate.id === "risk")?.requirement).toContain(
      CONTROL_PLANE_RISK_CONFIRMATION,
    );
  });

  it("mantém ordem e autorizações independentes", () => {
    const report = getControlPlaneRepairReport();
    expect(report.steps.map((step) => step.id)).toEqual([
      "freeze-install",
      "freeze-enable",
      "executor-install",
      "recovery",
      "contract-validation",
      "cron-enable",
    ]);
    expect(new Set(report.steps.map((step) => step.approval)).size).toBe(report.steps.length);
    expect(report.steps.at(-1)?.dependsOn).toEqual(["contract-validation"]);
  });

  it("é fail-closed até todos os gates passarem", () => {
    const report = getControlPlaneRepairReport();
    expect(canExecuteControlPlaneRepair(report.gates)).toBe(false);
    expect(
      canExecuteControlPlaneRepair(report.gates.map((gate) => ({ ...gate, status: "pass" }))),
    ).toBe(true);
    expect(canExecuteControlPlaneRepair([])).toBe(false);
  });

  it("gera relatório sem segredos, comandos de escrita ou ação sobre Apex", () => {
    const text = formatControlPlaneRepairReport(getControlPlaneRepairReport());
    expect(text).toContain("STATUS FINAL: BLOCK");
    expect(text).toContain(APEX_OPERATION_ID);
    expect(text).not.toMatch(/postgres(?:ql)?:\/\//i);
    expect(text).not.toMatch(/service_role|sb_secret|password/i);
    expect(text).not.toMatch(/cancelar a operação Apex|excluir a operação Apex/i);
  });

  it("expõe somente GET autenticado no Master e não conecta executores", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/lib/installation/control-plane-repair.functions.ts"),
      "utf8",
    );
    expect(source).toContain('createServerFn({ method: "GET" })');
    expect(source).toContain("requireSupabaseAuth");
    expect(source).toContain("assertMasterInstallation()");
    expect(source).toContain("assertSuperAdmin");
    expect(source).not.toMatch(/method:\s*"(?:POST|PUT|PATCH|DELETE)"/);
    expect(source).not.toMatch(/promote_master|control_plane_freeze|cron\.alter_job|supabase\.from/);
  });
});
