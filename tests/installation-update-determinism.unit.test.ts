import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  updateRecoveryDecision,
  validateCanonicalUpdateEvidence,
} from "@/lib/installation/update-contract";
import { briefingReconciliationCompatibilitySql } from "@/lib/installation/automation.server";
import { withdrawnReleaseReason } from "@/lib/installation/manager-contract";

const automation = readFileSync("src/lib/installation/automation.server.ts", "utf8");
const runner = readFileSync("src/lib/installation/runner.server.ts", "utf8");
const manager = readFileSync("src/lib/installation/manager.functions.ts", "utf8");
const sql = readFileSync("supabase/master/003_control_plane_deterministic_update.sql", "utf8");
const NOW = Date.parse("2026-09-20T12:00:00Z");

describe("contrato determinístico de UPDATE", () => {
  const evidence = {
    targetRelease: "1.4.17",
    targetCommitSha: "abcdef1234567890",
    packageSha256: "a".repeat(64),
    totalMigrations: 87,
    publishedRelease: "1.4.17",
    publishedCommitSha: "abcdef1234567890",
    databaseReconciled: true,
    validationPassed: true,
  };

  it("aceita sucesso completo e rejeita falha antes ou durante migrations", () => {
    expect(validateCanonicalUpdateEvidence(evidence)).toEqual({ ok: true });
    expect(
      validateCanonicalUpdateEvidence({ ...evidence, databaseReconciled: false }),
    ).toMatchObject({ ok: false });
    expect(validateCanonicalUpdateEvidence({ ...evidence, totalMigrations: 0 })).toMatchObject({
      ok: false,
    });
  });

  it("rejeita produção/Control-plane divergentes e repetição com identidade diferente", () => {
    expect(
      validateCanonicalUpdateEvidence({ ...evidence, publishedRelease: "1.3.76" }),
    ).toMatchObject({ ok: false, reason: expect.stringContaining("diverge") });
    expect(
      validateCanonicalUpdateEvidence({ ...evidence, publishedCommitSha: "outro" }),
    ).toMatchObject({ ok: false });
  });

  it("classifica pending sem lease, timeout, concorrência e manual_review", () => {
    expect(
      updateRecoveryDecision(
        { installationStatus: "updating", operationStatus: "pending", automated: true },
        NOW,
      ),
    ).toBe("resume");
    expect(
      updateRecoveryDecision(
        {
          installationStatus: "updating",
          operationStatus: "running",
          automated: true,
          leaseOwner: "worker-a",
          leaseExpiresAt: new Date(NOW + 10_000).toISOString(),
        },
        NOW,
      ),
    ).toBe("wait");
    expect(
      updateRecoveryDecision(
        {
          installationStatus: "updating",
          operationStatus: "running",
          automated: true,
          leaseOwner: "worker-a",
          leaseExpiresAt: new Date(NOW - 1).toISOString(),
        },
        NOW,
      ),
    ).toBe("resume");
    expect(
      updateRecoveryDecision({ installationStatus: "updating", operationStatus: "manual_review" }),
    ).toBe("manual_review");
    expect(updateRecoveryDecision({ installationStatus: "updating" })).toBe("inconsistent");
  });

  it("faz promoção somente na finalização atômica fenced", () => {
    const finalUpdate = automation.slice(automation.lastIndexOf("const finishByGitPush"));
    expect(automation).not.toMatch(/from\("installations"\)[\s\S]{0,300}pinned_release/);
    expect(finalUpdate).toContain("finalizeOperation(client as never, operation as never, {");
    expect(finalUpdate).not.toContain(".catch(() => undefined)");
    expect(runner).toContain('if (kind === "update")');
    expect(runner).toMatch(
      /if \(kind === "update"\) \{\s*throw new InstallationLeaseLostError\(\);/,
    );
    expect(sql).toContain("lease_expires_at > now()");
    expect(sql).toContain("pinned_release = CASE");
    expect(sql).toContain("active_operation_id = _operation_id");
  });

  it("bloqueia ledger incompleto, pacote divergente e evidência parcial", () => {
    expect(sql).toContain("_completed_migrations <> _package_total");
    expect(sql).toContain("_minimum_position <> 1");
    expect(sql).toContain("_maximum_position <> _package_total");
    expect(sql).toContain("_distinct_positions <> _package_total");
    expect(sql).toContain("fingerprint !~ '^[0-9a-f]{64}$'");
    expect(sql).toContain("baseline_hash");
    expect(sql).toContain("updateDatabaseReconciled");
    expect(sql).toContain("updateValidationPassed");
    expect(sql).toContain("Evidência canônica do UPDATE incompleta ou divergente");
    expect(sql).toContain("Ledger canônico do UPDATE incompleto ou inconsistente");
  });

  it("mantém uma única promoção e não inventa histórico", () => {
    expect(sql).not.toMatch(/INSERT\s+INTO\s+public\.installation_operation_migrations/i);
    expect(sql).not.toMatch(/INSERT\s+INTO\s+supabase_migrations/i);
    expect(sql).toContain("reconciliationState', 'reconciled'");
    expect(sql).toContain("_operation_status = 'success'");
  });

  it("recolhe a 1.4.38 e limita a ponte ao fingerprint publicado da migration 92", () => {
    expect(withdrawnReleaseReason("1.4.38")).toContain("recolhida");
    expect(withdrawnReleaseReason("1.4.39")).toBeNull();
    const affected = briefingReconciliationCompatibilitySql({
      file: "20260925005926_294912da-2c88-4927-9af7-98c2e524c156.sql",
      canonicalSha256: "96e39db3172c98d426f444b652d420b55abbaf5cdd5d58bc39c2e4650d2c83f7",
    });
    expect(affected).toContain("create or replace function public.jsonb_object_length");
    expect(affected).toContain("revoke all on function public.jsonb_object_length");
    expect(
      briefingReconciliationCompatibilitySql({
        file: "20260925005926_294912da-2c88-4927-9af7-98c2e524c156.sql",
        canonicalSha256: "0".repeat(64),
      }),
    ).toBeNull();
    expect(automation).toContain("withdrawnReleaseReason(input.snapshot.version)");
    expect(manager).toContain("withdrawnReleaseReason(snapshot.version)");
    expect(manager).toContain('.eq("status", "failed")');
    expect(manager).toContain("retryOfOperationId: data.retryOfOperationId ?? null");
  });
});
