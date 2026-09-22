// Server-only: camada ÚNICA de configuração e envio de e-mail via Resend.
//
// Fonte única de verdade: a credencial cifrada da INSTALAÇÃO em
// `installation_email_credentials`, acompanhada do remetente institucional em
// `installation`. Não existe fallback para credencial de workspace ou variável
// compartilhada. A UI consome exatamente o mesmo resolvedor
// (`getEmailChannelStatus`), então "Conectado" e "envio real" não podem
// divergir.
//
// Nunca retornamos a API key para fora deste módulo, nem em logs ou erros.

import {
  decryptCredential,
  isCredentialDecryptError,
} from "@/lib/credentials-crypto.server";
import type { SupabaseLike } from "./resend-types";

export type ResendConfigSource = "installation";
export type ResendValidationState = "not_configured" | "pending" | "ready" | "action_required";
export type ResendStatusReason =
  | "resend_nao_configurado"
  | "remetente_instalacao_nao_configurado"
  | "credencial_instalacao_ilegivel"
  | "dominio_remetente_pendente"
  | "validacao_resend_pendente"
  | null;

export type ResendConfig = {
  apiKey: string;
  /** Remetente exatamente como exibido na configuração. */
  from: string;
  source: ResendConfigSource;
  masked: string | null;
  validationState: Exclude<ResendValidationState, "not_configured">;
  validationCode: string | null;
};

export type ResendStatus = {
  configured: boolean;
  from: string | null;
  source: ResendConfigSource | null;
  masked: string | null;
  state: ResendValidationState;
  /** Código estável quando não configurado (usado pela UI e pelo envio). */
  reason: ResendStatusReason;
};

type InstallationCredentialRow = {
  ciphertext?: string;
  masked?: string;
  validation_status?: "pending" | "ready" | "action_required";
  validation_code?: string | null;
};

async function readInstallationCredential(): Promise<InstallationCredentialRow | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("installation_email_credentials")
    .select("ciphertext, masked, validation_status, validation_code")
    .eq("id", true)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const validationStatus = ["pending", "ready", "action_required"].includes(
    data.validation_status,
  )
    ? (data.validation_status as InstallationCredentialRow["validation_status"])
    : "pending";
  return { ...data, validation_status: validationStatus };
}

export class ResendNotConfiguredError extends Error {
  code = "resend_nao_configurado" as const;
  constructor() {
    super("resend_nao_configurado");
    this.name = "ResendNotConfiguredError";
  }
}

const DEFAULT_FROM_ADDRESS = "onboarding@resend.dev";
const DEFAULT_FROM = `Unitos <${DEFAULT_FROM_ADDRESS}>`;

/**
 * Normaliza o remetente: aceita "email" ou "Nome <email>".
 *
 * `displayName` é o nome da MARCA do evento. Quando informado, ele é usado como
 * rótulo do remetente — antes o rótulo era o literal "Unitos" para qualquer
 * instalação, o que fazia o e-mail exibir o nome errado da agência.
 */
export function normalizeFrom(
  raw: string | null | undefined,
  fallback = DEFAULT_FROM,
  displayName?: string | null,
): string {
  const label = (displayName ?? "").trim() || "Unitos";
  const v = (raw ?? "").trim();
  if (!v) {
    if (displayName?.trim()) return `${label} <${DEFAULT_FROM_ADDRESS}>`;
    return fallback;
  }
  if (v.includes("<") && v.includes(">")) return v;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return `${label} <${v}>`;
  return fallback;
}

export function parseResendSender(raw: string): {
  email: string;
  name: string | null;
  formatted: string;
  domain: string;
} | null {
  const value = raw.trim();
  const named = value.match(/^\s*([^<>]+?)\s*<([^<>\s@]+@[^<>\s@]+\.[^<>\s@]+)>\s*$/);
  const email = (named?.[2] ?? value).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  const name = named?.[1]?.trim() || null;
  return {
    email,
    name,
    formatted: name ? `${name} <${email}>` : email,
    domain: email.slice(email.lastIndexOf("@") + 1),
  };
}

