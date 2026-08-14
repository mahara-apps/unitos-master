import { ZodError } from "zod";

/**
 * Traduz mensagens de erro (Zod, Supabase/Postgres, fetch) para pt-BR
 * amigáveis para exibir em toasts. Nunca retorna vazio.
 */
export function describeError(err: unknown): string {
  if (!err) return "Ocorreu um erro inesperado.";

  if (err instanceof ZodError) {
    const first = err.issues[0];
    if (!first) return "Dados inválidos.";
    const field = first.path.length ? String(first.path[first.path.length - 1]) : "campo";
    switch (first.code) {
      case "too_small":
        if (first.type === "string") {
          return first.minimum === 1
            ? `Preencha o campo "${field}".`
            : `O campo "${field}" deve ter no mínimo ${first.minimum} caracteres.`;
        }
        return `O valor de "${field}" é menor que o mínimo permitido.`;
      case "too_big":
        if (first.type === "string") {
          return `O campo "${field}" deve ter no máximo ${first.maximum} caracteres.`;
        }
        return `O valor de "${field}" é maior que o máximo permitido.`;
      case "invalid_type":
        return first.received === "undefined"
          ? `O campo "${field}" é obrigatório.`
          : `O campo "${field}" está em formato inválido.`;
      case "invalid_string":
        return `O campo "${field}" está em formato inválido.`;
      case "invalid_enum_value":
        return `Valor inválido para "${field}".`;
      default:
        return first.message || `Dados inválidos em "${field}".`;
    }
  }

  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "";

  if (!raw) return "Ocorreu um erro inesperado.";

  const lower = raw.toLowerCase();

  // Provedor de IA (BYOK) não configurado / chave ausente / modelo indisponível
  if (lower.includes("ai_provider_not_configured")) {
    return "Nenhuma IA configurada para esta marca. Cadastre uma chave de provedor em Conexões.";
  }
  if (lower.includes("ai_provider_key_missing")) {
    const p = raw.match(/ai_provider_key_missing:([a-z]+)/i)?.[1];
    return `A chave${p ? ` do provedor ${p}` : ""} não foi encontrada. Reconfigure em Conexões.`;
  }
  if (lower.includes("overage_not_authorized")) {
    return "A quantidade solicitada excede a volumetria do briefing. Solicite liberação do excedente ao gestor da conta.";
  }
  if (lower.includes("ai_model_unavailable")) {
    return "O provedor configurado não oferece um modelo para esta função. Ajuste o provedor em Conexões.";
  }


  // Erros comuns do PostgREST / Supabase
  if (lower.includes("row-level security") || lower.includes("permission denied")) {
    return "Você não tem permissão para executar esta ação.";
  }
  if (lower.includes("duplicate key") || lower.includes("unique constraint")) {
    return "Já existe um registro com esses dados.";
  }
  if (lower.includes("foreign key")) {
    return "Não foi possível salvar: existe um vínculo inválido.";
  }
  if (lower.includes("not null") || lower.includes("violates not-null")) {
    return "Preencha todos os campos obrigatórios.";
  }
  if (lower.includes("timeout") || lower.includes("timed out")) {
    return "A operação demorou demais para responder. Tente novamente.";
  }
  if (lower.includes("network") || lower.includes("failed to fetch")) {
    return "Falha de conexão. Verifique sua internet e tente novamente.";
  }
  if (lower.includes("unauthorized") || lower.includes("jwt") || lower.includes("invalid token")) {
    return "Sua sessão expirou. Faça login novamente.";
  }

  // Mensagens Zod em inglês que ainda vazam vindas do servidor
  if (lower.startsWith("string must contain at most")) {
    const m = raw.match(/at most (\d+)/i);
    return m ? `Texto excede o limite de ${m[1]} caracteres.` : "Texto excede o limite permitido.";
  }
  if (lower.startsWith("string must contain at least")) {
    const m = raw.match(/at least (\d+)/i);
    return m ? `Texto abaixo do mínimo de ${m[1]} caracteres.` : "Texto abaixo do mínimo exigido.";
  }
  if (lower === "required") return "Preencha os campos obrigatórios.";

  return raw;
}

/**
 * Extrai a mensagem legível da resposta de uma rota de API.
 * Aceita corpo JSON (`{ message }` / `{ error }`) ou texto puro.
 */
export async function readApiError(res: Response, fallback = "Não foi possível concluir a operação."): Promise<string> {
  const raw = await res.text().catch(() => "");
  if (!raw) return fallback;
  try {
    const body = JSON.parse(raw) as { message?: unknown; error?: unknown };
    if (typeof body.message === "string" && body.message.trim()) return body.message;
    if (typeof body.error === "string" && body.error.trim()) return describeError(body.error);
  } catch {
    /* corpo não é JSON */
  }
  return describeError(raw);
}
