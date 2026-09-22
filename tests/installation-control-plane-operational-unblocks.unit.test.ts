import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const freeze = readFileSync("supabase/master/002_control_plane_global_freeze.sql", "utf8");
const executorPreflight = readFileSync(
  "supabase/master/deterministic-update-install-preflight.sql",
  "utf8",
);
const executorInstall = readFileSync("supabase/master/install-deterministic-update.sql", "utf8");
const recoveryPreflight = readFileSync(
  "supabase/master/recovery-control-plane-preflight.sql",
  "utf8",
);
const recovery = readFileSync(
  "supabase/master/recovery/20260919143000_recover_missing_legacy_reconciliation.sql",
  "utf8",
);
const promotion = readFileSync("supabase/master/tools/promote_master_control_plane.sh", "utf8");
const release = readFileSync("supabase/master/004_control_plane_release_promotion.sql", "utf8");
const releaseInstall = readFileSync("supabase/master/install-control-plane-release.sql", "utf8");
const cron = readFileSync("supabase/master/005_activate_cron_37.sql", "utf8");
const cronTool = readFileSync("supabase/master/tools/activate_cron_37.sh", "utf8");
const releaseTool = readFileSync("supabase/master/tools/promote_control_plane_release.sh", "utf8");
const convergenceEntry = readFileSync("supabase/master/convergence-control-plane.sql", "utf8");

describe("seis desbloqueios operacionais do Control-plane 1.4.25", () => {
  it("freeze preserva pending sem lease e bloqueia atividade ou ambiguidade", () => {
    expect(freeze).not.toContain("WHERE status IN ('pending','running','retryable')");
    expect(freeze).toContain("status IN ('running','retryable')");
    expect(freeze).toContain("lease_owner IS NOT NULL OR lease_expires_at IS NOT NULL");
    expect(freeze).toContain("o.id IS NULL");
    expect(freeze).toContain("status NOT IN");
    expect(freeze).toContain("BEFORE INSERT OR UPDATE OR DELETE");
  });

  it("executor preserva pending e histórico terminal em preflight e transação", () => {
    for (const source of [executorPreflight, executorInstall]) {
      expect(source).toContain("status = 'running'");
      expect(source).toContain("lease_owner IS NOT NULL OR lease_expires_at IS NOT NULL");
      expect(source).toContain("o.id IS NULL");
      expect(source).toContain("'retryable','deferred','interrupted'");
      expect(source).toContain("o.status IN ('blocked','manual_review','success','failed')");
    }
    expect(executorPreflight).toContain("contagem de pending sem lease íntegra");
    expect(executorPreflight).toContain(
      "histórico deferred/interrupted/retryable tem evidência terminal",
    );
    expect(executorPreflight).not.toMatch(/SELECT 2[^\n]+true/);
    expect(executorPreflight).not.toMatch(/SELECT 6[^\n]+true/);
    expect(executorPreflight).toContain("a.finished_at IS NOT NULL");
    expect(executorPreflight).toContain("a.fencing_token <= o.fencing_token");
  });

  it("recovery não exige lease da pending nem altera operações ou tentativas", () => {
    expect(recoveryPreflight).toContain("pending sem lease preservadas");
    expect(recoveryPreflight).toContain("'deferred','interrupted'");
    expect(recovery).toContain("unitos_recovery_operations_snapshot");
    expect(recovery).toContain("unitos_recovery_attempts_snapshot");
    expect(recovery).not.toMatch(/UPDATE\s+public\.installation_operations/i);
    expect(recovery).not.toMatch(/DELETE\s+FROM\s+public\.installation_operations/i);
    expect(recovery).not.toMatch(/INSERT\s+INTO\s+public\.installation_operations/i);
  });

  it("cron ativa exclusivamente o job 37 após contrato validado", () => {
    expect(cron).toContain("cron.alter_job(job_id := 37, active := true)");
    expect(cron).not.toContain("cron.schedule");
    expect(cron).not.toContain("cron.unschedule");
    expect(cron).toContain("jobname='installation-provision-resume'");
    expect(cron).toContain("frozen IS FALSE");
    expect(cronTool).toContain("ACTIVATE_VERIFIED_CRON_37_ONLY");
    expect(cronTool).toContain("UNITOS_CRON_AUDIT_FILE");
    expect(cronTool).toContain("verify-installation-master.sql");
    expect(cronTool).toContain("LOCAL_CONTRACT_SHA256");
    expect(cron).toContain("lease_expires_at > now()");
    expect(cron).toContain("a.fencing_token<=o.fencing_token");
  });

  it("separa os atos e recusa convergência agregada legada", () => {
    expect(promotion).toContain("--apply-convergence-only");
    expect(promotion).toContain("APPLY_CONTROL_PLANE_CONVERGENCE_ONLY");
    expect(promotion).toContain("--converge-existing foi removido");
    expect(promotion).toContain("--install-global-freeze");
    expect(promotion).toContain("--install-deterministic-update");
    expect(promotion).toContain("--recover-missing-1.4.10");
    expect(promotion).toContain("--install-control-plane-release");
    expect(convergenceEntry.trim()).toBe(
      "\\set ON_ERROR_STOP on\n\\ir 001_control_plane_convergence_v1_4_3.sql",
    );
  });

  it("promove o próprio Control-plane atomicamente e sem tabelas Client", () => {
    expect(release).toContain("CREATE TABLE IF NOT EXISTS public.control_plane_release_state");
    expect(release).toContain("CREATE TABLE IF NOT EXISTS public.control_plane_release_events");
    expect(release).not.toContain(
      "INSERT INTO public.control_plane_release_state(singleton) VALUES (true)",
    );
    expect(release).toContain("pg_advisory_xact_lock");
    expect(release).toContain("FOR UPDATE");
    expect(release).toContain("_state.current_version IS DISTINCT FROM _expected_current_version");
    expect(release).toContain("contractValidated");
    expect(release).toContain("recoveryValidated");
    expect(release).not.toMatch(/UPDATE\s+public\.installations/i);
    expect(release).not.toMatch(/UPDATE\s+public\.installation_operations/i);
    expect(releaseInstall).toContain("BEGIN;");
    expect(releaseInstall).toContain("COMMIT;");
    expect(releaseInstall).toContain("baseline_current_version");
    expect(releaseInstall).toContain(
      "Baseline existente diverge; instalação abortada sem sobrescrita",
    );
    expect(releaseTool).toContain("LOCAL_CONTRACT_SHA256");
    expect(releaseTool).toContain("hash informado diverge do contrato local selado");
  });
});
