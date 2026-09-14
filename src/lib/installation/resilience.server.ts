export type InstallationReadFailureKind =
  | "not_found"
  | "timeout"
  | "rate_limit"
  | "server_error"
  | "connection";

export class InstallationReadError extends Error {
  constructor(
    public readonly kind: Exclude<InstallationReadFailureKind, "not_found">,
    message: string,
  ) {
    super(message);
    this.name = "InstallationReadError";
  }
}

export function classifyReadFailure(cause: unknown): Exclude<InstallationReadFailureKind, "not_found"> {
  const error = cause as { message?: string; code?: string; status?: number } | null;
  const text = `${error?.message ?? ""} ${error?.code ?? ""}`.trim();
  const status = error?.status;
  if (status === 429 || /\b429\b|rate.?limit|too many requests/i.test(text)) return "rate_limit";
  if ((status !== undefined && status >= 500) || /\b50[0-9]\b|gateway|service unavailable/i.test(text)) return "server_error";
  if (/timeout|timed out|abort|statement timeout|57014/i.test(text)) return "timeout";
  return "connection";
}

export function isTransientMasterReadFailure(cause: unknown): cause is InstallationReadError {
  return cause instanceof InstallationReadError;
}

export async function readWithBackoff<T>(
  read: () => Promise<{ data: T | null; error?: unknown }>,
  options: {
    attempts?: number;
    baseDelayMs?: number;
    random?: () => number;
    sleep?: (ms: number) => Promise<void>;
  } = {},
): Promise<T | null> {
  const attempts = Math.max(1, options.attempts ?? 4);
  const baseDelayMs = Math.max(1, options.baseDelayMs ?? 250);
  const random = options.random ?? Math.random;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const result = await read();
      if (result.error) throw result.error;
      return result.data;
    } catch (cause) {
      lastError = cause;
      if (attempt + 1 >= attempts) break;
      const exponential = baseDelayMs * 2 ** attempt;
      const jitter = Math.round(exponential * 0.4 * random());
      await sleep(exponential + jitter);
    }
  }

  const kind = classifyReadFailure(lastError);
  throw new InstallationReadError(kind, `Leitura temporariamente indisponível no MASTER (${kind}).`);
}