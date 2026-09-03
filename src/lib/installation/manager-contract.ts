/**
 * Installation Manager — regras puras (sem rede, sem SQL, sem secrets).
 *
 * Este módulo existe SOMENTE para a instalação MASTER: é ela que registra,
 * provisiona, valida e acompanha instalações independentes do Unitos.
 *
 * Invariantes garantidos aqui (e testados):
 * - o módulo só existe no MASTER (`isMasterInstallation`); instalações cliente
 *   não têm o módulo habilitado nem conseguem usar as server functions;
 * - nenhum segredo/credencial do destino é aceito no cadastro
 *   (`SENSITIVE_FIELD_HINTS` + `findSensitiveInput`);
 * - cada instalação é um registro isolado: nada de dado de negócio, nada de
 *   herança entre instalações;
 * - a máquina de estados de provisionamento/validação/atualização é explícita.
 */

import { MASTER_FORBIDDEN_TOKENS } from "./bootstrap-contract";

/** Versão do baseline/release que o MASTER distribui para as instalações. */
export const MASTER_RELEASE_VERSION = "2026.09.0";

/* ------------------------------------------------------------------ MASTER */

export type MasterDetectionInput = {
  /** `SUPABASE_URL` da instalação onde o código está rodando. */
  supabaseUrl?: string | null;
  /** URL pública canônica desta instalação. */
  appUrl?: string | null;
  /** `UNITOS_INSTALLATION_ROLE` — `master` | `client`. */
  role?: string | null;
};

/**
 * MASTER = instalação de origem. Detecção fail-closed:
 * - `UNITOS_INSTALLATION_ROLE=client` desliga o módulo mesmo no MASTER;
 * - `UNITOS_INSTALLATION_ROLE=master` liga explicitamente;
 * - caso contrário, só é MASTER quando o Supabase/domínio é o do MASTER.
 */
export function isMasterInstallation(input: MasterDetectionInput): boolean {
  const role = (input.role ?? "").trim().toLowerCase();
  if (role === "client") return false;
  if (role === "master") return true;

  const haystack = `${input.supabaseUrl ?? ""} ${input.appUrl ?? ""}`.toLowerCase();
  if (!haystack.trim()) return false;
  return MASTER_FORBIDDEN_TOKENS.some((token) => haystack.includes(token.toLowerCase()));
}

/* ------------------------------------------------------------------ status */

export const INSTALLATION_STATUSES = [
  "preparing",
  "provisioning",
  "validating",
  "update_available",
  "up_to_date",
  "attention",
  "error",
] as const;

export type InstallationStatus = (typeof INSTALLATION_STATUSES)[number];

export const INSTALLATION_STATUS_LABEL: Record<InstallationStatus, string> = {
  preparing: "Preparando",
  provisioning: "Provisionando",
  validating: "Validando",
  update_available: "Atualização disponível",
  up_to_date: "Atualizada",
  attention: "Atenção",
  error: "Erro",
};

export type InstallationHealth = "unknown" | "healthy" | "degraded" | "failing";

export const INSTALLATION_HEALTH_LABEL: Record<InstallationHealth, string> = {
  unknown: "Não verificada",
  healthy: "Saudável",
  degraded: "Com ressalvas",
  failing: "Falhando",
};

export function isInstallationStatus(value: unknown): value is InstallationStatus {
  return (
    typeof value === "string" && (INSTALLATION_STATUSES as readonly string[]).includes(value)
  );
}

export type InstallationOperationKind = "register" | "provision" | "validate" | "update";

export const OPERATION_KIND_LABEL: Record<InstallationOperationKind, string> = {
  register: "Cadastro",
  provision: "Provisionamento",
  validate: "Validação",
  update: "Atualização",
};

export type InstallationOperationStatus = "pending" | "running" | "success" | "failed";

export const OPERATION_STATUS_LABEL: Record<InstallationOperationStatus, string> = {
  pending: "Na fila",
  running: "Em execução",
  success: "Concluída",
  failed: "Falhou",
};

/** Status que aceita iniciar cada operação. Fora disso, a ação é recusada. */
const ALLOWED_START: Record<InstallationOperationKind, readonly InstallationStatus[]> = {
  register: ["preparing"],
  provision: ["preparing", "attention", "error"],
  validate: ["preparing", "up_to_date", "update_available", "attention", "error"],
  update: ["up_to_date", "update_available", "attention"],
};

export function canStartOperation(
  kind: InstallationOperationKind,
  status: InstallationStatus,
): boolean {
  return ALLOWED_START[kind].includes(status);
}

/** Status enquanto a operação está em execução. */
export function runningStatusFor(kind: InstallationOperationKind): InstallationStatus {
  if (kind === "validate") return "validating";
  return "provisioning";
}

export type OperationOutcome = {
  ok: boolean;
  /** Validação passou com ressalvas (avisos não bloqueantes). */
  warnings?: boolean;
  /** Versão reportada pela instalação após a operação. */
  version?: string | null;
};

/** Status final após uma operação — determinístico, sem efeito colateral. */
export function statusAfterOperation(
  kind: InstallationOperationKind,
  outcome: OperationOutcome,
  availableVersion: string = MASTER_RELEASE_VERSION,
): InstallationStatus {
  if (!outcome.ok) return "error";
  if (outcome.warnings) return "attention";
  const version = (outcome.version ?? "").trim();
  if (kind === "register") return "preparing";
  if (!version) return "attention";
  return version === availableVersion.trim() ? "up_to_date" : "update_available";
}

