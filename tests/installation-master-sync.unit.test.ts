import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { MASTER_RELEASE_VERSION } from "@/lib/installation/manager-contract";
import delta from "../supabase/baseline-snapshot/007_delta_migrations.sql?raw";
import manifestRaw from "../supabase/baseline-snapshot/tools/delta_manifest.txt?raw";
import versionRaw from "../supabase/baseline-snapshot/tools/delta_version.txt?raw";
import verifySql from "../supabase/install/verify-installation.sql?raw";
import extensions from "../supabase/baseline-snapshot/000_extensions.sql?raw";

/**
 * MASTER-first: nenhuma alteracao do sistema pode ficar fora do pacote que as
 * instalacoes recebem. Este teste é o guardiao da regra:
 *  1. o pacote precisa estar regenerado (impressao digital registrada);
 *  2. a versao anunciada pelo MASTER precisa acompanhar o pacote;
 *  3. toda tabela criada pelo pacote precisa ser conferida no relatorio de saude.
 */

function parseVersionFile(raw: string): { version: string; sha256: string } {
  const get = (key: string) =>
    raw
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.startsWith(`${key}=`))
      ?.slice(key.length + 1)
      .trim() ?? "";
  return { version: get("version"), sha256: get("sha256") };
}

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Tabelas do delta que NAO sao replicadas/verificadas na instalacao:
// helpers internos do provisionamento e registro exclusivo do MASTER.
const NAO_VERIFICADAS = new Set([
  "installations",
  "installation_operations",
  "installation_credentials",
]);

function tabelasDoDelta(sql: string): string[] {
  // Tabelas criadas apenas como passo intermediario e renomeadas no mesmo
  // pacote (ex.: brain_events_new -> brain_events) nunca existem no destino:
  // o nome final entra na verificacao, o intermediario sai.
  const renomeadas = new Map<string, string>();
  const reRename = /ALTER TABLE (?:IF EXISTS )?public\.([a-z0-9_]+)\s+RENAME TO ([a-z0-9_]+)/gi;
  for (const m of sql.matchAll(reRename)) {
    renomeadas.set(m[1]!.toLowerCase(), m[2]!.toLowerCase());
  }

  const re = /CREATE TABLE (?:IF NOT EXISTS )?public\.([a-z0-9_]+)/gi;
  const out = new Set<string>();
  for (const m of sql.matchAll(re)) {
    let nome = m[1]!.toLowerCase();
    // Segue a cadeia de renomeacoes ate o nome final.
    const vistos = new Set<string>();
    while (renomeadas.has(nome) && !vistos.has(nome)) {
      vistos.add(nome);
      nome = renomeadas.get(nome)!;
    }
    if (nome.startsWith("_unitos_")) continue;
    if (NAO_VERIFICADAS.has(nome)) continue;
    out.add(nome);
  }
  return [...out].sort();
}

