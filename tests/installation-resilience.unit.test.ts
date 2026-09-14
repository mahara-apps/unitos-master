import { describe, expect, it, vi } from "vitest";

import {
  readOperationControlState,
  shouldInterruptOperation,
} from "@/lib/installation/automation.server";
import { readCredentialRowReliable } from "@/lib/installation/credentials.server";
import {
  InstallationReadError,
  classifyReadFailure,
  readWithBackoff,
} from "@/lib/installation/resilience.server";
import { deferOperation } from "@/lib/installation/runner.server";
import { resumeFailureAction } from "@/lib/installation/resume-worker.server";

function queryClient(results: Array<{ data: unknown; error?: unknown }>) {
  let index = 0;
  const maybeSingle = vi.fn(async () => results[Math.min(index++, results.length - 1)]);
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle,
  };
  return { client: { from: () => chain }, maybeSingle };
}

describe("resiliência das leituras do MASTER", () => {
  it.each([
    [{ message: "statement timeout", code: "57014" }, "timeout"],
    [{ message: "Gateway Timeout", status: 504 }, "server_error"],
    [{ message: "Too many requests", status: 429 }, "rate_limit"],
    [{ message: "fetch failed" }, "connection"],
  ] as const)("classifica %o como %s", (cause, expected) => {
    expect(classifyReadFailure(cause)).toBe(expected);
  });

  it("aplica backoff exponencial com jitter e para após sucesso", async () => {
    const sleeps: number[] = [];
    let calls = 0;
    const result = await readWithBackoff(
      async () => {
        calls += 1;
        if (calls < 3) return { data: null, error: { message: "fetch failed" } };
        return { data: "ok" };
      },
      { attempts: 4, baseDelayMs: 100, random: () => 0.5, sleep: async (ms) => { sleeps.push(ms); } },
    );
    expect(result).toBe("ok");
    expect(calls).toBe(3);
    expect(sleeps).toEqual([120, 240]);
  });

  it("cofre indisponível tenta novamente e falha fechado", async () => {
    const { client, maybeSingle } = queryClient([
      { data: null, error: { message: "Gateway Timeout", status: 504 } },
    ]);
    await expect(readCredentialRowReliable(client as never, "inst-1", {
      attempts: 3,
      baseDelayMs: 1,
      random: () => 0,
      sleep: async () => undefined,
    })).rejects.toMatchObject({ name: "InstallationReadError", kind: "server_error" });
    expect(maybeSingle).toHaveBeenCalledTimes(3);
  });

  it("data=null + error nunca vira registro ausente", async () => {
    const { client } = queryClient([{ data: null, error: { code: "57014", message: "timeout" } }]);
    await expect(readCredentialRowReliable(client as never, "inst-1", {
      attempts: 1,
      sleep: async () => undefined,
    })).rejects.toMatchObject({ name: "InstallationReadError", kind: "timeout" });
  });

  it("ausência legítima sem erro continua distinguível", async () => {
    const { client } = queryClient([{ data: null, error: null }]);
    await expect(readCredentialRowReliable(client as never, "inst-1", {
      attempts: 1,
      sleep: async () => undefined,
    })).resolves.toBeNull();
  });
});

describe("regressão do falso cancelamento 1.3.89", () => {
  const operation = { id: "op-taveira", fencing_token: 90 };

  it("reproduz data=null+erro no fencing e não acusa Super Admin", async () => {
    const { client } = queryClient([{ data: null, error: { message: "Gateway Timeout", status: 504 } }]);
    await expect(shouldInterruptOperation(client as never, operation, {
      attempts: 1,
      sleep: async () => undefined,
    })).rejects.toMatchObject({ name: "InstallationReadError", kind: "server_error" });

    const management = {
      query: vi.fn(async (sql: string) => ({
        ok: true,
        rows: sql.startsWith("select exists") ? [{ initialized: true }] : [],
      })),
    };
    const { applyStatementByStatement } = await import("@/lib/installation/automation.server");
    let detail = "";
    try {
      await applyStatementByStatement(management, "select 1;", {
        isCancelled: () => shouldInterruptOperation(client as never, operation, {
          attempts: 1,
          sleep: async () => undefined,
        }),
      });
    } catch (cause) {
      detail = cause instanceof Error ? cause.message : String(cause);
    }
    expect(detail).toContain("MASTER");
    expect(detail).not.toContain("Super Admin");
  });

  it("leitura vazia sem erro também não vira cancelamento", async () => {
    const { client } = queryClient([{ data: null, error: null }]);
    await expect(shouldInterruptOperation(client as never, operation, {
      attempts: 1,
      sleep: async () => undefined,
    })).rejects.toMatchObject({ name: "InstallationReadError", kind: "connection" });
  });

  it("fencing divergente confirmado ainda interrompe", async () => {
    const { client } = queryClient([{ data: { status: "running", fencing_token: 91 } }]);
    await expect(shouldInterruptOperation(client as never, operation, { attempts: 1 })).resolves.toBe(true);
  });

  it("cancelamento humano confirmado ainda interrompe", async () => {
    const { client } = queryClient([{ data: { status: "failed", fencing_token: 90 } }]);
    await expect(shouldInterruptOperation(client as never, operation, { attempts: 1 })).resolves.toBe(true);
  });

  it("estado ativo e fencing atual continuam a execução", async () => {
    const { client } = queryClient([{ data: { status: "running", fencing_token: 90 } }]);
    await expect(shouldInterruptOperation(client as never, operation, { attempts: 1 })).resolves.toBe(false);
  });
});

describe("falha do MASTER antes do destino", () => {
  it("é classificada para defer mesmo após a fatia iniciar", () => {
    const error = new InstallationReadError("timeout", "MASTER indisponível");
    expect(resumeFailureAction(error, "transient")).toBe("defer");
  });

  it("defer chama a RPC sem attempt_count e registra origem MASTER", async () => {
    const rpc = vi.fn(async () => ({ data: true, error: null }));
    await deferOperation({ rpc } as never, {
      id: "op-1",
      lease_owner: "worker-1",
      fencing_token: 90,
      attempt_count: 2,
    } as never, "master_timeout", "MASTER indisponível", 30);
    expect(rpc).toHaveBeenCalledWith("defer_installation_operation", expect.objectContaining({
      _operation_id: "op-1",
      _error_kind: "master_timeout",
      _error_detail: expect.objectContaining({ failureSource: "master" }),
    }));
    expect(JSON.stringify(rpc.mock.calls[0])).not.toContain("attempt_count");
  });
});