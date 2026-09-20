import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function run(script: string, args: string[]) {
  try { return { code: 0, output: execFileSync("python3", [script, ...args], { encoding: "utf8" }) }; }
  catch (error) { const e=error as {status?:number;stdout?:string;stderr?:string}; return {code:e.status??1,output:`${e.stdout??""}${e.stderr??""}`}; }
}

describe("diagnósticos locais fail-closed do Master", () => {
  it("aceita somente versões e commits integralmente coincidentes", () => {
    const dir=mkdtempSync(join(tmpdir(),"unitos-release-diagnostic-")); const file=join(dir,"evidence.json");
    const evidence={local:{release:"1.4.18",commitSha:"a".repeat(40),packageSha256:"b".repeat(64)},controlPlane:{desiredRelease:"1.4.18",desiredCommitSha:"a".repeat(40),currentVersion:"1.4.18"},production:{release:"1.4.18",commitSha:"a".repeat(40)}};
    writeFileSync(file,JSON.stringify(evidence));
    expect(run("supabase/master/tools/diagnose_release_divergence.py",["--evidence",file])).toMatchObject({code:0,output:expect.stringContaining('"status": "PASS"')});
    writeFileSync(file,JSON.stringify({...evidence,production:{release:"1.3.76",commitSha:"a".repeat(40)}}));
    expect(run("supabase/master/tools/diagnose_release_divergence.py",["--evidence",file])).toMatchObject({code:2,output:expect.stringContaining('"status": "BLOCK"')});
    writeFileSync(file,JSON.stringify({local:evidence.local,controlPlane:evidence.controlPlane,production:{}}));
    expect(run("supabase/master/tools/diagnose_release_divergence.py",["--evidence",file]).output).toContain("production.release");
  });

  it("compara exatamente objetos e hashes exportados contra o inventário selado", () => {
    const dir=mkdtempSync(join(tmpdir(),"unitos-contract-diagnostic-")); const report=join(dir,"report.json");
    const contract=JSON.parse(readFileSync("supabase/master/control-plane-contract.json","utf8"));
    writeFileSync(report,JSON.stringify(contract));
    expect(run("supabase/master/tools/diagnose_control_plane_contract.py",["--report",report])).toMatchObject({code:0,output:expect.stringContaining('"status": "PASS"')});
    writeFileSync(report,JSON.stringify({...contract,triggers:contract.triggers.slice(1),files:{...contract.files,"003_control_plane_deterministic_update.sql":"0".repeat(64)}}));
    const blocked=run("supabase/master/tools/diagnose_control_plane_contract.py",["--report",report]);
    expect(blocked.code).toBe(2); expect(blocked.output).toContain('"status": "BLOCK"'); expect(blocked.output).toContain("installation_operations_freeze_guard@installations");
  });
});