export type ResendConfigurationValidation = {
  status: "pending" | "ready" | "action_required";
  code: string;
  verifiedAt: string;
};

/** Valida a chave e o domínio sem enviar mensagem. Falha de consulta vira pendência. */
export async function validateResendConfiguration(
  apiKey: string,
  senderDomain: string,
): Promise<ResendConfigurationValidation> {
  const verifiedAt = new Date().toISOString();
  let response: Response;
  try {
    response = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
    });
  } catch {
    return { status: "pending", code: "validacao_indisponivel", verifiedAt };
  }
  if (response.status === 401) throw new Error("credencial_invalida");
  if (response.status === 403) {
    return { status: "pending", code: "validacao_sem_permissao_de_leitura", verifiedAt };
  }
  if (!response.ok) {
    return { status: "pending", code: `validacao_http_${response.status}`, verifiedAt };
  }
  const payload = (await response.json()) as {
    data?: Array<{ name?: string; status?: string }>;
  };
  const domain = payload.data?.find((item) => item.name?.toLowerCase() === senderDomain);
  if (!domain) return { status: "action_required", code: "dominio_nao_cadastrado", verifiedAt };
  if (domain.status?.toLowerCase() !== "verified") {
    return { status: "action_required", code: "dominio_nao_verificado", verifiedAt };
  }
  return { status: "ready", code: "pronto", verifiedAt };
}