describe("sincronia MASTER-first", () => {
  const { version, sha256 } = parseVersionFile(versionRaw);

  it("delta_version.txt declara versao e impressao digital", () => {
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("o pacote foi regenerado (impressao digital confere)", async () => {
    expect(await sha256Hex(delta)).toBe(sha256);
  });

  it("MASTER_RELEASE_VERSION acompanha o pacote", () => {
    expect(MASTER_RELEASE_VERSION).toBe(version);
  });

  it("manifesto declara cada migration em ordem com SHA-256", () => {
    const entries = manifestRaw.trim().split("\n");
    const files = [...delta.matchAll(/^-- ([0-9]{14}_[A-Za-z0-9_-]+\.sql)$/gm)].map(
      (match) => match[1],
    );
    expect(entries).toHaveLength(files.length);
    expect(entries.map((entry) => entry.split(/\s+/)[0])).toEqual(files);
    expect(entries.every((entry) => /^[^\s]+\.sql\s+[0-9a-f]{64}$/.test(entry))).toBe(true);
  });

  it("instalação limpa recebe o ledger canônico endurecido sem backfill", () => {
    expect(extensions).toContain("CREATE TABLE IF NOT EXISTS public._unitos_applied_deltas");
    expect(extensions).toContain("ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'blob'");
    expect(extensions).toContain("ADD COLUMN IF NOT EXISTS file text");
    expect(extensions).toContain("ADD COLUMN IF NOT EXISTS fingerprint text");
    expect(extensions).toContain("_unitos_applied_deltas_file_fingerprint_key");
    expect(extensions).toContain("ENABLE ROW LEVEL SECURITY");
    expect(extensions).toContain(
      "REVOKE ALL ON public._unitos_applied_deltas FROM anon, authenticated",
    );
    expect(extensions).not.toMatch(/UPDATE\s+public\._unitos_applied_deltas/i);
  });

  it("converge pgvector para public sem remover a extensão ou seus objetos", () => {
    expect(extensions).toContain("detected_schema text");
    expect(extensions).not.toMatch(/\bcurrent_schema\s+text\b/i);
    expect(extensions).toContain("WHERE e.extname = 'vector'");
    expect(extensions).toContain("CREATE EXTENSION vector WITH SCHEMA public");
    expect(extensions).toContain("ALTER EXTENSION vector SET SCHEMA public");
    expect(extensions).not.toMatch(/DROP\s+EXTENSION(?:\s+IF\s+EXISTS)?\s+vector/i);
    expect(extensions).toContain("pg_extension não confirmou vector no schema public");
    expect(extensions).toContain("to_regtype('public.vector') IS NULL");
    expect(extensions).toContain("oc.opcname = 'vector_cosine_ops'");
  });

  it.each([
    ["ausente", "detected_schema IS NULL", "CREATE EXTENSION vector WITH SCHEMA public"],
    ["em extensions", "detected_schema <> 'public'", "ALTER EXTENSION vector SET SCHEMA public"],
    ["em public", "ELSIF detected_schema <> 'public'", "END IF"],
  ])("cobre vector %s no bootstrap descartável", (_state, branch, action) => {
    expect(extensions).toContain(branch);
    expect(extensions).toContain(action);
  });

  it("ensaio descartável executa os três estados e depois 001_initial_schema", () => {
    const script = readFileSync(
      "supabase/baseline-snapshot/tools/verify_on_disposable_project.sh",
      "utf8",
    );
    expect(script).toContain("DROP EXTENSION IF EXISTS vector");
    expect(script).toContain("ALTER EXTENSION vector SET SCHEMA extensions");
    expect(script.match(/000_extensions\.sql/g)).toHaveLength(3);
    expect(script.indexOf("000_extensions.sql")).toBeLessThan(
      script.indexOf("001_initial_schema.sql"),
    );
    expect(script).toContain("to_regtype('public.vector') IS NULL");
    expect(script).toContain("oc.opcname = 'vector_cosine_ops'");
  });

  it("ensaio PostgreSQL local cobre CREATE, ALTER, reexecução, pós-condição e rollback", () => {
    const script = readFileSync(
      "supabase/baseline-snapshot/tools/test_pgvector_wrapper_local.sh",
      "utf8",
    );
    expect(script).toContain("000_extensions.sql");
    expect(script).toContain("CREATE EXTENSION vector WITH SCHEMA extensions");
    expect(script).toContain("ALTER EXTENSION vector SET SCHEMA public");
    expect(script.split('cat "$WRAPPER"').length - 1).toBeGreaterThanOrEqual(4);
    expect(script).toContain("to_regtype('public.vector') IS NULL");
    expect(script).toContain("oc.opcname = 'vector_cosine_ops'");
    expect(script.match(/ROLLBACK;/g)?.length).toBe(3);
    expect(script).toContain("vector_oid_before");
  });

  it("relatorio de saude confere todas as tabelas do pacote", () => {
    const faltando = tabelasDoDelta(delta).filter(
      (t) => !verifySql.includes(`'${t}'`) && !verifySql.includes(`public.${t}`),
    );
    expect(faltando).toEqual([]);
  });

  it("relatório exige tipo e operator class do pgvector no schema public", () => {
    expect(verifySql).toContain("pgvector canônico (public.vector + public.vector_cosine_ops)");
    expect(verifySql).toContain("to_regtype('public.vector') IS NOT NULL");
    expect(verifySql).toContain("oc.opcname = 'vector_cosine_ops'");
    expect(verifySql).toContain("n.nspname = 'public'");
  });

  it("pacote e verificação incluem a abertura durável do workflow", () => {
    expect(delta).toContain(
      "CREATE OR REPLACE FUNCTION public.start_durable_installation_operation",
    );
    expect(verifySql).toContain("start_durable_installation_operation");
  });
});
