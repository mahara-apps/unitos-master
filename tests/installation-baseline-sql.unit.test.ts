import { describe, expect, it } from "vitest";
import {
  explicitDropFunctionSignature,
  sanitizeBaselineSqlForManagementApi,
} from "@/lib/installation/baseline-sql";
import baseline001 from "../supabase/baseline-snapshot/001_initial_schema.sql?raw";

describe("sanitizeBaselineSqlForManagementApi", () => {
  it("remove privilégios de superusuário e grants de tabela para anon", () => {
    const sql = [
      "CREATE TABLE public.a (id uuid PRIMARY KEY);",
      "COMMENT ON SCHEMA public IS 'standard public schema';",
      "ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;",
      "GRANT SELECT ON public.a TO authenticated;",
      "GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.a TO anon;",
    ].join("\n");
    const result = sanitizeBaselineSqlForManagementApi(sql);
    expect(result.sql).toContain("CREATE TABLE public.a");
    expect(result.sql).toContain("GRANT SELECT ON public.a TO authenticated;");
    expect(result.sql).not.toMatch(/ALTER DEFAULT PRIVILEGES/i);
    expect(result.sql).not.toMatch(/COMMENT ON SCHEMA public/i);
    expect(result.sql).not.toMatch(/ON TABLE public\.a TO anon/i);
    expect(result.removed).toHaveLength(3);
  });

  it("preserva GRANTs, policies e funções", () => {
    const sql = [
      "ALTER TABLE public.a ENABLE ROW LEVEL SECURITY;",
      'CREATE POLICY "own" ON public.a FOR SELECT TO authenticated USING (auth.uid() = id);',
      "GRANT ALL ON public.a TO service_role;",
    ].join("\n");
    const result = sanitizeBaselineSqlForManagementApi(sql);
    expect(result.removed).toHaveLength(0);
    expect(result.sql).toBe(sql);
  });

  it("sanea o baseline real sem sobrar comando de superusuário", () => {
    const result = sanitizeBaselineSqlForManagementApi(baseline001);
    expect(result.removed.length).toBeGreaterThan(0);
    expect(result.sql).not.toMatch(/^\s*ALTER\s+DEFAULT\s+PRIVILEGES/im);
    expect(result.sql).not.toMatch(/^\s*COMMENT\s+ON\s+SCHEMA\s+public/im);
    expect(result.sql).not.toMatch(/^\s*GRANT\s+.+\s+ON\s+TABLE\s+.+\s+TO\s+anon/im);
    // O schema em si permanece intacto.
    expect(result.sql).toContain("CREATE TABLE");
    expect(result.sql).toContain("ENABLE ROW LEVEL SECURITY");
  });

  it("remove ALTER DEFAULT PRIVILEGES multilinha como um statement completo", () => {
    const result = sanitizeBaselineSqlForManagementApi(`
      REVOKE TRUNCATE ON TABLE public.installation FROM anon;
      ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
        REVOKE MAINTAIN, TRUNCATE, TRIGGER, REFERENCES ON TABLES FROM anon;
      GRANT USAGE ON SCHEMA public TO anon;
    `);

    expect(result.sql).toContain("REVOKE TRUNCATE ON TABLE public.installation FROM anon;");
    expect(result.sql).toContain("GRANT USAGE ON SCHEMA public TO anon;");
    expect(result.sql).not.toMatch(/ALTER\s+DEFAULT\s+PRIVILEGES/i);
    expect(result.removed).toHaveLength(1);
    expect(result.removed[0]).toMatch(/ALTER DEFAULT PRIVILEGES/i);
  });
});

describe("explicitDropFunctionSignature", () => {
  it("aceita somente DROP FUNCTION com schema e assinatura explícitos", () => {
    expect(
      explicitDropFunctionSignature(
        "DROP FUNCTION public.heartbeat_installation_operation(uuid, text, integer);",
      ),
    ).toBe("public.heartbeat_installation_operation(uuid, text, integer)");
    expect(explicitDropFunctionSignature("DROP FUNCTION IF EXISTS public.f(uuid);")).toBeNull();
    expect(explicitDropFunctionSignature("DROP FUNCTION public.f(uuid) CASCADE;")).toBeNull();
    expect(explicitDropFunctionSignature("DROP FUNCTION f(uuid);")).toBeNull();
  });
});

describe("saneamento de storage", () => {
  it("remove ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY", () => {
    const { sql, removed } = sanitizeBaselineSqlForManagementApi(
      [
        "ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;",
        "DROP POLICY IF EXISTS avatars_auth_read ON storage.objects;",
      ].join("\n"),
    );
    expect(sql).not.toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/DROP POLICY IF EXISTS avatars_auth_read/);
    expect(removed).toHaveLength(1);
  });

  it("preserva RLS de tabelas do schema public", () => {
    const { sql, removed } = sanitizeBaselineSqlForManagementApi(
      "ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;",
    );
    expect(sql).toMatch(/public\.brands ENABLE ROW LEVEL SECURITY/);
    expect(removed).toHaveLength(0);
  });
});
