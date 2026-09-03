/**
 * Saneamento do baseline para execução via Supabase Management API.
 *
 * A Management API executa SQL como o papel `postgres`, que NÃO é superusuário
 * no Supabase. Alguns comandos que o `pg_dump` emite pertencem exclusivamente
 * a `supabase_admin`/superusuário e falham com:
 *
 *   ERROR: 42501: permission denied to change default privileges
 *   ERROR: 42501: must be owner of schema public
 *
 * Esses comandos são irrelevantes para a instalação: o baseline concede
 * privilégios explicitamente (GRANT por tabela/função) e todo projeto Supabase
 * novo já nasce com as ACLs default corretas. Portanto eles são REMOVIDOS aqui,
 * nunca "ignorados silenciosamente no meio do script" — a remoção é explícita,
 * auditável e testada.
 *
 * Nada além destes padrões é alterado: schema, RLS, policies, funções,
 * triggers, GRANTs e seeds seguem literais.
 */

/** Padrões de comandos que apenas superusuário pode executar. */
const SUPERUSER_ONLY_PATTERNS: readonly RegExp[] = [
  /^ALTER\s+DEFAULT\s+PRIVILEGES\b/i,
  /^COMMENT\s+ON\s+SCHEMA\s+public\b/i,
  /^ALTER\s+SCHEMA\s+public\s+OWNER\s+TO\b/i,
];

export type SanitizedBaseline = {
  /** SQL pronto para a Management API. */
  sql: string;
  /** Comandos removidos (primeira linha, truncada) — para telemetria. */
  removed: string[];
};

function isSuperuserOnly(statement: string): boolean {
  const head = statement.replace(/^\s*(--[^\n]*\n|\s)+/g, "").trim();
  return SUPERUSER_ONLY_PATTERNS.some((re) => re.test(head));
}

/**
 * Remove os comandos exclusivos de superusuário de um arquivo do baseline.
 * Implementação conservadora: só remove statements de UMA linha que casam com
 * os padrões acima (é exatamente a forma emitida pelo pg_dump).
 */
export function sanitizeBaselineSqlForManagementApi(sql: string): SanitizedBaseline {
  const removed: string[] = [];
  const out: string[] = [];

  for (const line of sql.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.endsWith(";") && isSuperuserOnly(trimmed)) {
      removed.push(trimmed.slice(0, 120));
      continue;
    }
    out.push(line);
  }

  return { sql: out.join("\n"), removed };
}
