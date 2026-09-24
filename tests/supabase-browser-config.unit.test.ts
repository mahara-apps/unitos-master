import { describe, expect, it } from "vitest";
import { resolveBrowserSupabaseConfig } from "@/integrations/supabase/client-config";

const valid = {
  url: "https://abcdefghijklmnop.supabase.co",
  publishableKey: "sb_publishable_installation",
  projectId: "abcdefghijklmnop",
};

describe("configuração Supabase do navegador", () => {
  it("falha fechada quando a leitura não fornece valores", () => {
    expect(resolveBrowserSupabaseConfig({})).toEqual({ ok: false, reason: "missing" });
  });

  it("trata valores vazios como configuração ausente", () => {
    expect(resolveBrowserSupabaseConfig({ url: " ", publishableKey: " " })).toEqual({
      ok: false,
      reason: "missing",
    });
  });

  it("aceita configuração válida da própria instalação", () => {
    expect(resolveBrowserSupabaseConfig(valid)).toEqual({
      ok: true,
      url: valid.url,
      publishableKey: valid.publishableKey,
      projectRef: valid.projectId,
    });
  });

  it("mantém compatibilidade com a chave pública legada", () => {
    const result = resolveBrowserSupabaseConfig({
      url: valid.url,
      legacyAnonKey: "legacy-public-key",
      projectId: valid.projectId,
    });
    expect(result.ok).toBe(true);
  });

  it("recusa URL inválida e divergência de projeto", () => {
    expect(resolveBrowserSupabaseConfig({ ...valid, url: "https://example.com" })).toEqual({
      ok: false,
      reason: "invalid_url",
    });
    expect(resolveBrowserSupabaseConfig({ ...valid, projectId: "outroprojeto" })).toEqual({
      ok: false,
      reason: "project_mismatch",
    });
  });
});
