import { readRuntimeEnv } from "@/lib/runtime-env.server";

export type SupabasePublicRuntimeConfig = {
  url: string;
  publishableKey: string;
  projectRef: string;
};

export type SupabaseAdminRuntimeConfig = SupabasePublicRuntimeConfig & {
  serviceRoleKey: string;
};

export class SupabaseRuntimeConfigError extends Error {
  code = "supabase_runtime_config_unavailable" as const;
  constructor(readonly missingOrInvalid: string[]) {
    super("Supabase runtime configuration is unavailable.");
    this.name = "SupabaseRuntimeConfigError";
  }
}

function projectRefFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
    const match = parsed.hostname.match(/^([a-z0-9]+)\.supabase\.co$/i);
    return match?.[1]?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

/**
 * Fonte única da configuração Supabase usada pelo servidor.
 * Funciona em Node/Vercel (`process.env`) e em Cloudflare (`env` capturado no
 * entrypoint), e recusa pares pertencentes a projetos diferentes.
 */
export function resolveSupabasePublicRuntimeConfig(): SupabasePublicRuntimeConfig {
  const url = readRuntimeEnv("SUPABASE_URL");
  const publishableKey = readRuntimeEnv("SUPABASE_PUBLISHABLE_KEY");
  const configuredProjectRef = readRuntimeEnv("SUPABASE_PROJECT_ID")?.toLowerCase() ?? null;
  const urlProjectRef = url ? projectRefFromUrl(url) : null;
  const invalid: string[] = [];

  if (!url) invalid.push("SUPABASE_URL");
  else if (!urlProjectRef) invalid.push("SUPABASE_URL_INVALID");
  if (!publishableKey) invalid.push("SUPABASE_PUBLISHABLE_KEY");
  if (configuredProjectRef && urlProjectRef && configuredProjectRef !== urlProjectRef) {
    invalid.push("SUPABASE_PROJECT_ID_MISMATCH");
  }
  if (invalid.length > 0 || !url || !publishableKey || !urlProjectRef) {
    throw new SupabaseRuntimeConfigError(invalid);
  }

  return {
    url,
    publishableKey,
    projectRef: configuredProjectRef ?? urlProjectRef,
  };
}

export function resolveSupabaseAdminRuntimeConfig(): SupabaseAdminRuntimeConfig {
  const publicConfig = resolveSupabasePublicRuntimeConfig();
  const serviceRoleKey =
    readRuntimeEnv("SUPABASE_SERVICE_ROLE_KEY") ?? readRuntimeEnv("SB_SERVICE_ROLE_KEY");
  if (!serviceRoleKey) {
    throw new SupabaseRuntimeConfigError(["SUPABASE_SERVICE_ROLE_KEY_OR_SB_SERVICE_ROLE_KEY"]);
  }
  return { ...publicConfig, serviceRoleKey };
}

export function hasSupabaseServiceRuntimeKey(): boolean {
  return Boolean(
    readRuntimeEnv("SUPABASE_SERVICE_ROLE_KEY") ?? readRuntimeEnv("SB_SERVICE_ROLE_KEY"),
  );
}
