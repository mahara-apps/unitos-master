/** Clientes oferecidos na escolha: Owner/Admin (escopo null) veem todos; os demais só os atribuídos. */
export function visibleClientsFor<T extends { id: string; name: string | null }>(
  clients: T[],
  allowedClientIds: Set<string> | null,
): T[] {
  return clients
    .filter((c) => !allowedClientIds || allowedClientIds.has(c.id))
    .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", "pt-BR"));
}
