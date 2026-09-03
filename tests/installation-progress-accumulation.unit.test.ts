import { describe, expect, it } from "vitest";
import { applyProgressReport } from "@/lib/installation/runner.server";
import { buildInitialSteps } from "@/lib/installation/manager-contract";

/** Cliente Supabase falso com uma única linha de installation_operations. */
function fakeClient(initialSteps: unknown) {
  const row: { id: string; steps: unknown } = { id: "op-1", steps: initialSteps };
  const client = {
    from() {
      return {
        update(patch: Record<string, unknown>) {
          return {
            eq() {
              if ("steps" in patch) row.steps = patch.steps;
              return Promise.resolve({ error: null });
            },
          };
        },
        select() {
          return {
            eq() {
              return { maybeSingle: () => Promise.resolve({ data: { steps: row.steps }, error: null }) };
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
    const initial = buildInitialSteps("provision");
    const { client, row } = fakeClient(initial);
    const op = { id: "op-1", kind: "provision", steps: initial } as never;

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
