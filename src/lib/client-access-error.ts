/** Erro estruturado "responsável sem acesso ao cliente" (atravessa o RPC só pela mensagem). */
export const NO_CLIENT_ACCESS_TEXT = "Este responsável não tem acesso ao cliente da tarefa.";
const RE = /\[\[no_client_access:([0-9a-f-]{36}):([0-9a-f-]{36}):([0-9a-f-]{36}|-)\]\]/i;

export type NoClientAccess = { clientId: string; userId: string; taskId: string | null };

export function noClientAccessMessage(clientId: string, userId: string, taskId: string | null): string {
  return `${NO_CLIENT_ACCESS_TEXT} [[no_client_access:${clientId}:${userId}:${taskId ?? "-"}]]`;
}

export function parseNoClientAccess(err: unknown): NoClientAccess | null {
  const msg = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  const m = RE.exec(msg);
  if (!m) return null;
  return { clientId: m[1]!, userId: m[2]!, taskId: m[3] === "-" ? null : m[3]! };
}

export function isNoClientAccessMessage(msg: unknown): boolean {
  return typeof msg === "string" && RE.test(msg);
}
