export type BrowserSupabaseConfigInput = {
  url?: string;
  publishableKey?: string;
  legacyAnonKey?: string;
  projectId?: string;
};

export type BrowserSupabaseConfig =
  | { ok: true; url: string; publishableKey: string; projectRef: string }
  | { ok: false; reason: "missing" | "invalid_url" | "project_mismatch" };

function projectRefFromUrl(value: string): string | null {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    const match = hostname.match(/^([a-z0-9]+)\.supabase\.co$/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

/** Resolve somente valores públicos fornecidos pelo build da instalação. */
export function resolveBrowserSupabaseConfig(
  input: BrowserSupabaseConfigInput,
): BrowserSupabaseConfig {
  const url = (input.url ?? "").trim();
  const publishableKey = (input.publishableKey ?? input.legacyAnonKey ?? "").trim();
  const declaredProject = (input.projectId ?? "").trim().toLowerCase();
  if (!url || !publishableKey) return { ok: false, reason: "missing" };

  const projectRef = projectRefFromUrl(url);
  if (!projectRef) return { ok: false, reason: "invalid_url" };
  if (declaredProject && declaredProject !== projectRef) {
    return { ok: false, reason: "project_mismatch" };
  }

  return { ok: true, url, publishableKey, projectRef };
}