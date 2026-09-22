import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import {
  attachCanonicalMigrationIdentity,
  assertCompletedProgressBackedByClientLedger,
  databaseMigrationsPercent,
  deltaProgressKey,
  generateDeltaManifest,
  INCREMENTAL_LEDGER_CUTOVER_FILE,
  needsLegacyBlobReconciliation,
  readAppliedMigrationLabels,
  recoverLegacyCanonicalManifest,
  splitDeltaMigrations,
  validateCanonicalPackage,
  validateDeltaManifest,
  UPDATE_DELTA_LABEL,
} from "@/lib/installation/automation.server";
import canonicalSql from "../supabase/baseline-snapshot/007_delta_migrations.sql?raw";
import canonicalManifest from "../supabase/baseline-snapshot/tools/delta_manifest.txt?raw";
import canonicalVersion from "../supabase/baseline-snapshot/tools/delta_version.txt?raw";

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

  it("anexa SHA-256 e total de statements somente com manifesto integral e ordenado", () => {
    const parsed = splitDeltaMigrations(packageSql);
    const manifest = parsed.map((item) => `${item.file}\t${"a".repeat(64)}`).join("\n");
    const identified = attachCanonicalMigrationIdentity(parsed, manifest);
    expect(identified.map((item) => item.canonicalSha256)).toEqual([
      "a".repeat(64),
      "a".repeat(64),
    ]);
    expect(identified.map((item) => item.totalStatements)).toEqual([1, 1]);
    expect(() => attachCanonicalMigrationIdentity(parsed, manifest.split("\n")[0] ?? "")).toThrow(
      /integral/,
    );
    expect(() =>
      attachCanonicalMigrationIdentity(parsed, manifest.replace("first.sql", "other.sql")),
    ).toThrow(/posição 1/);
  });

  it("não interpreta pacote sem marcador como migration válida", () => {
    expect(splitDeltaMigrations("select 1;")).toEqual([]);
  });

  it("mantém um corte explícito para converter instalações com ledger legado", () => {
    expect(INCREMENTAL_LEDGER_CUTOVER_FILE).toMatch(/^\d{14}_.+\.sql$/);
  });

  it("não transforma marcador cumulativo legado diretamente em evidência por migration", () => {
    const source = readFileSync("src/lib/installation/automation.server.ts", "utf8");
    expect(source).toContain("reconcileLegacyMigrationMarker");
    expect(source).toContain("buildLegacyReconciliationInspectionSql");
    expect(source).not.toContain("for (const item of historical) appliedLabels.add");
    expect(source).toContain("needsLegacyBlobReconciliation(hasLegacyBlob");
    expect(source).not.toContain("hasLegacyBlob && appliedLabels.size === 0");
  });

  it("recupera a identidade incremental antiga somente quando o rótulo coincide com o pacote", () => {
    const migrations = splitDeltaMigrations(packageSql);
    const first = migrations[0];
    const second = migrations[1];
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    if (!first || !second) return;
    const applied = readAppliedMigrationLabels(
      [
        { kind: "migration", label: `${first.file}:${first.fingerprint}`, file: first.file },
        { kind: "migration", label: `${second.file}:fingerprint-incorreto`, file: second.file },
        { kind: "blob", label: `${second.file}:${second.fingerprint}`, file: second.file },
      ],
      migrations,
    );
    expect(applied).toEqual(new Set([`${first.file}:${first.fingerprint}`]));
  });

  it("dispensa a reconciliação por heurística quando o trecho histórico aplicado é contínuo", () => {
    const migrations = splitDeltaMigrations(packageSql);
    const labels = new Set(
      migrations.slice(0, 82).map((item) => `${item.file}:${item.fingerprint}`),
    );
    expect(needsLegacyBlobReconciliation(true, labels, migrations)).toBe(false);
    expect(labels.has(`${migrations[83]?.file}:${migrations[83]?.fingerprint}`)).toBe(false);
    expect(needsLegacyBlobReconciliation(false, new Set(), migrations)).toBe(false);
  });

  it("mantém falha fechada quando o ledger histórico tem lacuna ou nenhuma identidade", () => {
    const migrations = splitDeltaMigrations(packageSql);
    const second = migrations[1];
    expect(second).toBeDefined();
    if (!second) return;
    expect(
      needsLegacyBlobReconciliation(
        true,
        new Set([`${second.file}:${second.fingerprint}`]),
        migrations,
      ),
    ).toBe(true);
    expect(needsLegacyBlobReconciliation(true, new Set(), migrations)).toBe(true);
  });

  it("bloqueia progresso Master concluído sem confirmação equivalente no ledger Client", () => {
    const row = {
      migration_file: "20260901000000_first.sql",
      fingerprint: "legacy-fingerprint",
      package_position: 1,
      statement_index: 1,
      total_statements: 1,
      status: "completed" as const,
    };
    expect(() => assertCompletedProgressBackedByClientLedger([row], new Set())).toThrow(
      /ledger Client.*posição 1/,
    );
    expect(() =>
      assertCompletedProgressBackedByClientLedger(
        [row],
        new Set([`${row.migration_file}:${row.fingerprint}`]),
      ),
    ).not.toThrow();
  });

  it("NEW usa o mesmo executor canônico do UPDATE", () => {
    const source = readFileSync("src/lib/installation/automation.server.ts", "utf8");
    const provision = source.slice(source.indexOf("export async function runAutomatedProvision"));
    expect(provision).toContain("const delta = await applyDatabaseDelta({");
    expect(provision).not.toContain("seedDeltaLedger(management, splitDeltaMigrations(file.sql))");
  });

  it("versiona o checkpoint de 000_extensions pelo conteúdo", () => {
    const source = readFileSync("src/lib/installation/automation.server.ts", "utf8");
    const provision = source.slice(source.indexOf("export async function runAutomatedProvision"));
    expect(provision).toContain("key: `000_extensions:${deltaFingerprint(baseline000)}`");
    expect(provision).not.toMatch(/label: "000_extensions", key: "000_extensions"/);
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

  it("valida versão, SHA global, count e identidade fixada", async () => {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(packageSql));
    const packageSha = Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    const migrationDigest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode("select 1;\n"),
    );
    const migrationSha = Array.from(new Uint8Array(migrationDigest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    const snapshot = {
      version: "1.2.3",
      commitSha: "commit",
      sha256: packageSha,
      total: 1,
      sql: packageSql,
      manifest: `20260901000000_first.sql\t${migrationSha}\n`,
    };
    await expect(
      validateCanonicalPackage(
        { baseline_id: "1.2.3:commit:1", baseline_hash: packageSha },
        snapshot,
      ),
    ).resolves.toEqual({ ok: true });
    await expect(
      validateCanonicalPackage(
        { baseline_id: "1.2.3:commit:1", baseline_hash: packageSha },
        { ...snapshot, sha256: "a".repeat(64) },
      ),
    ).resolves.toMatchObject({ ok: false });
    await expect(
      validateCanonicalPackage(
        { baseline_id: "1.2.3:commit:1", baseline_hash: packageSha },
        { ...snapshot, total: 2 },
      ),
    ).resolves.toMatchObject({ ok: false });
  });

  it("mantém o manifesto válido de uma instalação moderna", async () => {
    const snapshot = {
      version: "1.2.3",
      commitSha: "commit",
      sha256: "a".repeat(64),
      total: 1,
      sql: packageSql,
      manifest: "manifesto-moderno\n",
    };
    await expect(recoverLegacyCanonicalManifest(snapshot)).resolves.toEqual({
      ok: true,
      manifest: snapshot.manifest,
    });
  });

  it("bloqueia pacote atual de 87 blocos quando uma operação antiga não possui manifesto", async () => {
    const version = /^version=(.+)$/m.exec(canonicalVersion)?.[1] ?? "";
    const sha256 = /^sha256=([a-f0-9]{64})$/m.exec(canonicalVersion)?.[1] ?? "";
    const snapshot = { version, commitSha: "commit-legado", sha256, total: 85, sql: canonicalSql };
    const recovered = await recoverLegacyCanonicalManifest(snapshot);
    expect(recovered).toMatchObject({ ok: false });
    await expect(generateDeltaManifest(canonicalSql)).resolves.toBe(canonicalManifest);
    await expect(validateCanonicalPackage(
      { baseline_id: `${version}:commit-legado:85`, baseline_hash: sha256 },
      snapshot,
    )).resolves.toMatchObject({ ok: false });
  });

  it("bloqueia recuperação com hash divergente ou pacote incompatível", async () => {
    const version = /^version=(.+)$/m.exec(canonicalVersion)?.[1] ?? "";
    const sha256 = /^sha256=([a-f0-9]{64})$/m.exec(canonicalVersion)?.[1] ?? "";
    const base = { version, commitSha: "legacy", sha256, total: 85, sql: canonicalSql };
    await expect(
      recoverLegacyCanonicalManifest({ ...base, sha256: "a".repeat(64) }),
    ).resolves.toMatchObject({ ok: false });
    await expect(
      recoverLegacyCanonicalManifest({ ...base, sql: `${canonicalSql}\nselect 1;` }),
    ).resolves.toMatchObject({ ok: false });
    await expect(recoverLegacyCanonicalManifest({ ...base, total: 84 })).resolves.toMatchObject({
      ok: false,
    });
  });

  it("recupera o mesmo manifesto em reexecuções sem alterar a identidade do pacote", async () => {
    const version = /^version=(.+)$/m.exec(canonicalVersion)?.[1] ?? "";
    const sha256 = /^sha256=([a-f0-9]{64})$/m.exec(canonicalVersion)?.[1] ?? "";
    const snapshot = { version, commitSha: "legacy", sha256, total: 85, sql: canonicalSql };
    const first = await recoverLegacyCanonicalManifest(snapshot);
    const second = await recoverLegacyCanonicalManifest(snapshot);
    expect(second).toEqual(first);
    expect(snapshot).not.toHaveProperty("manifest");
  });
});
