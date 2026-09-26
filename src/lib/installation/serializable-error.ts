/** PostgREST may return an error-shaped object that cannot cross a server-function boundary. */
export function installationServerError(value: unknown): Error {
  // SDK Error subclasses can carry non-serializable properties (including cause).
  // Preserve ordinary errors, but strip provider-specific fields at the RPC boundary.
  if (value instanceof Error) {
    if (value.constructor === Error && !('cause' in value)) return value;
    const code = 'code' in value && typeof value.code === 'string' && value.code.trim()
      ? ` (${value.code})`
      : '';
    return new Error(`${value.message}${code}`);
  }
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