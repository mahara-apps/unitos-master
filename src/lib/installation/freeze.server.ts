type FreezeClient = {
  rpc: (name: string, args?: Record<string, never>) => Promise<{ data: unknown; error: unknown }>;
};

export type InstallationOperationsFreeze = {
  frozen: boolean;
  generation: number;
  reason: string | null;
  changedBy: string | null;
  changedAt: string | null;
};

export async function readInstallationOperationsFreeze(
  client: FreezeClient,
): Promise<InstallationOperationsFreeze> {
  const { data, error } = await client.rpc("read_installation_operations_freeze");
  if (error) throw new Error("Estado do congelamento global indisponível; operação bloqueada.");
  if (!data || typeof data !== "object" || !("frozen" in data) || !("generation" in data)) {
    throw new Error("Estado do congelamento global inválido; operação bloqueada.");
  }
  const row = data as Record<string, unknown>;
  if (typeof row["frozen"] !== "boolean" || typeof row["generation"] !== "number") {
    throw new Error("Estado do congelamento global inválido; operação bloqueada.");
  }
  return {
    frozen: row["frozen"],
    generation: row["generation"],
    reason: typeof row["reason"] === "string" ? row["reason"] : null,
    changedBy: typeof row["changedBy"] === "string" ? row["changedBy"] : null,
    changedAt: typeof row["changedAt"] === "string" ? row["changedAt"] : null,
  };
}

export async function assertInstallationOperationsWritable(client: FreezeClient): Promise<void> {
  const state = await readInstallationOperationsFreeze(client);
  if (state.frozen) {
    throw new Error("Installation Manager congelado globalmente; nenhuma alteração é permitida.");
  }
}
