import { describe, expect, it, vi } from "vitest";

import {
  applyStatementByStatement,
  createManagementClient,
  DONE,
  mergeBaselineProgress,
  readFirstAccessState,
  saveBaselineProgress,
  saveStageProgress,
} from "@/lib/installation/automation.server";
import {
  assertNoActiveInstallationOperation,
  resolveInstallationManagerAccess,
  resolveOperationRowsRead,
  resolveRunningProvisionRead,
} from "@/lib/installation/manager.functions";
import {
  resolveInstallationSettingsRead,
  resolveServiceStateRead,
  UNAVAILABLE_SERVICE_STATE,
} from "@/lib/installation-settings.server";
import { remoteServiceStateWasConfirmed } from "@/lib/installation/service-state.server";

function operationQuery(result: { data: unknown; error?: unknown }) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    maybeSingle: async () => result,
  };
  return { from: () => chain };
}

describe("ocorrência 1 — parser da Management API", () => {
  it("erro/timeout: HTTP 200 ilegível nunca vira sucesso vazio", async () => {
    const client = createManagementClient({
      token: "token",
      projectRef: "project",
      fetchImpl: vi.fn(async () => new Response("<html>proxy</html>", { status: 200 })) as never,
    });
    await expect(client.query("select 1")).resolves.toMatchObject({
      ok: false,
      rows: [],
      error: "resposta ilegível da Management API",
    });
  }, 15_000);

  it("vazio real: array JSON vazio permanece resposta válida", async () => {
    const client = createManagementClient({
      token: "token",
      projectRef: "project",
      fetchImpl: vi.fn(async () => Response.json([])) as never,
    });
    await expect(client.query("select 1 where false")).resolves.toEqual({ ok: true, rows: [] });
  });

  it("resposta válida: linhas são preservadas", async () => {
    const client = createManagementClient({
      token: "token",
      projectRef: "project",
      fetchImpl: vi.fn(async () => Response.json([{ value: 1 }])) as never,
    });
    await expect(client.query("select 1 as value")).resolves.toEqual({
      ok: true,
      rows: [{ value: 1 }],
    });
  });
});

describe("ocorrência 2 — marcador interno e loop 25/34", () => {
  const sql = Array.from({ length: 34 }, (_, index) => `SELECT ${index};`).join("\n");

  it("erro/timeout: marcador indisponível preserva o índice 25 e não executa SQL", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, rows: [] })
      .mockResolvedValueOnce({ ok: false, rows: [], error: "timeout" });
    await expect(applyStatementByStatement({ query }, sql, { startIndex: 25 })).resolves.toMatchObject({
      ok: false,
      error: "timeout",
      processed: 25,
    });
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("vazio real: marcador sem linha não reinicia no comando zero", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, rows: [] })
      .mockResolvedValueOnce({ ok: true, rows: [] });
    await expect(applyStatementByStatement({ query }, sql, { startIndex: 25 })).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining("resposta vazia"),
      processed: 25,
    });
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("resposta válida: retoma em 25, conclui 34 e preserva DONE", async () => {
    const batches: string[] = [];
    const query = vi.fn(async (statement: string) => {
      batches.push(statement);
      if (statement.startsWith("select exists")) return { ok: true, rows: [{ initialized: true }] };
      return { ok: true, rows: [] };
    });
    await expect(applyStatementByStatement({ query }, sql, { startIndex: 25 })).resolves.toMatchObject({
      ok: true,
      processed: 34,
      total: 34,
      complete: true,
    });
    expect(batches.join("\n")).not.toContain("SELECT 0");
    expect(mergeBaselineProgress({ migration: 25 }, { migration: DONE })).toEqual({ migration: DONE });
    expect(mergeBaselineProgress({ migration: DONE }, { migration: 25 })).toEqual({ migration: DONE });
  });
});

