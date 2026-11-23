/**
 * Regras puras do bloco "Clientes que atende" (Equipe).
 * A autoridade real é do banco (`set_member_clients` / `_apply_member_clients`);
 * aqui só decidimos o que a tela mostra e o que enviar.
 */
import { z } from "zod";

export const ClientAccessSchema = z.object({
  /** "Todos os clientes" — inclui clientes cadastrados depois. */
  all: z.boolean(),
  clientIds: z.array(z.string().uuid()).max(5000),
});
export type ClientAccess = z.infer<typeof ClientAccessSchema>;

/** Só Manager e User têm escopo por cliente; Owner/Admin veem o workspace inteiro. */
export function roleNeedsClientScope(role: string | null | undefined): boolean {
  return role === "manager" || role === "user";
}

/** Resumo "+3 clientes, −1 cliente" do que vai mudar ao salvar. */
export function summarizeClientChange(
  before: { all: boolean; clientIds: string[] },
  after: ClientAccess,
): string | null {
  if (before.all !== after.all) {
    return after.all ? "Passa a ver todos os clientes" : "Deixa de ver todos os clientes";
  }
  if (after.all) return null;
  const prev = new Set(before.clientIds);
  const next = new Set(after.clientIds);
  const added = [...next].filter((id) => !prev.has(id)).length;
  const removed = [...prev].filter((id) => !next.has(id)).length;
  const parts: string[] = [];
  if (added) parts.push(`+${added} cliente${added > 1 ? "s" : ""}`);
  if (removed) parts.push(`−${removed} cliente${removed > 1 ? "s" : ""}`);
  return parts.length ? parts.join(", ") : null;
}

/** Texto curto da coluna de acesso na lista da Equipe. */
export function clientScopeLabel(m: {
  role: string;
  allClients: boolean;
  clientCount: number;
}): { label: string; empty: boolean } {
  if (!roleNeedsClientScope(m.role)) return { label: "Todos os clientes (papel)", empty: false };
  if (m.allClients) return { label: "Todos os clientes", empty: false };
  if (m.clientCount === 0) return { label: "Nenhum cliente", empty: true };
  return { label: `${m.clientCount} cliente${m.clientCount > 1 ? "s" : ""}`, empty: false };
}
