import { describe, expect, it } from "vitest";
import canonicalSql from "../supabase/baseline-snapshot/007_delta_migrations.sql?raw";
import {
  buildLegacyPromotionInventory,
  buildLegacyReconciliationInspectionSql,
  legacyEvidenceBlockReason,
  normalizeLegacyEvidenceRows,
  reconciledLegacyPositions,
} from "@/lib/installation/legacy-reconciliation";
import {
  attachCanonicalMigrationIdentity,
  splitDeltaMigrations,
} from "@/lib/installation/automation.server";

const migrations = attachCanonicalMigrationIdentity(
  splitDeltaMigrations(canonicalSql),
  splitDeltaMigrations(canonicalSql)
    .map((migration) => `${migration.file}\t${"a".repeat(64)}`)
    .join("\n"),
);
const classifications = new Map<number, string>([
  ...[34, 39, 55, 61, 64, 70, 71, 84].map((position) => [position, "canonical_state"]),
  ...[21, 42, 52, 56, 66, 82, 83].map((position) => [position, "partial_compatibility"]),
  ...[72, 74, 85].map((position) => [position, "external_checkpoint_required"]),
]);
const rows = [...classifications].map(([position, classification]) => ({
  position,
  migration_file: migrations[position - 1]?.file,
  classification,
  evidence_key: `${position}:${migrations[position - 1]?.file}:${classification}`,
  status: classification === "external_checkpoint_required" ? "insufficient" : "compatible",
  observed: "teste",
}));