describe("ocorrência 3 — checkpoint persistido", () => {
  const operation = { id: "op-1", lease_owner: null, fencing_token: null, steps: [] } as never;

  function checkpointClient(readResult: { data: unknown; error?: unknown }, rpcResult = { data: true, error: null }) {
    return {
      ...operationQuery(readResult),
      rpc: vi.fn(async () => rpcResult),
    };
  }

  it("erro/timeout: operação legada também interrompe a fatia", async () => {
    const client = checkpointClient({ data: null, error: { message: "timeout" } });
    await expect(saveBaselineProgress(client as never, operation, { migration: 25 })).rejects.toMatchObject({
      message: "timeout",
    });
  });

  it("vazio real: operação ausente não finge checkpoint salvo", async () => {
    const client = checkpointClient({ data: null, error: null });
    await expect(saveBaselineProgress(client as never, operation, { migration: 25 })).rejects.toThrow(
      "Operação não encontrada",
    );
  });

  it("resposta válida: salva checkpoint monotônico", async () => {
    const client = checkpointClient({ data: { detail: { baselineProgress: { migration: 24 } } }, error: null });
    await expect(saveBaselineProgress(client as never, operation, { migration: 25 })).resolves.toBeUndefined();
    expect(client.rpc).toHaveBeenCalledWith(
      "checkpoint_installation_operation",
      expect.objectContaining({
        _detail: expect.objectContaining({ baselineProgress: { migration: 25 } }),
      }),
    );
  });

  it("erro/timeout no checkpoint de etapa também interrompe", async () => {
    const client = checkpointClient({ data: null, error: { message: "timeout" } });
    await expect(saveStageProgress(client as never, operation, { codeDone: true })).rejects.toMatchObject({
      message: "timeout",
    });
  });

  it("vazio real no checkpoint de etapa não finge sucesso", async () => {
    const client = checkpointClient({ data: null, error: null });
    await expect(saveStageProgress(client as never, operation, { codeDone: true })).rejects.toThrow(
      "Operação não encontrada",
    );
  });

  it("resposta válida salva checkpoint de etapa", async () => {
    const client = checkpointClient({ data: { detail: { stageProgress: {} } }, error: null });
    await expect(saveStageProgress(client as never, operation, { codeDone: true })).resolves.toBeUndefined();
    expect(client.rpc).toHaveBeenCalledWith(
      "checkpoint_installation_operation",
      expect.objectContaining({
        _detail: expect.objectContaining({ stageProgress: { codeDone: true } }),
      }),
    );
  });
});

describe("ocorrência 4 — estado operacional local", () => {
  it("erro/timeout: leitura falha não vira active", () => {
    expect(() => resolveServiceStateRead({ data: null, error: { message: "timeout" } })).toThrow("timeout");
    expect(UNAVAILABLE_SERVICE_STATE.state).toBe("maintenance");
  });

  it("vazio real: instalação antiga sem linha continua ativa", () => {
    expect(resolveServiceStateRead({ data: null, error: null })).toMatchObject({ state: "active" });
  });

  it("resposta válida: suspensão é preservada", () => {
    expect(
      resolveServiceStateRead({
        data: { service_state: "suspended", service_message: "Bloqueado", service_until: null },
        error: null,
      }),
    ).toEqual({ state: "suspended", message: "Bloqueado", until: null });
  });
});

describe("ocorrência 5 — checagem de operação ativa", () => {
  it("erro/timeout: aborta antes de criar outra operação", async () => {
    await expect(
      assertNoActiveInstallationOperation(
        operationQuery({ data: null, error: { message: "timeout" } }) as never,
        "inst-1",
      ),
    ).rejects.toMatchObject({ message: "timeout" });
  });

  it("vazio real: ausência confirmada libera a criação", async () => {
    await expect(
      assertNoActiveInstallationOperation(operationQuery({ data: null, error: null }) as never, "inst-1"),
    ).resolves.toBeUndefined();
  });

  it("resposta válida: operação existente bloqueia duplicata", async () => {
    await expect(
      assertNoActiveInstallationOperation(operationQuery({ data: { id: "op-1" }, error: null }) as never, "inst-1"),
    ).rejects.toThrow("Já existe uma operação");
  });
});

