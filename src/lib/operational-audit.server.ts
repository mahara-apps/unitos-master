import type { SupabaseClient } from "@supabase/supabase-js";

export type OperationalSeverity = "info" | "warning" | "error" | "success";
export type OperationalCategory =
  | "email"
  | "cron"
  | "webhook"
  | "ai"
  | "integration"
  | "installation"
  | "system";

export type OperationalEventInput = {
  severity: OperationalSeverity;
  category: OperationalCategory;
  source: string;
  operation: string;
  outcome: "success" | "warning" | "error" | "skipped";
  message: string;
  brandId: string;
  clientId?: string | null;
  actorId?: string | null;
  correlationId?: string | null;
  attempt?: number | null;
  errorCode?: string | null;
  metadata?: Record<string, unknown>;
};

const SECRET_KEY = /(authorization|api[_-]?key|token|secret|password|credential|cookie)/i;
const SECRET_VALUE = /\b(?:re_|sk-|sk_|AIza|Bearer\s+)[A-Za-z0-9._-]{6,}/gi;

export function sanitizeOperationalText(value: unknown, max = 500): string {
  return String(value ?? "")
    .replace(SECRET_VALUE, "[redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function sanitizeOperationalMetadata(
  value: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const walk = (input: unknown, depth: number): unknown => {
    if (depth > 3) return "[truncated]";
    if (Array.isArray(input)) return input.slice(0, 20).map((item) => walk(item, depth + 1));
    if (input && typeof input === "object") {
      return Object.fromEntries(
        Object.entries(input as Record<string, unknown>)
          .slice(0, 30)
          .map(([key, item]) => [key, SECRET_KEY.test(key) ? "[redacted]" : walk(item, depth + 1)]),
      );
    }
    if (typeof input === "string") return sanitizeOperationalText(input, 300);
    return typeof input === "number" || typeof input === "boolean" || input === null
      ? input
      : String(input ?? "");
  };
  return walk(value ?? {}, 0) as Record<string, unknown>;
}

/** Best-effort: a falha da telemetria nunca altera o resultado da operação original. */
export async function logOperationalEvent(
  input: OperationalEventInput,
  client?: SupabaseClient,
): Promise<void> {
  try {
    const writer = client ?? (await import("@/integrations/supabase/client.server")).supabaseAdmin;
    const { error } = await writer.from("system_events" as never).insert({
      severity: input.severity,
      category: input.category,
      source: sanitizeOperationalText(input.source, 80),
      operation: sanitizeOperationalText(input.operation, 120),
      outcome: input.outcome,
      error_code: input.errorCode ? sanitizeOperationalText(input.errorCode, 80) : null,
      message: sanitizeOperationalText(input.message, 500) || "Evento operacional",
      brand_id: input.brandId,
      client_id: input.clientId ?? null,
      actor_id: input.actorId ?? null,
      correlation_id: input.correlationId
        ? sanitizeOperationalText(input.correlationId, 120)
        : null,
      attempt: input.attempt ?? null,
      metadata: sanitizeOperationalMetadata(input.metadata),
    } as never);
    if (error) console.error("[operational-audit] insert failed", error.message);
  } catch (error) {
    console.error(
      "[operational-audit] unavailable",
      sanitizeOperationalText(error instanceof Error ? error.message : error, 200),
    );
  }
}