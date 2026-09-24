import { afterEach, describe, expect, it } from "vitest";
import { captureRuntimeEnv } from "@/lib/runtime-env.server";
import {
  resolveSupabaseAdminRuntimeConfig,
  resolveSupabasePublicRuntimeConfig,
  SupabaseRuntimeConfigError,
} from "@/integrations/supabase/runtime-config.server";

const KEYS = [
  "SUPABASE_URL",
  "SUPABASE_PROJECT_ID",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SB_SERVICE_ROLE_KEY",
] as const;

const previous = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of KEYS) {
    const value = previous[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("configuração Supabase do runtime publicado", () => {
  it("resolve bindings Cloudflare sem depender de process.env", () => {
    for (const key of KEYS) delete process.env[key];
    captureRuntimeEnv({
      SUPABASE_URL: "https://abcdefghijklmnop.supabase.co",
      SUPABASE_PROJECT_ID: "abcdefghijklmnop",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_installation",
      SB_SERVICE_ROLE_KEY: "sb_secret_installation",
    });

    expect(resolveSupabasePublicRuntimeConfig()).toEqual({
      url: "https://abcdefghijklmnop.supabase.co",
      projectRef: "abcdefghijklmnop",
      publishableKey: "sb_publishable_installation",
    });
    expect(resolveSupabaseAdminRuntimeConfig().serviceRoleKey).toBe("sb_secret_installation");
  });

  it("falha fechado quando URL e Project Ref pertencem a projetos diferentes", () => {
    process.env.SUPABASE_URL = "https://abcdefghijklmnop.supabase.co";
    process.env.SUPABASE_PROJECT_ID = "qrstuvwxyzabcdef";
    process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_installation";

    expect(() => resolveSupabasePublicRuntimeConfig()).toThrowError(SupabaseRuntimeConfigError);
    try {
      resolveSupabasePublicRuntimeConfig();
    } catch (error) {
      expect((error as SupabaseRuntimeConfigError).missingOrInvalid).toContain(
        "SUPABASE_PROJECT_ID_MISMATCH",
      );
    }
  });
});