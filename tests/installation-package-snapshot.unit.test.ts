import { describe, expect, it } from "vitest";

import {
  operationPackageIdentity,
  reconcileConfirmedMigrationCount,
  splitDeltaMigrations,
  validateOperationPackageSnapshot,
} from "@/lib/installation/automation.server";

function packageSql(total: number) {
  return Array.from(
    { length: total },
    (_, index) =>
      `-- -----------------------------------------------------------------------------\n-- 202609${String(index + 1).padStart(8, "0")}_migration_${index + 1}.sql\n-- -----------------------------------------------------------------------------\nselect ${index + 1};`,
  ).join("\n");
}

const fixed = {
  version: "1.3.93",
  commitSha: "a7e37814cb92e586ef147ed5104c598500362646",
  sha256: "c".repeat(64),
  total: 104,
  sql: packageSql(104),
};

describe("snapshot imutável do pacote por operação", () => {
  it("aceita versão, commit, SHA e total idênticos aos fixados", () => {
    expect(splitDeltaMigrations(fixed.sql)).toHaveLength(104);
    expect(
      validateOperationPackageSnapshot(
        { baseline_id: operationPackageIdentity(fixed), baseline_hash: fixed.sha256 },
        fixed,
      ),
    ).toEqual({ ok: true });
  });

  it.each([
    ["total 103→104", { ...fixed, total: 103 }],
    ["commit trocado", { ...fixed, commitSha: "b".repeat(40) }],
    ["SHA trocado", { ...fixed, sha256: "d".repeat(64) }],
  ])("bloqueia %s em vez de adotar o pacote novo", (_label, changed) => {
    const result = validateOperationPackageSnapshot(
      { baseline_id: operationPackageIdentity(fixed), baseline_hash: fixed.sha256 },
      changed,
    );
    expect(result.ok).toBe(false);
  });

  it("preserva o maior progresso quando a leitura do ledger é parcial", () => {
    expect(reconcileConfirmedMigrationCount(88, 87)).toEqual({ completed: 88, partialRead: true });
    expect(reconcileConfirmedMigrationCount(88, 88)).toEqual({ completed: 88, partialRead: false });
    expect(reconcileConfirmedMigrationCount(88, 89)).toEqual({ completed: 89, partialRead: false });
  });

  it("mantém uma operação 1.3.93/104 isolada do pacote MASTER 1.3.94/105", () => {
    const newerMaster = { ...fixed, version: "1.3.94", commitSha: "e".repeat(40), total: 105, sql: packageSql(105) };
    const operation = { baseline_id: operationPackageIdentity(fixed), baseline_hash: fixed.sha256 };
    expect(validateOperationPackageSnapshot(operation, fixed)).toEqual({ ok: true });
    expect(validateOperationPackageSnapshot(operation, newerMaster).ok).toBe(false);
  });
});