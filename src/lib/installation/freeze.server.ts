type FreezeClient = {
  rpc: (name: string, args?: Record<string, never>) => Promise<{ data: unknown; error: unknown }>;
};

type FreezeRpcError = {
  code?: unknown;
  message?: unknown;
};

export type InstallationOperationsFreeze = {
  frozen: boolean;
  generation: number;
  reason: string | null;
  changedBy: string | null;
  changedAt: string | null;
};

export type InstallationOperationsFreezeRead =
  | { status: "active"; state: InstallationOperationsFreeze }
  | { status: "inactive"; state: InstallationOperationsFreeze }
  | { status: "unavailable"; reason: "objects_missing" };

export function isInstallationOperationsFreezeMissing(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const rpcError = error as FreezeRpcError;
  const code = typeof rpcError.code === "string" ? rpcError.code.toUpperCase() : "";
  if (code === "PGRST202" || code === "42883" || code === "42P01") return true;

  const message = typeof rpcError.message === "string" ? rpcError.message : "";
  return (
    /read_installation_operations_freeze/i.test(message) &&
    /could not find|does not exist|schema cache/i.test(message)
  );
}

async function queryInstallationOperationsFreeze(
  client: FreezeClient,
): Promise<{ data: unknown; error: unknown }> {
  return client.rpc("read_installation_operations_freeze");
}

export async function readInstallationOperationsFreeze(
  client: FreezeClient,
): Promise<InstallationOperationsFreeze> {
  const { data, error } = await queryInstallationOperationsFreeze(client);
  if (error) throw new Error("Estado do congelamento global indisponível; operação bloqueada.");
  return parseInstallationOperationsFreeze(data);
}

export async function readInstallationOperationsFreezeForListing(
  client: FreezeClient,
): Promise<InstallationOperationsFreezeRead> {
  const result = await queryInstallationOperationsFreeze(client);
  if (result.error) {
    if (isInstallationOperationsFreezeMissing(result.error)) {
      return { status: "unavailable", reason: "objects_missing" };
    }
    throw new Error("Não foi possível consultar o estado do congelamento global.");
  }

  const state = parseInstallationOperationsFreeze(result.data);
  return { status: state.frozen ? "active" : "inactive", state };
}

function parseInstallationOperationsFreeze(data: unknown): InstallationOperationsFreeze {
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