describe("ocorrência 6 — primeiro acesso escalar", () => {
  it("erro/timeout: permanece pendente", async () => {
    await expect(
      readFirstAccessState({ query: async () => ({ ok: false, rows: [], error: "timeout" }) }),
    ).resolves.toMatchObject({ superAdmin: "pending", workspace: "pending" });
  });

  it("vazio real impossível: resposta vazia não inventa ausência", async () => {
    await expect(
      readFirstAccessState({ query: async () => ({ ok: true, rows: [] }) }),
    ).resolves.toMatchObject({ superAdmin: "pending", workspace: "pending" });
  });

  it("resposta válida: informa presença real", async () => {
    await expect(
      readFirstAccessState({
        query: async () => ({ ok: true, rows: [{ has_super_admin: true, brand_count: 1 }] }),
      }),
    ).resolves.toMatchObject({ superAdmin: "ok", workspace: "ok" });
  });
});

describe("ocorrência 7 — confirmação do estado remoto", () => {
  it("erro/timeout: não confirma a alteração", () => {
    expect(remoteServiceStateWasConfirmed({ ok: false, rows: [] })).toBe(false);
  });

  it("vazio real: ausência do resultado obrigatório não vira sucesso", () => {
    expect(remoteServiceStateWasConfirmed({ ok: true, rows: [] })).toBe(false);
  });

  it("resposta válida: confirma somente quando uma linha foi alterada", () => {
    expect(remoteServiceStateWasConfirmed({ ok: true, rows: [{ matched: 1 }] })).toBe(true);
    expect(remoteServiceStateWasConfirmed({ ok: true, rows: [{ matched: 0 }] })).toBe(false);
  });
});

describe("ocorrência 8 — configuração e branding", () => {
  it("erro/timeout: sem cache não inventa configuração vazia", () => {
    expect(() => resolveInstallationSettingsRead({ data: null, error: { message: "timeout" } })).toThrow(
      "timeout",
    );
  });

  it("vazio real: singleton ausente devolve configuração vazia", () => {
    expect(resolveInstallationSettingsRead({ data: null, error: null })).toMatchObject({
      appUrl: null,
      logoUrl: null,
    });
  });

  it("resposta válida: preserva branding da instalação", () => {
    expect(
      resolveInstallationSettingsRead({
        data: { app_url: "https://cliente.example", logo_url: "https://cliente.example/logo.png" },
        error: null,
      }),
    ).toMatchObject({ appUrl: "https://cliente.example", logoUrl: "https://cliente.example/logo.png" });
  });
});

describe("ocorrência 9 — acesso ao gerenciador", () => {
  it("erro/timeout: não converte indisponibilidade em falta de papel", async () => {
    await expect(
      resolveInstallationManagerAccess(async () => {
        throw new Error("timeout");
      }),
    ).rejects.toThrow("timeout");
  });

  it("vazio real: papel ausente retorna false", async () => {
    await expect(resolveInstallationManagerAccess(async () => false)).resolves.toBe(false);
  });

  it("resposta válida: Super Admin confirmado retorna true", async () => {
    await expect(resolveInstallationManagerAccess(async () => true)).resolves.toBe(true);
  });
});

describe("ocorrência 10 — lista para reconciliação", () => {
  it("erro/timeout: não vira lista vazia", () => {
    expect(() => resolveOperationRowsRead({ data: null, error: new Error("timeout") })).toThrow("timeout");
  });

  it("vazio real: ausência confirmada permanece lista vazia", () => {
    expect(resolveOperationRowsRead({ data: [], error: null })).toEqual([]);
  });

  it("resposta válida: operações são preservadas", () => {
    expect(resolveOperationRowsRead({ data: [{ id: "op-1" }], error: null })).toEqual([{ id: "op-1" }]);
  });
});

describe("ocorrência 11 — operação corrente na adoção manual", () => {
  it("erro/timeout: não vira operação ausente", () => {
    expect(() => resolveRunningProvisionRead({ data: null, error: new Error("timeout") })).toThrow("timeout");
  });

  it("vazio real: ausência confirmada retorna null", () => {
    expect(resolveRunningProvisionRead({ data: [], error: null })).toBeNull();
  });

  it("resposta válida: operação corrente é preservada", () => {
    expect(resolveRunningProvisionRead({ data: [{ id: "op-1" }], error: null })).toEqual({ id: "op-1" });
  });
});