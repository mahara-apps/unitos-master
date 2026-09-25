import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GLOBAL_TEST_BASELINE_ORDER, ensureGlobalTestSchema } from "./helpers/global-schema-setup";
import { INTEGRATION_TEST_PROJECT_REF, INTEGRATION_TEST_SUITE } from "./helpers/test-env";

const ORIGINAL = { ...process.env };

beforeEach(() => {
  process.env["UNITOS_TEST_ENV"] = INTEGRATION_TEST_SUITE;
  process.env["UNITOS_REAL_TEST_PROJECT_REF"] = INTEGRATION_TEST_PROJECT_REF;
  process.env["UNITOS_INTEGRATION_TEST_PROJECT_REF"] = INTEGRATION_TEST_PROJECT_REF;
  process.env["SUPABASE_PROJECT_ID"] = INTEGRATION_TEST_PROJECT_REF;
  process.env["SUPABASE_URL"] = `https://${INTEGRATION_TEST_PROJECT_REF}.supabase.co`;
});

afterEach(() => {
  process.env = { ...ORIGINAL };
});

function management(rows: unknown[][]) {
  const query = vi.fn(async () => ({ ok: true, rows: rows.shift() ?? [] }));
  return { query };
}

describe("setup do schema da suíte global", () => {
  it("o comando global exclui explicitamente o projeto P0", () => {
    const scripts = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts: Record<string, string>;
    };
    const command = scripts.scripts["test:global:master"] ?? "";
    expect(command).toContain("--project integration-audit");
    expect(command).not.toContain("--project real-installation");
  });

  it("não altera um schema pronto, vazio e aprovado pela verificação Client", async () => {
    const target = management([
      [{ public_tables: 100, critical_tables: 5 }],
      [{ business_rows: 0 }],
      [{ check_name: "baseline: tabelas em public", status: "PASS" }],
    ]);
    const applyFile = vi.fn();
    await expect(ensureGlobalTestSchema({ management: target, applyFile })).resolves.toBe("ready");
    expect(applyFile).not.toHaveBeenCalled();
  });

  it("aplica banco vazio na ordem canônica e valida ao final", async () => {
    const target = management([
      [{ public_tables: 0, critical_tables: 0 }],
      [],
      [{ check_name: "baseline: tabelas em public", status: "PASS" }],
    ]);
    const names: string[] = [];
    await expect(
      ensureGlobalTestSchema({
        management: target,
        applyFile: async (_management, name) => {
          names.push(name);
        },
      }),
    ).resolves.toBe("provisioned");
    expect(names).toEqual([...GLOBAL_TEST_BASELINE_ORDER]);
  });

  it("recusa schema parcial sem aplicar arquivos", async () => {
    const target = management([[{ public_tables: 4, critical_tables: 1 }]]);
    const applyFile = vi.fn();
    await expect(ensureGlobalTestSchema({ management: target, applyFile })).rejects.toThrow(
      /schema parcial ou desconhecido/,
    );
    expect(applyFile).not.toHaveBeenCalled();
  });

  it("recusa dados operacionais existentes", async () => {
    const target = management([
      [{ public_tables: 100, critical_tables: 5 }],
      [{ business_rows: 2 }],
    ]);
    await expect(ensureGlobalTestSchema({ management: target })).rejects.toThrow(
      /contém dados operacionais/,
    );
  });

  it("recusa o Master antes de qualquer consulta", async () => {
    process.env["UNITOS_INTEGRATION_TEST_PROJECT_REF"] = "tkjbhttylouamqxnbfgv";
    process.env["SUPABASE_PROJECT_ID"] = "tkjbhttylouamqxnbfgv";
    process.env["SUPABASE_URL"] = "https://tkjbhttylouamqxnbfgv.supabase.co";
    const target = management([]);
    await expect(ensureGlobalTestSchema({ management: target })).rejects.toThrow(/bloqueado/);
    expect(target.query).not.toHaveBeenCalled();
  });

  it("reprova falha estrutural e tolera apenas pendências operacionais conhecidas", async () => {
    const target = management([
      [{ public_tables: 100, critical_tables: 5 }],
      [{ business_rows: 0 }],
      [
        { check_name: "installation.app_url definido e https", status: "FAIL" },
        { check_name: "RLS habilitado em todas as tabelas de public", status: "FAIL" },
      ],
    ]);
    await expect(ensureGlobalTestSchema({ management: target })).rejects.toThrow(/RLS habilitado/);
  });
});
