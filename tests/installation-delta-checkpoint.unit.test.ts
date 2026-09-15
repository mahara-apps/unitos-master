import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import {
  databaseMigrationsPercent,
  deltaProgressKey,
  INCREMENTAL_LEDGER_CUTOVER_FILE,
  splitDeltaMigrations,
  validateDeltaManifest,
  UPDATE_DELTA_LABEL,
} from "@/lib/installation/automation.server";

/**
 * Regressão: um provisionamento antigo marcava "007_delta_migrations" como
 * aplicado. Quando o MASTER publicava um pacote novo, o checkpoint antigo fazia
 * o delta ser PULADO e a validação final acusava colunas/tabelas ausentes.
 */
describe("checkpoint do pacote MASTER", () => {
  it("a chave do checkpoint muda quando o conteúdo do pacote muda", () => {
    const a = deltaProgressKey("create table a();");
    const b = deltaProgressKey("create table a(); create table b();");
    expect(a).not.toBe(b);
    expect(a.startsWith(`${UPDATE_DELTA_LABEL}:`)).toBe(true);
  });

  it("o mesmo pacote gera a mesma chave (retomada continua do ponto certo)", () => {
    expect(deltaProgressKey("select 1;")).toBe(deltaProgressKey("select 1;"));
  });
});

describe("ledger incremental por migration", () => {
  const packageSql = `-- -----------------------------------------------------------------------------
-- 20260901000000_first.sql
-- -----------------------------------------------------------------------------
select 1;
-- -----------------------------------------------------------------------------
-- 20260902000000_second.sql
-- -----------------------------------------------------------------------------
select 2;`;

  it("separa cada migration com identidade e fingerprint estáveis", () => {
    const migrations = splitDeltaMigrations(packageSql);
    expect(migrations.map((migration) => migration.file)).toEqual([
      "20260901000000_first.sql",
      "20260902000000_second.sql",
    ]);
    expect(migrations[0]?.sql).toBe("select 1;");
    expect(migrations[0]?.fingerprint).toBe(splitDeltaMigrations(packageSql)[0]?.fingerprint);
  });

  it("não interpreta pacote sem marcador como migration válida", () => {
    expect(splitDeltaMigrations("select 1;")).toEqual([]);
  });

  it("mantém um corte explícito para converter instalações com ledger legado", () => {
    expect(INCREMENTAL_LEDGER_CUTOVER_FILE).toMatch(/^\d{14}_.+\.sql$/);
  });

  it("não transforma marcador cumulativo legado em evidência por migration", () => {
    const source = readFileSync("src/lib/installation/automation.server.ts", "utf8");
    expect(source).toContain("ledger legado sem evidência por migration");
    expect(source).not.toContain("for (const item of historical) appliedLabels.add");
  });

  it("NEW usa o mesmo executor canônico do UPDATE", () => {
    const source = readFileSync("src/lib/installation/automation.server.ts", "utf8");
    const provision = source.slice(source.indexOf("export async function runAutomatedProvision"));
    expect(provision).toContain("const delta = await applyDatabaseDelta({");
    expect(provision).not.toContain("seedDeltaLedger(management, splitDeltaMigrations(file.sql))");
  });

  it("calcula progresso acumulado sem voltar a zero entre migrations", () => {
    expect(databaseMigrationsPercent({ total: 20, completed: 8 })).toBe(40);
    expect(
      databaseMigrationsPercent({ total: 20, completed: 8, currentProcessed: 5, currentTotal: 10 }),
    ).toBe(43);
    expect(databaseMigrationsPercent({ total: 20, completed: 9 })).toBeGreaterThan(40);
  });
});

describe("manifesto canônico em runtime", () => {
  const packageSql = `-- -----------------------------------------------------------------------------
-- 20260901000000_first.sql
-- -----------------------------------------------------------------------------
select 1;`;

  it("aceita ordem, quantidade e SHA-256 íntegros", async () => {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("select 1;\n"));
    const sha = Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    await expect(
      validateDeltaManifest(`20260901000000_first.sql\t${sha}\n`, packageSql),
    ).resolves.toEqual({ ok: true });
  });

  it("falha fechado sem item, fora de ordem ou com conteúdo adulterado", async () => {
    await expect(validateDeltaManifest("", packageSql)).resolves.toMatchObject({ ok: false });
    await expect(
      validateDeltaManifest(`20260901000000_other.sql\t${"a".repeat(64)}\n`, packageSql),
    ).resolves.toMatchObject({ ok: false });
    await expect(
      validateDeltaManifest(`20260901000000_first.sql\t${"a".repeat(64)}\n`, packageSql),
    ).resolves.toMatchObject({ ok: false });
  });
});