/** Remove qualquer segredo/PII sensível de mensagens do provedor. */
export function sanitizeProviderError(status: number, body: string): string {
  const compact = body.replace(/\s+/g, " ").trim();
  let msg = compact;
  try {
    const parsed = JSON.parse(compact) as { message?: string; name?: string };
    msg = parsed.message ?? parsed.name ?? compact;
  } catch {
    /* corpo não-JSON: usa texto cru já compactado */
  }
  const safe = msg
    .replace(/re_[A-Za-z0-9_-]{6,}/g, "[redacted]")
    .replace(/\b(sk|rk)_[A-Za-z0-9_-]{6,}/g, "[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "[redacted]")
    .slice(0, 160);
  if (status === 401) {
    return "credencial_invalida";
  }
  if (status === 403) {
    const normalized = msg.toLowerCase();
    // A mensagem oficial do sandbox também manda "verify a domain". Este
    // caso precisa ser reconhecido antes do diagnóstico genérico de domínio.
    if (
      normalized.includes("testing emails") ||
      normalized.includes("your own email") ||
      normalized.includes("only send")
    ) {
      return "conta_resend_em_modo_teste";
    }
    if (
      normalized.includes("domain") &&
      (normalized.includes("not verified") || normalized.includes("verify"))
    ) {
      return "dominio_remetente_nao_verificado";
    }
    return "resend_sem_permissao_de_envio";
  }
  return `provider_${status}: ${safe}`;
}

/**
 * Resolve a configuração de e-mail do workspace. Usa o client Supabase do
 * chamador (RLS aplicada), então o workspace A nunca alcança a credencial do
 * workspace B: a linha simplesmente não é visível.
 */
export async function resolveResendConfig(
  supabase: SupabaseLike,
  brandId: string,
  /** Nome da marca do evento, usado como rótulo do remetente. */
  displayName?: string | null,
): Promise<ResendConfig | null> {
  // brandId permanece no contrato para escopo/auditoria do evento. A credencial
  // e o remetente são sempre do singleton desta instalação.
  void brandId;
  let installationFrom: string | null = null;
  let installationName: string | null = null;
  try {
    const { getInstallationSettings } = await import("@/lib/installation-settings.server");
    const settings = await getInstallationSettings();
    installationFrom = settings.emailFrom;
    installationName = settings.emailFromName;
  } catch {
    // Sem a fonte canônica, falhamos fechado em vez de herdar outro remetente.
  }
  const canonicalFrom = installationFrom?.trim()
    ? normalizeFrom(installationFrom, DEFAULT_FROM, installationName ?? displayName)
    : null;

  const row = await readInstallationCredential();

  if (row?.ciphertext) {
    try {
      const apiKey = (await decryptCredential(row.ciphertext)).trim();
      if (apiKey && canonicalFrom) {
        return {
          apiKey,
          from: canonicalFrom,
          source: "installation",
          masked: row.masked ?? null,
          validationState: row.validation_status ?? "pending",
          validationCode: row.validation_code ?? null,
        };
      }
    } catch (error) {
      if (isCredentialDecryptError(error)) throw error;
      throw error;
    }
  }
  return null;
}

/** Estado consumido pela UI — derivado do MESMO resolvedor do envio. */
export async function resolveResendStatus(
  supabase: SupabaseLike,
  brandId: string,
): Promise<ResendStatus> {
  let cfg: ResendConfig | null = null;
  try {
    cfg = await resolveResendConfig(supabase, brandId);
  } catch (error) {
    if (isCredentialDecryptError(error)) {
      return {
        configured: false,
        from: null,
        source: "installation",
        masked: null,
        state: "action_required",
        reason: "credencial_instalacao_ilegivel",
      };
    }
    throw error;
  }
  if (!cfg) {
    let hasCredential = false;
    try {
      hasCredential = Boolean((await readInstallationCredential())?.ciphertext);
    } catch {
      hasCredential = false;
    }
    return {
      configured: false,
      from: null,
      source: hasCredential ? "installation" : null,
      masked: null,
      state: hasCredential ? "action_required" : "not_configured",
      reason: hasCredential ? "remetente_instalacao_nao_configurado" : "resend_nao_configurado",
    };
  }
  const state = cfg.validationState;
  return {
    configured: true,
    from: cfg.from,
    source: cfg.source,
    masked: cfg.masked,
    state,
    reason:
      state === "ready"
        ? null
        : state === "pending"
          ? "validacao_resend_pendente"
          : "dominio_remetente_pendente",
  };
}

export type ResendSendResult = { sent: boolean; error?: string; from?: string };

/** Teto duro de tentativas por envio (a 1ª tentativa conta). */
export const RESEND_MAX_ATTEMPTS = 3;
/** Timeout por request — sem ele um socket pendurado consome o worker. */
export const RESEND_TIMEOUT_MS = 15_000;
const RESEND_BACKOFF_BASE_MS = 400;

type ResendOutcome =
  | { kind: "http"; status: number; body: string }
  | { kind: "timeout" }
  | { kind: "network" };

export type ResendFailureClass = "recoverable" | "terminal";

/**
 * Contrato de retryabilidade: apenas 429, 5xx, timeout e falha de rede são
 * recuperáveis. 400/401/403 (e demais 4xx) são terminais — reenviar devolve o
 * mesmo erro.
 */
export function classifyResendOutcome(outcome: ResendOutcome): ResendFailureClass {
  if (outcome.kind === "timeout" || outcome.kind === "network") return "recoverable";
  const s = outcome.status;
  if (s === 429 || s >= 500) return "recoverable";
  return "terminal";
}

/** Backoff exponencial com jitter, determinístico quando `rand` é injetado. */
export function resendBackoffMs(attempt: number, rand: () => number = Math.random): number {
  const base = RESEND_BACKOFF_BASE_MS * 2 ** Math.max(0, attempt - 1);
  return Math.round(base + rand() * base * 0.5);
}

export type ResendAttemptTelemetry = {
  attempt: number;
  route: "gateway" | "api";
  status: number | null;
  outcome: "success" | "timeout" | "network" | "http_error";
  failureClass: ResendFailureClass | null;
  durationMs: number;
  retried: boolean;
};

export type ResendTelemetrySummary = {
  operationId: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  attempts: number;
  retries: number;
  rateLimits: number;
  timeouts: number;
  route: "gateway" | "api";
  reason: "sent" | "terminal" | "retry_exhausted";
  /** Erro já sanitizado — nunca contém chave nem corpo cru do provedor. */
  error: string | null;
  perAttempt: ResendAttemptTelemetry[];
};

export function resendLogLine(s: ResendTelemetrySummary): string {
  return (
    `[resend] id=${s.operationId} attempts=${s.attempts} retries=${s.retries} ` +
    `rateLimits=${s.rateLimits} timeouts=${s.timeouts} route=${s.route} ` +
    `duration=${(s.durationMs / 1000).toFixed(1)}s reason=${s.reason}` +
    (s.error ? ` error=${s.error}` : "")
  );
}

/**
 * Chaves emitidas pelo Resend começam com `re_` e devem ir direto à API do
 * Resend. O gateway da Lovable só aceita uma *connection key* de conector — usar
 * uma chave `re_` como `X-Connection-Api-Key` retorna 401 e a UI mostrava
 * "credencial_invalida" mesmo com a chave correta cadastrada.
 */
function isNativeResendKey(apiKey: string): boolean {
  return apiKey.startsWith("re_");
}

async function postResend(
  config: ResendConfig,
  msg: { to: string; subject: string; html: string },
  viaGateway: boolean,
  signal?: AbortSignal,
): Promise<ResendOutcome> {
  const url = viaGateway
    ? "https://connector-gateway.lovable.dev/resend/emails"
    : "https://api.resend.com/emails";
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (viaGateway) {
    headers["Authorization"] = `Bearer ${process.env.LOVABLE_API_KEY}`;
    headers["X-Connection-Api-Key"] = config.apiKey;
  } else {
    headers["Authorization"] = `Bearer ${config.apiKey}`;
  }
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  }
  const timer = setTimeout(() => controller.abort(), RESEND_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        from: config.from,
        to: [msg.to],
        subject: msg.subject || "(sem assunto)",
        html: msg.html,
      }),
    });
    return { kind: "http", status: res.status, body: res.ok ? "" : await res.text() };
  } catch (err) {
    const aborted = controller.signal.aborted || (err as { name?: string })?.name === "AbortError";
    return aborted ? { kind: "timeout" } : { kind: "network" };
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", onAbort);
  }
}

