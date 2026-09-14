import { describe, expect, it, vi } from "vitest";

import { applyStatementByStatement } from "@/lib/installation/automation.server";

function canonicalDestination(initialIndex: number, total: number) {
  let checkpoint = initialIndex;
  const executed = new Set<number>();
  let failAfterCommit = false;
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("select statement_index")) {
      return { ok: true, rows: [{ statement_index: checkpoint, total_statements: total, status: "running" }] };
    }
    const selects = [...sql.matchAll(/EXECUTE \$unitos_stmt_\d+\$SELECT (\d+);/g)].map((match) => Number(match[1]));
    if (selects.length > 0) {
      const next = /values \('[^']*',\s*(\d+),\s*\d+,\s*'running'/i.exec(sql);
      for (const index of selects) executed.add(index);
      checkpoint = Number(next?.[1] ?? checkpoint);
      if (failAfterCommit) {
        failAfterCommit = false;
        return { ok: false, rows: [], error: "connection closed after commit" };
      }
    }
    return { ok: true, rows: [] };
  });
  return { query, executed, checkpoint: () => checkpoint, crashNext: () => { failAfterCommit = true; } };
}

describe("ensaio 81/103 → 103/103 com checkpoint canônico", () => {
  it("retoma no 82, sobrevive à perda de resposta e não repete 1–81", async () => {
    const total = 103;
    const sql = Array.from({ length: total }, (_, index) => `SELECT ${index + 1};`).join("\n");
    const destination = canonicalDestination(81, total);

    destination.crashNext();
    const interrupted = await applyStatementByStatement(destination, sql, {
      runKey: "op:migration:fingerprint",
      startIndex: 0,
      maxStatements: 25,
    });
    expect(interrupted).toMatchObject({ ok: false });
    expect(destination.checkpoint()).toBe(103);

    const resumed = await applyStatementByStatement(destination, sql, {
      runKey: "op:migration:fingerprint",
      startIndex: 0,
      maxStatements: 25,
    });
    expect(resumed).toMatchObject({ ok: true, processed: 103, total: 103, complete: true });
    expect([...destination.executed].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 22 }, (_, index) => index + 82),
    );
    expect(destination.query.mock.calls.some(([sqlText]) => String(sqlText).includes("SELECT 81;"))).toBe(false);
  });

  it("resposta vazia e checkpoint incompatível falham fechados", async () => {
    const empty = { query: vi.fn(async () => ({ ok: true, rows: [] })) };
    await expect(applyStatementByStatement(empty, "SELECT 1;", { startIndex: 1 })).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining("resposta vazia"),
    });
    const mismatch = {
      query: vi.fn(async (sql: string) => ({
        ok: true,
        rows: sql.includes("select statement_index")
          ? [{ statement_index: 81, total_statements: 102, status: "running" }]
          : [],
      })),
    };
    await expect(applyStatementByStatement(mismatch, "SELECT 1;", { startIndex: 1 })).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining("incompatível"),
    });
  });
});

describe("ensaio 81/104 → 104/104 com snapshot fixo", () => {
  it("sobrevive a timeout pós-gravação e replay sem repetir 1–81", async () => {
    const total = 104;
    const sql = Array.from({ length: total }, (_, index) => `SELECT ${index + 1};`).join("\n");
    const destination = canonicalDestination(81, total);
    destination.crashNext();

    await expect(
      applyStatementByStatement(destination, sql, {
        runKey: "op:fixed-package:migration:fingerprint",
        startIndex: 0,
        maxStatements: 25,
      }),
    ).resolves.toMatchObject({ ok: false });

    await expect(
      applyStatementByStatement(destination, sql, {
        runKey: "op:fixed-package:migration:fingerprint",
        startIndex: 0,
        maxStatements: 25,
      }),
    ).resolves.toMatchObject({ ok: true, processed: 104, total: 104, complete: true });
    expect([...destination.executed].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 23 }, (_, index) => index + 82),
    );
  });

  it("rejeita replay 88/103 contra pacote de 104 comandos", async () => {
    const mismatch = canonicalDestination(88, 103);
    const sql104 = Array.from({ length: 104 }, (_, index) => `SELECT ${index + 1};`).join("\n");
    await expect(
      applyStatementByStatement(mismatch, sql104, {
        runKey: "op:fixed-package:migration:fingerprint",
        startIndex: 0,
        maxStatements: 25,
      }),
    ).resolves.toMatchObject({ ok: false, error: expect.stringContaining("incompatível") });
    expect(mismatch.executed.size).toBe(0);
  });
});