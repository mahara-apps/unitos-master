/**
 * Barreira de ambiente para criação de identidades privilegiadas em testes.
 *
 * Regra fundamental: a suíte NUNCA cria contas SUPER ADMIN reais fora de um
 * ambiente explicitamente identificado como teste. Ambiente desconhecido é
 * tratado como produção (fail-closed) — não existe fallback permissivo.
 *
 * Configuração confiável (env do runner, não valor vindo do usuário/HTTP):
 *   UNITOS_TEST_ENV=INTEGRATION_TEST_SUITE
 *   UNITOS_REAL_TEST_PROJECT_REF=xemwzgbzpokslnpatqsk
 *   UNITOS_INTEGRATION_TEST_PROJECT_REF=xemwzgbzpokslnpatqsk
 *
 * O ref autorizado é versionado. Variável ausente, ref divergente, URL
 * divergente ou propósito genérico falham fechados.
 *   UNITOS_TEST_USER_PASSWORD_SECRET (opcional) -> segredo exclusivo de teste
 */

export type PrivilegedEnvVerdict =
  | { allowed: true }
  | {
      allowed: false;
      reason: "not_declared_integration_suite" | "target_not_authorized" | "target_mismatch";
    };

export const INTEGRATION_TEST_SUITE = "INTEGRATION_TEST_SUITE";
export const INTEGRATION_TEST_PROJECT_REF = "xemwzgbzpokslnpatqsk";
export const FORBIDDEN_MASTER_PROJECT_REF = "tkjbhttylouamqxnbfgv";

function projectRefFromUrl(): string | null {
  const url = process.env["SUPABASE_URL"] ?? "";
  const m = /https?:\/\/([a-z0-9]+)\.supabase\./i.exec(url);
  return m?.[1] ?? null;
}

/** Veredito determinístico do ambiente atual. */
export function privilegedTestEnv(): PrivilegedEnvVerdict {
  const purpose = (process.env["UNITOS_TEST_ENV"] ?? "").trim();
  const realTarget = (process.env["UNITOS_REAL_TEST_PROJECT_REF"] ?? "").trim();
  const declaredTarget = (process.env["UNITOS_INTEGRATION_TEST_PROJECT_REF"] ?? "").trim();
  const explicitRef = (process.env["SUPABASE_PROJECT_ID"] ?? "").trim();
  const urlRef = projectRefFromUrl();

  if (purpose !== INTEGRATION_TEST_SUITE) {
    return { allowed: false, reason: "not_declared_integration_suite" };
  }
  if (
    declaredTarget !== INTEGRATION_TEST_PROJECT_REF ||
    (realTarget.length > 0 && realTarget !== INTEGRATION_TEST_PROJECT_REF) ||
    declaredTarget === FORBIDDEN_MASTER_PROJECT_REF ||
    realTarget === FORBIDDEN_MASTER_PROJECT_REF
  ) {
    return { allowed: false, reason: "target_not_authorized" };
  }
  if (explicitRef !== declaredTarget || urlRef !== declaredTarget) {
    return { allowed: false, reason: "target_mismatch" };
  }
  return { allowed: true };
}

export function privilegedTestEnvAllowed(): boolean {
  return privilegedTestEnv().allowed;
}

/** Falha explícita quando o ambiente não é comprovadamente de teste. */
export function assertPrivilegedTestEnv(operation = "TEST_SUPER_ADMIN_CREATION"): void {
  const v = privilegedTestEnv();
  if (v.allowed) return;
  const detail = {
    not_declared_integration_suite: "propósito não declarado como INTEGRATION_TEST_SUITE",
    target_not_authorized:
      "alvo não é o Master descartável (que permanece proibido) nem o ambiente descartável autorizado",
    target_mismatch: "SUPABASE_PROJECT_ID, SUPABASE_URL e alvo declarado não coincidem",
  }[v.reason];
  throw new Error(`${operation} bloqueado: ${detail}. Nenhum fallback é permitido.`);
}
