import { describe, expect, it } from "vitest";
import { applyProgressReport } from "@/lib/installation/runner.server";
import { applyStepReport, initialSteps, stepsProgress } from "@/lib/installation/manager-contract";
import { validateCanonicalMigrationProgress } from "@/lib/installation/automation.server";

/** Cliente Supabase falso com uma única linha de installation_operations. */
function fakeClient(initialSteps: unknown) {
  const row: { id: string; steps: unknown } = { id: "op-1", steps: initialSteps };
  const mutation = (patch: Record<string, unknown>) => {
    const chain = {
      eq: () => chain,
      in: () => chain,
      select: () => chain,
      maybeSingle: async () => {
        if ("steps" in patch) row.steps = patch.steps;
        return { data: { id: row.id }, error: null };
      },
    };
    return chain;
  };
  const client = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name === "checkpoint_installation_operation" && "_steps" in args) {
        const incoming = args["_steps"] as Array<{
          id: string;
          state?: string;
          percent?: number | null;
        }>;
        const current = row.steps as Array<{ id: string; state?: string; percent?: number | null }>;
        row.steps = current.map((step) => {
          const next = incoming.find((item) => item.id === step.id);
          if (!next) return step;
          return {
            ...step,
            ...next,
            state: step.state === "done" || next.state === "done" ? "done" : next.state,
            percent: Math.max(step.percent ?? 0, next.percent ?? 0),
          };
        });
      }
      return { data: true, error: null };
    },
    from() {
      return {
        update: mutation,
        select() {
          return {
            eq() {
              return {
                maybeSingle: () => Promise.resolve({ data: { steps: row.steps }, error: null }),
              };
            },
          };
        },
      };
    },
  };
  return { client, row };
}

describe("applyProgressReport acumula etapas", () => {
  it("preserva etapas já concluídas ao reportar a próxima", async () => {
    const initial = initialSteps("provision");
    const { client, row } = fakeClient(initial);
    const op = {
      id: "op-1",
      kind: "provision",
      steps: initial,
      lease_owner: "test:worker",
      fencing_token: 1,
    } as never;

    await applyProgressReport(client as never, op, { step: "supabase", state: "done" });
    await applyProgressReport(client as never, op, { step: "database", state: "done" });
    const steps = await applyProgressReport(client as never, op, {
      step: "storage",
      state: "error",
      detail: "006_storage_policies falhou",
    });

    const byId = Object.fromEntries(steps.map((s) => [s.id, s.state]));
    expect(byId["supabase"]).toBe("done");
    expect(byId["database"]).toBe("done");
    expect(byId["storage"]).toBe("error");
    expect(steps.filter((s) => s.state === "done")).toHaveLength(2);
    expect(row.steps).toEqual(steps);
  });
});

describe("percentual por etapa", () => {
  it("guarda o percentual reportado e completa em 100% ao concluir", () => {
    let steps = initialSteps("provision");
    steps = applyStepReport(steps, { step: "code", state: "running", percent: 37.4 });
    expect(steps.find((s) => s.id === "code")?.percent).toBe(37);

    // Report sem percentual não apaga a última medição.
    steps = applyStepReport(steps, { step: "code", state: "running", detail: "publicando" });
    expect(steps.find((s) => s.id === "code")?.percent).toBe(37);

    steps = applyStepReport(steps, { step: "code", state: "done" });
    expect(steps.find((s) => s.id === "code")?.percent).toBe(100);
  });

  it("ignora relatório atrasado que reduziria percentual ou reabriria etapa concluída", () => {
    let steps = initialSteps("provision");
    steps = applyStepReport(steps, { step: "database", state: "running", percent: 86 });
    steps = applyStepReport(steps, { step: "database", state: "running", percent: 81 });
    expect(steps.find((s) => s.id === "database")?.percent).toBe(86);

    steps = applyStepReport(steps, { step: "database", state: "done" });
    steps = applyStepReport(steps, { step: "database", state: "running", percent: 90 });
    expect(steps.find((s) => s.id === "database")?.state).toBe("done");
    expect(steps.find((s) => s.id === "database")?.percent).toBe(100);
  });

  it("progresso geral conta a fração da etapa em execução", () => {
    let steps = initialSteps("provision");
    const total = steps.length;
    steps = applyStepReport(steps, { step: "supabase", state: "done" });
    const antes = stepsProgress(steps).percent;
    steps = applyStepReport(steps, { step: "code", state: "running", percent: 50 });
    const depois = stepsProgress(steps).percent;
    expect(depois).toBeGreaterThan(antes);
    expect(depois).toBe(Math.round(((1 + 0.5) / total) * 100));
  });
});

describe("regressão 88→86", () => {
  it("o checkpoint auxiliar nunca reenvia a fotografia antiga das etapas", async () => {
    const current = initialSteps("update").map((step) =>
      step.id === "database" ? { ...step, state: "running" as const, percent: 88 } : step,
    );
    const { client, row } = fakeClient(current);
    const stale = current.map((step) => (step.id === "database" ? { ...step, percent: 86 } : step));
    const op = {
      id: "op-1",
      kind: "update",
      steps: stale,
      lease_owner: "test:worker",
      fencing_token: 1,
    } as never;

    const { saveBaselineProgress } = await import("@/lib/installation/automation.server");
    await saveBaselineProgress(client as never, op, { migration: 25 });

    expect(
      (row.steps as Array<{ id: string; percent?: number }>).find((step) => step.id === "database")
        ?.percent,
    ).toBe(88);
  });

  it("preserva conclusões esparsas comprovadas sem inventar o prefixo ausente", () => {
    const migrations = [
      { file: "001.sql", fingerprint: "a", sql: "SELECT 1" },
      { file: "002.sql", fingerprint: "b", sql: "SELECT 2" },
      { file: "003.sql", fingerprint: "c", sql: "SELECT 3" },
    ];
    expect(
      validateCanonicalMigrationProgress(
        [
          {
            migration_file: "001.sql",
            fingerprint: "a",
            package_position: 1,
            statement_index: 1,
            total_statements: 1,
            status: "completed",
          },
          {
            migration_file: "003.sql",
            fingerprint: "c",
            package_position: 3,
            statement_index: 1,
            total_statements: 1,
            status: "completed",
          },
        ],
        migrations,
      ).completed,
    ).toEqual(new Set(["001.sql:a", "003.sql:c"]));
  });
});