export type SendResendEmailOptions = {
  /** Injetável em teste para não gastar tempo real de backoff. */
  sleep?: (ms: number) => Promise<void>;
  rand?: () => number;
  now?: () => number;
  idFactory?: () => string;
  logger?: (summary: ResendTelemetrySummary) => void;
  signal?: AbortSignal;
};

/** Envio real pelo Resend (gateway Lovable somente para connection keys). */
export async function sendResendEmail(
  config: ResendConfig,
  msg: { to: string; subject: string; html: string },
  opts: SendResendEmailOptions = {},
): Promise<ResendSendResult> {
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const rand = opts.rand ?? Math.random;
  const now = opts.now ?? Date.now;
  const startedAtMs = now();
  const canUseGateway = Boolean(process.env.LOVABLE_API_KEY) && !isNativeResendKey(config.apiKey);
  let useGateway = canUseGateway;

  const perAttempt: ResendAttemptTelemetry[] = [];
  const summary: ResendTelemetrySummary = {
    operationId: (opts.idFactory ?? (() => Math.random().toString(36).slice(2, 10)))(),
    startedAt: new Date(startedAtMs).toISOString(),
    finishedAt: new Date(startedAtMs).toISOString(),
    durationMs: 0,
    attempts: 0,
    retries: 0,
    rateLimits: 0,
    timeouts: 0,
    route: useGateway ? "gateway" : "api",
    reason: "terminal",
    error: null,
    perAttempt,
  };

  const finish = (reason: ResendTelemetrySummary["reason"], error: string | null) => {
    summary.reason = reason;
    summary.error = error;
    const end = now();
    summary.finishedAt = new Date(end).toISOString();
    summary.durationMs = end - startedAtMs;
    summary.attempts = perAttempt.length;
    (opts.logger ?? ((s: ResendTelemetrySummary) => console.error(resendLogLine(s))))(summary);
  };

  let lastError = "network";

  for (let attempt = 1; attempt <= RESEND_MAX_ATTEMPTS; attempt += 1) {
    const attemptStart = now();
    const outcome = await postResend(config, msg, useGateway, opts.signal);
    const route: "gateway" | "api" = useGateway ? "gateway" : "api";
    summary.route = route;

    if (outcome.kind === "http" && outcome.status >= 200 && outcome.status < 300) {
      perAttempt.push({
        attempt,
        route,
        status: outcome.status,
        outcome: "success",
        failureClass: null,
        durationMs: now() - attemptStart,
        retried: false,
      });
      finish("sent", null);
      return { sent: true, from: config.from };
    }

    // Fallback preservado: gateway recusou a credencial → tenta a API oficial
    // com a mesma chave antes de declarar credencial inválida. Não é retry.
    const gatewayRejected =
      outcome.kind === "http" &&
      route === "gateway" &&
      (outcome.status === 401 || outcome.status === 403);

    const failureClass = classifyResendOutcome(outcome);
    if (outcome.kind === "timeout") summary.timeouts += 1;
    if (outcome.kind === "http" && outcome.status === 429) summary.rateLimits += 1;

    lastError =
      outcome.kind === "http"
        ? sanitizeProviderError(outcome.status, outcome.body)
        : outcome.kind === "timeout"
          ? "timeout"
          : "network";

    const willFallback = gatewayRejected;
    const willRetry =
      !willFallback && failureClass === "recoverable" && attempt < RESEND_MAX_ATTEMPTS;

    perAttempt.push({
      attempt,
      route,
      status: outcome.kind === "http" ? outcome.status : null,
      outcome:
        outcome.kind === "http" ? "http_error" : outcome.kind === "timeout" ? "timeout" : "network",
      failureClass,
      durationMs: now() - attemptStart,
      retried: willRetry || willFallback,
    });

    if (willFallback) {
      useGateway = false;
      continue;
    }
    if (willRetry) {
      summary.retries += 1;
      await sleep(resendBackoffMs(attempt, rand));
      continue;
    }
    finish(failureClass === "recoverable" ? "retry_exhausted" : "terminal", lastError);
    return { sent: false, error: lastError, from: config.from };
  }

  finish("retry_exhausted", lastError);
  return { sent: false, error: lastError, from: config.from };
}

