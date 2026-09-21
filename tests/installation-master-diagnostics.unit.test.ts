import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function run(script: string, args: string[]) {
  try {
    return { code: 0, output: execFileSync("python3", [script, ...args], { encoding: "utf8" }) };
  } catch (error) {
    const e = error as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? 1, output: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

describe("diagnósticos locais fail-closed do Master", () => {
  it("aceita somente versões e commits integralmente coincidentes", () => {
    const dir = mkdtempSync(join(tmpdir(), "unitos-release-diagnostic-"));
    const file = join(dir, "evidence.json");
    const evidence = {
      local: { release: "1.4.19", commitSha: "a".repeat(40), packageSha256: "b".repeat(64) },
      controlPlane: {
        desiredRelease: "1.4.19",
        desiredCommitSha: "a".repeat(40),
        currentVersion: "1.4.19",
      },
      production: { release: "1.4.19", commitSha: "a".repeat(40) },
    };
    writeFileSync(file, JSON.stringify(evidence));
    expect(
      run("supabase/master/tools/diagnose_release_divergence.py", ["--evidence", file]),
    ).toMatchObject({ code: 0, output: expect.stringContaining('"status": "PASS"') });
    writeFileSync(
      file,
      JSON.stringify({ ...evidence, production: { release: "1.3.76", commitSha: "a".repeat(40) } }),
    );
    expect(
      run("supabase/master/tools/diagnose_release_divergence.py", ["--evidence", file]),
    ).toMatchObject({ code: 2, output: expect.stringContaining('"status": "PASS"') });
    writeFileSync(
      file,
      JSON.stringify({
        local: evidence.local,
        controlPlane: evidence.controlPlane,
        production: {},
      }),
    );
    expect(
      run("supabase/master/tools/diagnose_release_divergence.py", ["--evidence", file]).output,
    ).toContain("production.release");
  });

  it("compara exatamente objetos e hashes exportados contra o inventário selado", () => {
    const dir = mkdtempSync(join(tmpdir(), "unitos-contract-diagnostic-"));
    const report = join(dir, "report.json");
    const contract = JSON.parse(
      readFileSync("supabase/master/control-plane-contract.json", "utf8"),
    );
    writeFileSync(report, JSON.stringify(contract));
    expect(
      run("supabase/master/tools/diagnose_control_plane_contract.py", ["--report", report]),
    ).toMatchObject({ code: 0, output: expect.stringContaining('"status": "PASS"') });
    writeFileSync(
      report,
      JSON.stringify({
        ...contract,
        triggers: contract.triggers.slice(1),
        files: { ...contract.files, "003_control_plane_deterministic_update.sql": "0".repeat(64) },
      }),
    );
    const blocked = run("supabase/master/tools/diagnose_control_plane_contract.py", [
      "--report",
      report,
    ]);
    expect(blocked.code).toBe(2);
    expect(blocked.output).toContain('"status": "PASS"');
    expect(blocked.output).toContain("installation_operations_freeze_guard@installations");
    writeFileSync(report, JSON.stringify({ ...contract, releaseVersion: "0.0.0" }));
    const versionBlocked = run("supabase/master/tools/diagnose_control_plane_contract.py", [
      "--report",
      report,
    ]);
    expect(versionBlocked.code).toBe(2);
    expect(versionBlocked.output).toContain('"versions"');
  });

  it("valida a convergência local Master/Client 1.4.19 e Control-plane 1.4.19", () => {
    const result = run("supabase/master/tools/verify_control_plane_compatibility.py", []);
    expect(result.code).toBe(0);
    expect(result.output).toContain('"status": "PASS"');
    expect(result.output).toContain("1.4.19");
  });

  it("rejeita relatório de preflight ausente, inválido, inconsistente ou negativo", () => {
    const dir = mkdtempSync(join(tmpdir(), "unitos-preflight-report-"));
    for (const [name, body] of [
      ["missing.csv", "1,primeiro,0,PASS\n"],
      ["invalid.csv", "1,primeiro,,PASS\n2,segundo,0,PASS\n"],
      ["inconsistent.csv", "2,segundo,0,PASS\n1,primeiro,0,PASS\n"],
      ["negative.csv", "1,primeiro,-1,PASS\n2,segundo,0,PASS\n"],
    ]) {
      const report = join(dir, name);
      writeFileSync(report, body);
      expect(
        run("supabase/master/tools/verify_preflight_report.py", [
          "--report",
          report,
          "--expected",
          "2",
        ]).code,
      ).toBe(2);
    }
  });
});
