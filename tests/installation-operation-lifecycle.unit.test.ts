import { describe, expect, it } from "vitest";

import {
  STALE_OPERATION_MS,
  canStartOperation,
  isOperationStale,
  lastSignalAt,
  operationStatusFromSteps,
  initialSteps,
  stepsProgress,
} from "@/lib/installation/manager-contract";
import retryAccountingSql from "../supabase/migrations/20260913230055_f50b7d0b-e5e5-4cc8-9ad0-ddcfd8104005.sql?raw";
import deferSql from "../supabase/migrations/20260914003510_de477c51-5d2f-436b-af5c-c17ea96d7bdd.sql?raw";
import canonicalAttemptsSql from "../supabase/migrations/20260914141212_3f236ac3-b474-429e-9cae-7bd7a2e303bb.sql?raw";
import sealedPackageSql from "../supabase/migrations/20260914193902_b2da0b29-18e7-4dee-b276-428a57155c36.sql?raw";
import sealedPackageStrictHashSql from "../supabase/migrations/20260914194505_2a76102f-5090-46e6-9269-f3c0f1bd057f.sql?raw";
import durableStartSql from "../supabase/migrations/20260915095958_eb639764-7956-418c-8ed9-9b9fde0246a3.sql?raw";
import failedProvisionRetrySql from "../supabase/migrations/20260916140310_b0a7973f-0881-4ef0-9b48-a19202063e8d.sql?raw";

const NOW = Date.parse("2026-01-10T12:00:00.000Z");

function op(
  overrides: Partial<{
    status: "pending" | "running" | "retryable" | "success" | "failed";
    startedAt: string;
    lastReportAt: string | null;
  }>,
) {
  return {
    status: "running" as const,
    startedAt: new Date(NOW - 60_000).toISOString(),
    lastReportAt: null,
    ...overrides,
  };
}

describe("operação travada", () => {
  it("operação viva reportando há pouco NÃO é travada", () => {
    expect(isOperationStale(op({ lastReportAt: new Date(NOW - 10_000).toISOString() }), NOW)).toBe(
      false,
    );
  });

  it("operação viva sem report além do limite é travada", () => {
    expect(
      isOperationStale(
        op({
          startedAt: new Date(NOW - STALE_OPERATION_MS - 60_000).toISOString(),
          lastReportAt: new Date(NOW - STALE_OPERATION_MS - 30_000).toISOString(),
        }),
        NOW,
      ),
    ).toBe(true);
  });

  it("operação encerrada nunca é travada", () => {
    expect(
      isOperationStale(
        op({ status: "failed", startedAt: new Date(NOW - 10 * STALE_OPERATION_MS).toISOString() }),
        NOW,
      ),
    ).toBe(false);
  });

  it("operação aguardando nova tentativa continua ativa e pode ficar travada", () => {
    expect(
      isOperationStale(
        op({ status: "retryable", startedAt: "2026-09-13T10:00:00.000Z", lastReportAt: null }),
        Date.parse("2026-09-13T10:10:00.000Z"),
      ),
    ).toBe(true);
  });

  it("último sinal considera o report mais recente", () => {
    const started = new Date(NOW - 300_000).toISOString();
    const report = new Date(NOW - 5_000).toISOString();
    expect(lastSignalAt(op({ startedAt: started, lastReportAt: report }))).toBe(Date.parse(report));
  });
});

describe("reinício e nova tentativa", () => {
  it("instalação com erro aceita novo provisionamento", () => {
    expect(canStartOperation("provision", "error")).toBe(true);
  });

  it("instalação em atenção (após cancelamento) aceita novo provisionamento", () => {
    expect(canStartOperation("provision", "attention")).toBe(true);
  });

  it("instalação provisionando NÃO aceita novo disparo", () => {
    expect(canStartOperation("provision", "provisioning")).toBe(false);
  });
});