describe("reconciliação segura do ledger legado", () => {
  it("inspeciona somente o trecho legado 1–85 dentro do pacote canônico completo", () => {
    // O pacote canônico é cumulativo e continua crescendo; a fronteira legada
    // permanece fixa em 85, sem acoplar este teste ao total atual de migrations.
    expect(migrations.length).toBeGreaterThanOrEqual(85);
    const sql = buildLegacyReconciliationInspectionSql(migrations);
    expect(sql.match(/SELECT \d+::integer AS position/g)).toHaveLength(18);
    expect(sql).not.toContain("SELECT 86::integer AS position");
    expect(sql).not.toContain("SELECT 87::integer AS position");
    expect(sql).not.toMatch(/^\s*(insert|update|delete|alter|create|drop|grant|revoke)\b/im);
    expect(sql).toContain("regexp_replace(lower(prosrc)");
  });
  it("falha fechado quando o pacote não cobre todo o trecho legado", () => {
    expect(() => buildLegacyReconciliationInspectionSql(migrations.slice(0, 84))).toThrow(
      /cobertura canônica até o bloco 85/,
    );
  });
  it("inspeciona o pseudo-role PUBLIC pela ACL sem resolvê-lo como role nomeada", () => {
    const sql = buildLegacyReconciliationInspectionSql(migrations);
    expect(sql).not.toContain("has_function_privilege('PUBLIC'");
    expect(sql).toContain("aclexplode(coalesce(p.proacl, acldefault('f', p.proowner)))");
    expect(sql).toContain("a.grantee=0 AND a.privilege_type='EXECUTE'");
  });
  it("mantém compatibilidade parcial distinta de execução histórica", () => {
    const normalized = normalizeLegacyEvidenceRows(rows);
    expect(normalized.filter((item) => item.classification === "canonical_state")).toHaveLength(8);
    expect(
      normalized.filter((item) => item.classification === "partial_compatibility"),
    ).toHaveLength(7);
    expect(reconciledLegacyPositions(normalized)).toEqual(
      new Set([34, 39, 55, 61, 64, 70, 71, 84]),
    );
  });
  it("exige checkpoints externos independentes para 72, 74 e 85", () => {
    const normalized = normalizeLegacyEvidenceRows(rows);
    expect(legacyEvidenceBlockReason(normalized)).toContain(
      "checkpoint externo obrigatório 72, 74, 85",
    );
    expect(new Set(normalized.map((item) => item.evidence_key)).size).toBe(18);
  });
  it("libera o gate externo sem promover as posições parciais", () => {
    const approved = rows.map((item) =>
      item.classification === "external_checkpoint_required"
        ? { ...item, status: "compatible" }
        : item,
    );
    const normalized = normalizeLegacyEvidenceRows(approved);
    expect(legacyEvidenceBlockReason(normalized)).toBeNull();
    expect(reconciledLegacyPositions(normalized)).toEqual(
      new Set([34, 39, 55, 61, 64, 70, 71, 72, 74, 84, 85]),
    );
    for (const position of [21, 42, 52, 56, 66, 82, 83])
      expect(reconciledLegacyPositions(normalized).has(position)).toBe(false);
    expect(
      buildLegacyPromotionInventory(normalized, migrations).map((item) => item.position),
    ).toEqual([34, 39, 55, 61, 64, 70, 71, 72, 74, 84, 85]);
    expect(buildLegacyPromotionInventory(normalized, migrations)[0]).toMatchObject({
      canonicalSha256: "a".repeat(64),
      totalStatements: expect.any(Number),
    });
  });
  it("compara cada função com o estado canônico acumulado até a própria posição", () => {
    const sql = buildLegacyReconciliationInspectionSql(migrations);
    const position42 = sql.split("SELECT 42::integer AS position")[1]?.split("UNION ALL")[0] ?? "";
    const position74 = sql.split("SELECT 74::integer AS position")[1]?.split("UNION ALL")[0] ?? "";
    const historicalBumpBody = migrations
      .slice(0, 42)
      .map((migration) => migration.sql)
      .join("\n")
      .match(
        /create\s+or\s+replace\s+function\s+public\.bump_message_thread\s*\([^)]*\)[\s\S]*?\bas\s+\$([A-Za-z0-9_]*)\$([\s\S]*?)\$\1\$\s*;/i,
      )?.[2]
      ?.replace(/\s+/g, "")
      .toLowerCase();
    const finalBumpBody = [
      ...canonicalSql.matchAll(
        /create\s+or\s+replace\s+function\s+public\.bump_message_thread\s*\([^)]*\)[\s\S]*?\bas\s+\$([A-Za-z0-9_]*)\$([\s\S]*?)\$\1\$\s*;/gi,
      ),
    ]
      .at(-1)?.[2]
      ?.replace(/\s+/g, "")
      .toLowerCase();
    expect(historicalBumpBody).toBeTruthy();
    expect(finalBumpBody).toBeTruthy();
    expect(historicalBumpBody).not.toBe(finalBumpBody);
    expect(position42).toContain(historicalBumpBody);
    expect(position42).not.toContain(finalBumpBody);
    expect(position74).toContain("prosecdef = false");
    expect(position74).not.toContain("prosecdef = true");
  });
  it("mantém 71 e 84 como verificações fail-closed do estado real", () => {
    const sql = buildLegacyReconciliationInspectionSql(migrations);
    const position71 = sql.split("SELECT 71::integer AS position")[1]?.split("UNION ALL")[0] ?? "";
    const position84 = sql.split("SELECT 84::integer AS position")[1]?.split("UNION ALL")[0] ?? "";
    expect(position71).toContain("blocked.enumlabel='blocked'");
    expect(position71).toContain("done.enumlabel='done'");
    expect(position84).toContain("public.installation','SELECT'");
    expect(position84).toContain(
      "a.privilege_type IN ('MAINTAIN','TRUNCATE','TRIGGER','REFERENCES')",
    );
  });
  it("classifica falsos positivos por migrations posteriores ou hardening manual como parciais", () => {
    for (const position of [21, 42, 52, 56, 66, 82, 83])
      expect(classifications.get(position)).toBe("partial_compatibility");
  });
  it("falha fechado para divergência, resposta incompleta e evidência reutilizada", () => {
    expect(
      legacyEvidenceBlockReason(
        normalizeLegacyEvidenceRows(
          rows.map((item) => (item.position === 34 ? { ...item, status: "divergent" } : item)),
        ),
      ),
    ).toContain("34");
    expect(() => normalizeLegacyEvidenceRows(rows.slice(1))).toThrow(/incompleta/);
    expect(() =>
      normalizeLegacyEvidenceRows(
        rows.map((item) =>
          item.position === 39 ? { ...item, evidence_key: rows[0]?.evidence_key } : item,
        ),
      ),
    ).toThrow(/diverge/);
    for (const patch of [
      { migration_file: "" },
      { observed: "" },
      { evidence_key: "34:arquivo-incorreto:canonical_state" },
    ]) {
      expect(() =>
        normalizeLegacyEvidenceRows(
          rows.map((item) => (item.position === 34 ? { ...item, ...patch } : item)),
        ),
      ).toThrow(/diverge/);
    }
  });
  it("é determinística em execução repetida", () => {
    expect(buildLegacyReconciliationInspectionSql(migrations)).toBe(
      buildLegacyReconciliationInspectionSql(migrations),
    );
    expect(normalizeLegacyEvidenceRows(rows)).toEqual(normalizeLegacyEvidenceRows(rows));
  });
  it("não promove evidência parcial nem identidade divergente", () => {
    const approved = normalizeLegacyEvidenceRows(
      rows.map((item) =>
        item.classification === "external_checkpoint_required"
          ? { ...item, status: "compatible" }
          : item,
      ),
    );
    expect(
      buildLegacyPromotionInventory(approved, migrations).some((item) => item.position === 21),
    ).toBe(false);
    expect(() =>
      buildLegacyPromotionInventory(
        approved.map((item) =>
          item.position === 34 ? { ...item, migration_file: "arquivo-divergente.sql" } : item,
        ),
        migrations,
      ),
    ).toThrow(/pacote fixado/);
    expect(() =>
      buildLegacyPromotionInventory(
        approved,
        migrations.map((migration, index) =>
          index === 33 ? { ...migration, canonicalSha256: undefined } : migration,
        ),
      ),
    ).toThrow(/SHA-256/);
  });
});
