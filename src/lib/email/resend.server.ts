// Server-only: camada ÚNICA de configuração e envio de e-mail via Resend.
//
// Fonte única de verdade: a credencial cifrada em `brand_api_credentials`
// (provider = 'resend') do MESMO workspace/marca exibido na UI. Só quando a
// marca não tem credencial própria caímos para a credencial de instalação
// (`RESEND_API_KEY`). A UI consome exatamente o mesmo resolvedor
// (`getEmailChannelStatus`), então "Conectado" e "envio real" não podem
// divergir.
//
// Nunca retornamos a API key para fora deste módulo, nem em logs ou erros.

import { decryptCredential } from "@/lib/credentials-crypto.server";
import type { SupabaseLike } from "./resend-types";

export type ResendConfigSource = "brand" | "installation";

export type ResendConfig = {
  apiKey: string;
  /** Remetente exatamente como exibido na configuração. */
  from: string;
  source: ResendConfigSource;
  masked: string | null;
};

export type ResendStatus = {
  configured: boolean;
  from: string | null;
  source: ResendConfigSource | null;
  masked: string | null;
  /** Código estável quando não configurado (usado pela UI e pelo envio). */
  reason: "resend_nao_configurado" | null;
};

export class ResendNotConfiguredError extends Error {
  code = "resend_nao_configurado" as const;
  constructor() {
    super("resend_nao_configurado");
    this.name = "ResendNotConfiguredError";
  }
}

const DEFAULT_FROM = "Unitos <onboarding@resend.dev>";

/** Normaliza o remetente: aceita "email" ou "Nome <email>". */
export function normalizeFrom(raw: string | null | undefined, fallback = DEFAULT_FROM): string {
  const v = (raw ?? "").trim();
  if (!v) return fallback;
  if (v.includes("<") && v.includes(">")) return v;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return `Unitos <${v}>`;
  return fallback;
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
  if (status === 401 || status === 403) {
    return "credencial_invalida";
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
): Promise<ResendConfig | null> {
  type CredRow = { ciphertext?: string; masked?: string; metadata?: Record<string, string> };
  let row: CredRow | null = null;
  try {
    const res = await supabase
      .from("brand_api_credentials")
      .select("ciphertext, masked, metadata")
      .eq("brand_id", brandId)
      .eq("provider", "resend")
      .maybeSingle();
    row = ((res as { data: unknown }).data as CredRow | null) ?? null;
  } catch {
    row = null;
  }

  if (row?.ciphertext) {
    try {
      const apiKey = (await decryptCredential(row.ciphertext)).trim();
      if (apiKey) {
        return {
          apiKey,
          from: normalizeFrom(row.metadata?.["handle"] ?? row.metadata?.["from"]),
          source: "brand",
          masked: row.masked ?? null,
        };
      }
    } catch {
      // Credencial ilegível (segredo de cifra ausente/rotacionado): trata como
      // não configurada em vez de vazar detalhe de criptografia.
    }
  }

  const envKey = process.env.RESEND_API_KEY?.trim();
  if (envKey) {
    return {
      apiKey: envKey,
      from: normalizeFrom(process.env.INVITE_FROM_EMAIL),
      source: "installation",
      masked: null,
    };
  }
  return null;
}

/** Estado consumido pela UI — derivado do MESMO resolvedor do envio. */
export async function resolveResendStatus(
  supabase: SupabaseLike,
  brandId: string,
): Promise<ResendStatus> {
  const cfg = await resolveResendConfig(supabase, brandId);
  if (!cfg) {
    return {
      configured: false,
      from: null,
      source: null,
      masked: null,
      reason: "resend_nao_configurado",
    };
  }
  return {
    configured: true,
    from: cfg.from,
    source: cfg.source,
    masked: cfg.masked,
    reason: null,
  };
}

export type ResendSendResult = { sent: boolean; error?: string; from?: string };

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
): Promise<{ status: number; body: string } | null> {
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
  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        from: config.from,
        to: [msg.to],
        subject: msg.subject || "(sem assunto)",
        html: msg.html,
      }),
    });
    return { status: res.status, body: res.ok ? "" : await res.text() };
  } catch {
    return null;
  }
}

/** Envio real pelo Resend (gateway Lovable somente para connection keys). */
export async function sendResendEmail(
  config: ResendConfig,
  msg: { to: string; subject: string; html: string },
): Promise<ResendSendResult> {
  const canUseGateway = Boolean(process.env.LOVABLE_API_KEY) && !isNativeResendKey(config.apiKey);

  let attempt = await postResend(config, msg, canUseGateway);
  // Gateway recusou a credencial: tenta a API oficial do Resend com a mesma
  // chave antes de declarar credencial inválida.
  if (canUseGateway && attempt && (attempt.status === 401 || attempt.status === 403)) {
    attempt = await postResend(config, msg, false);
  }

  if (!attempt) {
    console.error("[resend] falha de rede no envio");
    return { sent: false, error: "network", from: config.from };
  }
  if (attempt.status >= 200 && attempt.status < 300) {
    return { sent: true, from: config.from };
  }
  const error = sanitizeProviderError(attempt.status, attempt.body);
  console.error(`[resend] envio falhou status=${attempt.status}`);
  return { sent: false, error, from: config.from };
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
  const config = await resolveResendConfig(supabase, brandId);
  if (!config) return { sent: false, error: "resend_nao_configurado" };
  return sendResendEmail(config, msg);
}