describe("contagem de falhas consecutivas", () => {
  it("claim não consome o limite reservado para falhas reais", () => {
    const claimStart = retryAccountingSql.indexOf(
      "CREATE OR REPLACE FUNCTION public.claim_stale_installation_operations",
    );
    const claimEnd = retryAccountingSql.indexOf(
      "CREATE OR REPLACE FUNCTION public.yield_installation_operation",
    );
    const claimSql = retryAccountingSql.slice(claimStart, claimEnd);

    expect(claimSql).not.toMatch(/attempt_count\s*=\s*op\.attempt_count\s*\+\s*1/i);
    expect(claimSql).toContain("fencing_token=op.fencing_token+1");
  });

  it("yield fecha a fatia saudável e reinicia falhas consecutivas", () => {
    const yieldStart = retryAccountingSql.indexOf(
      "CREATE OR REPLACE FUNCTION public.yield_installation_operation",
    );
    const yieldEnd = retryAccountingSql.indexOf(
      "CREATE OR REPLACE FUNCTION public.retry_installation_operation",
    );
    const yieldSql = retryAccountingSql.slice(yieldStart, yieldEnd);

    expect(yieldSql).toContain("attempt_count=0");
    expect(yieldSql).toContain("status='completed'");
    expect(yieldSql).toContain("a.fencing_token=c.fencing_token");
  });

  it("retry contabiliza uma única falha e fecha a execução correspondente", () => {
    const retryStart = retryAccountingSql.indexOf(
      "CREATE OR REPLACE FUNCTION public.retry_installation_operation",
    );
    const retrySql = retryAccountingSql.slice(retryStart);

    expect(retrySql.match(/attempt_count=attempt_count\+1/g)).toHaveLength(1);
    expect(retrySql).toContain("a.fencing_token=c.fencing_token");
    expect(retrySql).toContain(
      "status=CASE WHEN c.status='manual_review' THEN 'exhausted' ELSE 'retryable' END",
    );
  });

  it("cron permite que a fatia termine antes de considerar timeout", () => {
    expect(retryAccountingSql).toContain("timeout_milliseconds := 60000");
  });

  it("defer preserva falhas consecutivas e fecha a tentativa sem erro do destino", () => {
    expect(deferSql).not.toMatch(/attempt_count\s*=|attempt_count\s*\+/i);
    expect(deferSql).toContain("status = 'deferred'");
    expect(deferSql).toContain("_error_detail");
    expect(deferSql).toContain("REVOKE ALL ON FUNCTION public.defer_installation_operation");
  });

  it("heartbeat, checkpoint e finalização mantêm a tentativa na mesma transação", () => {
    expect(canonicalAttemptsSql).toContain(
      "CREATE TABLE IF NOT EXISTS public.installation_operation_attempts",
    );
    expect(canonicalAttemptsSql).toContain("status = 'orphaned'");
    expect(canonicalAttemptsSql).toContain("reconcile_orphan_installation_attempts");
    expect(
      canonicalAttemptsSql.match(/UPDATE public\.installation_operation_attempts/g)?.length,
    ).toBeGreaterThanOrEqual(4);
    expect(canonicalAttemptsSql).toContain("a.fencing_token = s.fencing_token");
    expect(canonicalAttemptsSql).toContain("fencing_token = _fencing_token");
  });

  it("snapshot legado só é selado com lease/fencing e nunca é substituído", () => {
    const sql = `${sealedPackageSql}\n${sealedPackageStrictHashSql}`;
    expect(sql).toContain("seal_installation_operation_baseline");
    expect(sealedPackageSql).toContain("lease_owner = _owner");
    expect(sealedPackageSql).toContain("fencing_token = _fencing_token");
    expect(sealedPackageSql).toContain("lease_expires_at > now()");
    expect(sealedPackageSql).toContain("baseline_id IS NULL OR baseline_id = _baseline_id");
    expect(sealedPackageSql).toContain("baseline_hash IS NULL OR baseline_hash = _baseline_hash");
    expect(sealedPackageSql).toContain(
      "REVOKE ALL ON FUNCTION public.seal_installation_operation_baseline",
    );
    expect(sealedPackageStrictHashSql).toContain('_baseline_hash COLLATE "C"');
  });

  it("abertura durável é versionada, atômica e restrita ao service_role", () => {
    expect(durableStartSql).toContain(
      "CREATE OR REPLACE FUNCTION public.start_durable_installation_operation",
    );
    expect(durableStartSql).toContain("FOR UPDATE");
    expect(durableStartSql).toContain("installation_operation_steps");
    expect(durableStartSql).not.toContain("installation_operation_outbox");
    expect(durableStartSql).toContain(
      "REVOKE ALL ON FUNCTION public.start_durable_installation_operation",
    );
    expect(durableStartSql).toContain("TO service_role");
  });

  it("retry terminal cria nova operação e preserva a failed anterior", () => {
    expect(failedProvisionRetrySql).toContain("_retry_of_operation_id uuid DEFAULT NULL");
    expect(failedProvisionRetrySql).toContain("RETURNING * INTO _operation");
    expect(failedProvisionRetrySql).toContain("_retry_operation.status <> 'failed'");
    expect(failedProvisionRetrySql).toContain("_retry_operation.kind <> 'provision'");
    expect(failedProvisionRetrySql).toContain("_installation.last_provisioned_at IS NOT NULL");
    expect(failedProvisionRetrySql).toContain("status = 'success'");
    expect(failedProvisionRetrySql).toContain("'retryOfOperationId', _retry_of_operation_id");
    expect(failedProvisionRetrySql).not.toMatch(
      /UPDATE\s+public\.installation_operations\s+SET[\s\S]*WHERE\s+id\s*=\s*_retry_of_operation_id/i,
    );
  });

  it("retry terminal mantém lock atômico e não altera UPDATE, lease ou fencing", () => {
    expect(failedProvisionRetrySql).toContain("FOR UPDATE");
    expect(failedProvisionRetrySql).toContain("status IN ('pending', 'running', 'retryable')");
    expect(failedProvisionRetrySql).toContain("USING ERRCODE = '55P03'");
    expect(failedProvisionRetrySql).toContain("WHEN 'update' THEN 'updating'");
    expect(failedProvisionRetrySql).not.toMatch(/lease_owner\s*=/i);
    expect(failedProvisionRetrySql).not.toMatch(/fencing_token\s*=/i);
  });
});

describe("progresso por etapa", () => {
  it("provisionamento começa com 12 etapas pendentes", () => {
    const steps = initialSteps("provision");
    expect(steps).toHaveLength(12);
    expect(stepsProgress(steps).percent).toBe(0);
    expect(operationStatusFromSteps(steps)).toBe("pending");
  });

  it("etapa com erro marca a operação como falha", () => {
    const steps = initialSteps("provision").map((step, index) =>
      index === 0 ? { ...step, state: "error" as const } : step,
    );
    expect(operationStatusFromSteps(steps)).toBe("failed");
    expect(stepsProgress(steps).failed).toBe(1);
  });
});
