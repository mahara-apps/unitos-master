import { describe, expect, it } from "vitest";

import {
  deltaProgressKey,
  INCREMENTAL_LEDGER_CUTOVER_FILE,
  splitDeltaMigrations,
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
});
