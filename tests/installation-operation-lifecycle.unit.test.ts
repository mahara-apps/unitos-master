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

const NOW = Date.parse("2026-01-10T12:00:00.000Z");

function op(overrides: Partial<{ status: "pending" | "running" | "retryable" | "success" | "failed"; startedAt: string; lastReportAt: string | null }>) {
  return {
    status: "running" as const,
    startedAt: new Date(NOW - 60_000).toISOString(),
    lastReportAt: null,
    ...overrides,
  };
}

describe("operação travada", () => {
  it("operação viva reportando há pouco NÃO é travada", () => {
    expect(
      isOperationStale(op({ lastReportAt: new Date(NOW - 10_000).toISOString() }), NOW),
    ).toBe(false);
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
    const claimStart = retryAccountingSql.indexOf("CREATE OR REPLACE FUNCTION public.claim_stale_installation_operations");
    const claimEnd = retryAccountingSql.indexOf("CREATE OR REPLACE FUNCTION public.yield_installation_operation");
    const claimSql = retryAccountingSql.slice(claimStart, claimEnd);

    expect(claimSql).not.toMatch(/attempt_count\s*=\s*op\.attempt_count\s*\+\s*1/i);
    expect(claimSql).toContain("fencing_token=op.fencing_token+1");
  });

  it("yield fecha a fatia saudável e reinicia falhas consecutivas", () => {
    const yieldStart = retryAccountingSql.indexOf("CREATE OR REPLACE FUNCTION public.yield_installation_operation");
    const yieldEnd = retryAccountingSql.indexOf("CREATE OR REPLACE FUNCTION public.retry_installation_operation");
    const yieldSql = retryAccountingSql.slice(yieldStart, yieldEnd);

    expect(yieldSql).toContain("attempt_count=0");
    expect(yieldSql).toContain("status='completed'");
    expect(yieldSql).toContain("a.fencing_token=c.fencing_token");
  });

  it("retry contabiliza uma única falha e fecha a execução correspondente", () => {
    const retryStart = retryAccountingSql.indexOf("CREATE OR REPLACE FUNCTION public.retry_installation_operation");
    const retrySql = retryAccountingSql.slice(retryStart);

    expect(retrySql.match(/attempt_count=attempt_count\+1/g)).toHaveLength(1);
    expect(retrySql).toContain("a.fencing_token=c.fencing_token");
    expect(retrySql).toContain("status=CASE WHEN c.status='manual_review' THEN 'exhausted' ELSE 'retryable' END");
  });

  it("cron permite que a fatia termine antes de considerar timeout", () => {
    expect(retryAccountingSql).toContain("timeout_milliseconds := 60000");
  });

  it("defer preserva falhas consecutivas e fecha a tentativa sem erro do destino", () => {
    expect(deferSql).not.toMatch(/attempt_count\s*=|attempt_count\s*\+/i);
    expect(deferSql).toContain("status = 'deferred'");
    expect(deferSql).toContain("failureSource");
    expect(deferSql).toContain("REVOKE ALL ON FUNCTION public.defer_installation_operation");
  });
});

describe("progresso por etapa", () => {
  it("provisionamento começa com 11 etapas pendentes", () => {
    const steps = initialSteps("provision");
    expect(steps).toHaveLength(11);
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
