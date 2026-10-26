import { PRIMARY_TEXT_PROVIDERS } from "./ai-capabilities";

export type ProviderPanelEntry = {
  connected?: boolean;
  verified?: "valid" | "invalid" | "unverified" | string | null;
  verifyMessage?: string | null;
} | null | undefined;

export type AiHealthWarning = {
  kind: "no_primary" | "key_rejected" | "no_credit" | "rate_limited" | "fallback_unavailable";
  severity: "error" | "warning";
  provider?: string;
  message: string;
};

const NAMES: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Gemini",
  groq: "Groq",
};

const CREDIT = /cr[eé]dito|credit|balance|saldo|billing|insufficient|quota/i;
const RATE = /rate.?limit|429|muitas requisi|too many/i;

function usable(e: ProviderPanelEntry) {
  return e?.connected === true && e.verified !== "invalid";
}

/** Deriva avisos de saúde dos provedores a partir do painel salvo. */
export function deriveAiHealthWarnings(input: {
  primary?: string | null;
  providers?: Record<string, ProviderPanelEntry> | null;
}): AiHealthWarning[] {
  const providers = input.providers ?? {};
  const out: AiHealthWarning[] = [];
  const primary = input.primary ?? null;
  const primaryOk =
    !!primary &&
    (PRIMARY_TEXT_PROVIDERS as readonly string[]).includes(primary) &&
    usable(providers[primary]);

  if (!primaryOk) {
    out.push({
      kind: "no_primary",
      severity: "error",
      message:
        "Nenhum provedor principal ativo. Cadastre uma chave de Gemini, OpenAI ou Anthropic — o Groq funciona só como reserva.",
    });
  }

  for (const [id, entry] of Object.entries(providers)) {
    if (!entry || !(id in NAMES)) continue;
    const msg = entry.verifyMessage ?? "";
    const name = NAMES[id];
    if (entry.verified === "invalid") {
      out.push(
        CREDIT.test(msg)
          ? { kind: "no_credit", severity: "error", provider: id, message: `${name} está sem crédito na conta do provedor.` }
          : { kind: "key_rejected", severity: "error", provider: id, message: `${name} recusou a chave. Cadastre uma chave nova.` },
      );
    } else if (entry.connected && CREDIT.test(msg)) {
      out.push({ kind: "no_credit", severity: "error", provider: id, message: `${name} está sem crédito na conta do provedor.` });
    } else if (entry.connected && entry.verified === "unverified" && RATE.test(msg)) {
      out.push({ kind: "rate_limited", severity: "warning", provider: id, message: `${name} está limitando as requisições no momento.` });
    }
  }

  if (!usable(providers["groq"]) && !out.some((w) => w.provider === "groq")) {
    out.push({
      kind: "fallback_unavailable",
      severity: "warning",
      provider: "groq",
      message: "Reserva (Groq) não configurada: se o principal falhar, a geração para.",
    });
  }
  return out;
}