export function healthAfterOperation(outcome: OperationOutcome): InstallationHealth {
  if (!outcome.ok) return "failing";
  return outcome.warnings ? "degraded" : "healthy";
}

/** Comparação simples de versão `AAAA.MM.N` — só igualdade/desatualização. */
export function isUpdateAvailable(
  currentVersion: string | null | undefined,
  availableVersion: string = MASTER_RELEASE_VERSION,
): boolean {
  const current = (currentVersion ?? "").trim();
  if (!current) return false;
  return current !== availableVersion.trim();
}

/* -------------------------------------------------------------- validação */

export type InstallationInput = {
  name: string;
  domain?: string | null;
  supabaseUrl?: string | null;
  supabaseProjectRef?: string | null;
  gitRepoUrl?: string | null;
  deployProject?: string | null;
  notes?: string | null;
};

/** Campos que NUNCA podem ser cadastrados: o MASTER não guarda credenciais. */
export const SENSITIVE_FIELD_HINTS = [
  "service_role",
  "service-role",
  "sb_secret",
  "anon_key",
  "app_secret",
  "client_secret",
  "password",
  "private_key",
  "cron_secret",
  "bearer ",
] as const;

/** Detecta segredo colado em qualquer campo textual do cadastro. */
export function findSensitiveInput(input: InstallationInput): string | null {
  const blob = [
    input.name,
    input.domain,
    input.supabaseUrl,
    input.supabaseProjectRef,
    input.gitRepoUrl,
    input.deployProject,
    input.notes,
  ]
    .filter((v): v is string => typeof v === "string")
    .join("\n")
    .toLowerCase();
  return SENSITIVE_FIELD_HINTS.find((hint) => blob.includes(hint)) ?? null;
}

export function slugifyInstallation(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function normalizeHost(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withScheme);
    if (!url.hostname.includes(".")) return null;
    if (url.username || url.password) return null;
    return url.hostname.toLowerCase();
  } catch {
    return null;
  }
}

export type ValidationResult = { ok: true; slug: string } | { ok: false; error: string };

/**
 * Valida o cadastro de uma instalação nova.
 * Regra dura: nada pode apontar para o MASTER (Supabase, domínio, deploy).
 */
export function validateInstallationInput(input: InstallationInput): ValidationResult {
  const name = input.name.trim();
  if (name.length < 3) return { ok: false, error: "Informe um nome com pelo menos 3 caracteres." };
  if (name.length > 80) return { ok: false, error: "O nome deve ter no máximo 80 caracteres." };

  const slug = slugifyInstallation(name);
  if (!slug) return { ok: false, error: "O nome precisa conter letras ou números." };

  const sensitive = findSensitiveInput(input);
  if (sensitive) {
    return {
      ok: false,
      error:
        "Nenhum segredo ou credencial da instalação de destino pode ser cadastrado aqui. Remova o valor sensível e mantenha apenas metadados.",
    };
  }

  if (input.domain?.trim() && !normalizeHost(input.domain)) {
    return { ok: false, error: "Informe um domínio válido (ex.: app.cliente.com.br)." };
  }
  if (input.supabaseUrl?.trim() && !normalizeHost(input.supabaseUrl)) {
    return { ok: false, error: "Informe a URL do Supabase da instalação de destino." };
  }
  if (input.gitRepoUrl?.trim() && !normalizeHost(input.gitRepoUrl)) {
    return { ok: false, error: "Informe a URL do repositório Git da instalação." };
  }

  const blob = [
    input.domain,
    input.supabaseUrl,
    input.supabaseProjectRef,
    input.deployProject,
    input.gitRepoUrl,
  ]
    .filter((v): v is string => typeof v === "string")
    .join(" ")
    .toLowerCase();

  const master = MASTER_FORBIDDEN_TOKENS.find((token) => blob.includes(token.toLowerCase()));
  if (master) {
    return {
      ok: false,
      error:
        "A instalação precisa ter Supabase e domínio próprios — nenhum recurso do MASTER pode ser reutilizado.",
    };
  }

  return { ok: true, slug };
}

/**
 * Passos que o provisionamento vai executar (nesta primeira versão o fluxo é
 * apenas preparado: os passos são registrados no histórico, não executados).
 */
export const PROVISION_STEPS = [
  { id: "baseline", label: "Aplicar baseline do banco", script: "supabase/install/bootstrap.sh" },
  { id: "storage", label: "Criar buckets e policies de Storage", script: "supabase/install/bootstrap.sh" },
  { id: "secrets", label: "Gerar secrets próprios da instalação", script: "supabase/install/bootstrap.sh" },
  { id: "identity", label: "Registrar URL própria da instalação", script: "supabase/install/010_installation_identity.sql" },
  { id: "brain", label: "Inicializar estatísticas do Brain", script: "supabase/install/011_brain_stats_init.sql" },
  { id: "cron", label: "Agendar jobs na própria origem", script: "supabase/install/020_cron.sql" },
] as const;

export const VALIDATE_STEPS = [
  { id: "isolation", label: "Isolamento do Supabase", script: "supabase/install/verify-installation.sql" },
  { id: "baseline", label: "Contagens do baseline", script: "supabase/install/verify-installation.sql" },
  { id: "rls", label: "RLS, funções e triggers", script: "supabase/install/verify-installation.sql" },
  { id: "storage", label: "Buckets e policies", script: "supabase/install/verify-installation.sql" },
  { id: "cron", label: "Cron e URL própria", script: "supabase/install/verify-installation.sql" },
] as const;
