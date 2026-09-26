/** PostgREST may return an error-shaped object that cannot cross a server-function boundary. */
export function installationServerError(value: unknown): Error {
  if (value instanceof Error) return value;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const message = typeof record.message === "string" && record.message.trim()
      ? record.message
      : "Falha ao consultar a instalação.";
    const code = typeof record.code === "string" && record.code.trim() ? ` (${record.code})` : "";
    return new Error(`${message}${code}`);
  }
  return new Error(typeof value === "string" && value.trim() ? value : "Falha ao consultar a instalação.");
}