/**
 * Atalho: resolve + envia. Retorna `resend_nao_configurado` com o mesmo código
 * usado pela UI quando não há credencial para o workspace.
 */
export async function sendBrandEmail(
  supabase: SupabaseLike,
  brandId: string,
  msg: { to: string; subject: string; html: string },
): Promise<ResendSendResult> {
  // Rótulo do remetente vem da marca do próprio evento (escopo da instalação).
  let displayName: string | null = null;
  try {
    const res = await supabase
      .from("brands")
      .select("name, nome_fantasia")
      .eq("id", brandId)
      .maybeSingle();
    const row = (res as { data: { name?: string | null; nome_fantasia?: string | null } | null })
      .data;
    displayName = (row?.nome_fantasia || row?.name || "").trim() || null;
  } catch {
    displayName = null;
  }

  const config = await resolveResendConfig(supabase, brandId, displayName);
  if (!config) {
    const status = await resolveResendStatus(supabase, brandId);
    const errorCode = status.reason ?? "resend_nao_configurado";
    const { logOperationalEvent } = await import("@/lib/operational-audit.server");
    await logOperationalEvent(
      {
        severity: "error",
        category: "email",
        source: "resend",
        operation: "email.send",
        outcome: "error",
        errorCode,
        message:
          errorCode === "remetente_instalacao_nao_configurado"
            ? "Remetente institucional não configurado para a instalação."
            : "Canal de e-mail não configurado para o workspace.",
        brandId,
      },
      supabase as never,
    );
    return { sent: false, error: errorCode };
  }
  const result = await sendResendEmail(config, msg);
  const { logOperationalEvent } = await import("@/lib/operational-audit.server");
  await logOperationalEvent(
    {
      severity: result.sent ? "success" : "error",
      category: "email",
      source: "resend",
      operation: "email.send",
      outcome: result.sent ? "success" : "error",
      errorCode: result.sent ? null : result.error,
      message: result.sent ? "E-mail aceito pelo provedor." : `Falha no envio: ${result.error}`,
      brandId,
      metadata: { credential_source: config.source },
    },
    supabase as never,
  );
  return result;
}
