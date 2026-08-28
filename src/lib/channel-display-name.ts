/**
 * Fonte única do NOME EXIBIDO de um canal/conexão.
 *
 * Regra: sempre mostrar o nome real cadastrado da conexão
 * (`social_connections.channel_name` → `external_name` → `@account_username`)
 * e nunca o provider técnico ("meta"). Só quando não existe conexão (ex.:
 * `posts.channels`) usamos o rótulo humano da plataforma.
 */

const CHANNEL_LABEL: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  x: "X / Twitter",
  twitter: "X / Twitter",
  youtube: "YouTube",
  threads: "Threads",
  blog: "Blog",
  whatsapp: "WhatsApp",
  meta: "Meta",
};

/** Rótulo humano da plataforma (usado só sem conexão cadastrada). */
export function channelDisplayLabel(raw: string | null | undefined): string {
  const key = String(raw ?? "").trim().toLowerCase();
  if (!key) return "Canal";
  return CHANNEL_LABEL[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
}

export type ConnectionNameSource = {
  channel_name?: string | null;
  external_name?: string | null;
  account_username?: string | null;
  channel?: string | null;
  provider?: string | null;
};

/** Nome real da conexão cadastrada; nunca retorna o provider técnico sozinho. */
export function connectionDisplayName(row: ConnectionNameSource): string {
  const named = [row.channel_name, row.external_name]
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .find((v) => v.length > 0);
  if (named) return named;
  const user = typeof row.account_username === "string" ? row.account_username.trim() : "";
  if (user) return `@${user.replace(/^@/, "")}`;
  return channelDisplayLabel(row.channel ?? row.provider);
}
