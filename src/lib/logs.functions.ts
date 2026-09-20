import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertBrandAdmin } from "@/lib/access-guard";

export type LogLevel = "error" | "warn" | "info" | "success";
export type LogSource = "system" | "critical_action" | "message" | "ai_job" | "activity";
export type LogView = "system" | "actions" | "messages" | "ai";
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type SystemLogEntry = {
  id: string;
  source: LogSource;
  view: LogView;
  level: LogLevel;
  title: string;
  subtitle: string | null;
  timestamp: string;
  brand_id: string | null;
  client_id: string | null;
  actor_id: string | null;
  category: string;
  correlation_id: string | null;
  meta: JsonValue;
};

export type LogSourceHealth = {
  source: LogSource;
  status: "available" | "unavailable" | "partial";
  count: number;
  message: string | null;
};

export type SystemLogsResult = {
  state: "ready" | "workspace_required";
  entries: SystemLogEntry[];
  health: LogSourceHealth[];
  nextCursor: string | null;
};

const Source = z.enum(["system", "critical_action", "message", "ai_job", "activity"]);
const Input = z.object({
  brandId: z.string().uuid().nullable().optional(),
  clientId: z.string().uuid().nullable().optional(),
  sources: z.array(Source).optional(),
  levels: z.array(z.enum(["error", "warn", "info", "success"])).optional(),
  search: z.string().max(120).optional(),
  since: z.string().datetime().optional(),
  until: z.string().datetime().optional(),
  cursor: z.string().datetime().optional(),
  limit: z.number().int().min(10).max(300).optional(),
});

type QueryResult = { data: unknown[] | null; error: { message: string } | null };

function toJson(value: unknown): JsonValue {
  try {
    return JSON.parse(JSON.stringify(value ?? null)) as JsonValue;
  } catch {
    return null;
  }
}

function safeMessage(value: unknown): string | null {
  const text = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  return text ? text.slice(0, 500) : null;
}

function levelFromStatus(status: unknown): LogLevel {
  const value = String(status ?? "").toLowerCase();
  if (/fail|error|invalid|blocked/.test(value)) return "error";
  if (/warn|pending|retry|cancel|skipped/.test(value)) return "warn";
  if (/success|sent|deliver|complete|succeed/.test(value)) return "success";
  return "info";
}

function sourceHealth(source: LogSource, result: QueryResult): LogSourceHealth {
  return result.error
    ? { source, status: "unavailable", count: 0, message: safeMessage(result.error.message) }
    : { source, status: "available", count: result.data?.length ?? 0, message: null };
}

export const listSystemLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Input.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<SystemLogsResult> => {
    const { supabase, userId } = context;
    if (!data.brandId)
      return { state: "workspace_required", entries: [], health: [], nextCursor: null };
    // Owner/Admin do workspace e Super Admin. Manager não consulta auditoria.
    await assertBrandAdmin(supabase, userId, data.brandId, { allowManager: false });

    const limit = data.limit ?? 100;
    const sources = data.sources ?? ["system", "critical_action", "message", "ai_job", "activity"];
    const applyWindow = <
      T extends {
        gte: (key: string, value: string) => T;
        lte: (key: string, value: string) => T;
        lt: (key: string, value: string) => T;
      },
    >(
      q: T,
      column: string,
    ): T => {
      let next = q;
      if (data.since) next = next.gte(column, data.since);
      if (data.until) next = next.lte(column, data.until);
      if (data.cursor) next = next.lt(column, data.cursor);
      return next;
    };

    const reads = new Map<LogSource, Promise<QueryResult>>();
    if (sources.includes("system")) {
      let q = supabase
        .from("system_events")
        .select(
          "id, occurred_at, severity, category, source, operation, outcome, error_code, message, brand_id, client_id, actor_id, correlation_id, attempt, metadata",
        )
        .eq("brand_id", data.brandId)
        .order("occurred_at", { ascending: false })
        .limit(limit);
      if (data.clientId) q = q.eq("client_id", data.clientId);
      reads.set(
        "system",
        applyWindow(q as never, "occurred_at") as unknown as Promise<QueryResult>,
      );
    }
    if (sources.includes("critical_action")) {
      const q = supabase
        .from("critical_action_events")
        .select(
          "id, created_at, action_key, target_type, target_id, target_label, brand_id, actor_id, impact, result, error_message",
        )
        .eq("brand_id", data.brandId)
        .order("created_at", { ascending: false })
        .limit(limit);
      reads.set(
        "critical_action",
        applyWindow(q as never, "created_at") as unknown as Promise<QueryResult>,
      );
    }
    if (sources.includes("message")) {
      let q = supabase
        .from("message_logs")
        .select(
          "id, created_at, sent_at, channel, status, brand_id, client_id, provider_message_id, error_message, metadata",
        )
        .eq("brand_id", data.brandId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (data.clientId) q = q.eq("client_id", data.clientId);
      reads.set(
        "message",
        applyWindow(q as never, "created_at") as unknown as Promise<QueryResult>,
      );
    }
    if (sources.includes("ai_job")) {
      let q = supabase
        .from("ai_jobs")
        .select(
          "id, brand_id, client_id, user_id, kind, title, subtitle, status, progress, step_label, error, created_at, started_at, finished_at, updated_at",
        )
        .eq("brand_id", data.brandId)
        .order("updated_at", { ascending: false })
        .limit(limit);
      if (data.clientId) q = q.eq("client_id", data.clientId);
      reads.set("ai_job", applyWindow(q as never, "updated_at") as unknown as Promise<QueryResult>);
    }
    if (sources.includes("activity")) {
      let q = supabase
        .from("activity_events")
        .select(
          "id, brand_id, client_id, actor_id, entity_type, entity_id, verb, payload, created_at",
        )
        .eq("brand_id", data.brandId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (data.clientId) q = q.eq("client_id", data.clientId);
      reads.set(
        "activity",
        applyWindow(q as never, "created_at") as unknown as Promise<QueryResult>,
      );
    }

    const resolved = await Promise.all(
      Array.from(reads.entries()).map(
        async ([source, promise]) => [source, await promise] as const,
      ),
    );
    const health = resolved.map(([source, result]) => sourceHealth(source, result));
    const entries: SystemLogEntry[] = [];

    for (const [source, result] of resolved) {
      if (result.error) continue;
      for (const raw of result.data ?? []) {
        const row = raw as Record<string, unknown>;
        if (source === "system")
          entries.push({
            id: `sys_${row.id}`,
            source,
            view: "system",
            level: row.severity === "warning" ? "warn" : levelFromStatus(row.severity),
            title: String(row.operation),
            subtitle: safeMessage(row.message),
            timestamp: String(row.occurred_at),
            brand_id: String(row.brand_id),
            client_id: row.client_id ? String(row.client_id) : null,
            actor_id: row.actor_id ? String(row.actor_id) : null,
            category: String(row.category),
            correlation_id: row.correlation_id ? String(row.correlation_id) : null,
            meta: toJson({
              source: row.source,
              outcome: row.outcome,
              error_code: row.error_code,
              attempt: row.attempt,
              metadata: row.metadata,
            }),
          });
        if (source === "critical_action")
          entries.push({
            id: `crit_${row.id}`,
            source,
            view: "actions",
            level: levelFromStatus(row.result),
            title: String(row.action_key),
            subtitle: safeMessage(row.error_message) ?? safeMessage(row.target_label),
            timestamp: String(row.created_at),
            brand_id: row.brand_id ? String(row.brand_id) : null,
            client_id: null,
            actor_id: row.actor_id ? String(row.actor_id) : null,
            category: String(row.target_type),
            correlation_id: row.target_id ? String(row.target_id) : null,
            meta: toJson({ result: row.result, impact: row.impact, target_id: row.target_id }),
          });
        if (source === "message")
          entries.push({
            id: `msg_${row.id}`,
            source,
            view: "messages",
            level: levelFromStatus(row.status),
            title: `${row.channel} · ${row.status}`,
            subtitle: safeMessage(row.error_message),
            timestamp: String(row.created_at ?? row.sent_at),
            brand_id: String(row.brand_id),
            client_id: row.client_id ? String(row.client_id) : null,
            actor_id: null,
            category: String(row.channel),
            correlation_id: row.provider_message_id ? String(row.provider_message_id) : null,
            meta: toJson({ status: row.status, metadata: row.metadata }),
          });
        if (source === "ai_job")
          entries.push({
            id: `job_${row.id}`,
            source,
            view: "ai",
            level: levelFromStatus(row.status),
            title: String(row.title ?? row.kind),
            subtitle: safeMessage(row.error) ?? safeMessage(row.subtitle),
            timestamp: String(
              row.finished_at ?? row.started_at ?? row.updated_at ?? row.created_at,
            ),
            brand_id: String(row.brand_id),
            client_id: row.client_id ? String(row.client_id) : null,
            actor_id: row.user_id ? String(row.user_id) : null,
            category: String(row.kind),
            correlation_id: String(row.id),
            meta: toJson({
              status: row.status,
              progress: row.progress,
              step_label: row.step_label,
            }),
          });
        if (source === "activity")
          entries.push({
            id: `act_${row.id}`,
            source,
            view: "actions",
            level: "info",
            title: `${row.entity_type} · ${row.verb}`,
            subtitle: null,
            timestamp: String(row.created_at),
            brand_id: String(row.brand_id),
            client_id: row.client_id ? String(row.client_id) : null,
            actor_id: row.actor_id ? String(row.actor_id) : null,
            category: String(row.entity_type),
            correlation_id: row.entity_id ? String(row.entity_id) : null,
            meta: toJson(row.payload),
          });
      }
    }

    let filtered = entries;
    if (data.levels?.length)
      filtered = filtered.filter((entry) => data.levels?.includes(entry.level));
    if (data.search?.trim()) {
      const search = data.search.trim().toLowerCase();
      filtered = filtered.filter((entry) =>
        [entry.title, entry.subtitle, entry.category, entry.correlation_id, entry.id].some(
          (value) => value?.toLowerCase().includes(search),
        ),
      );
    }
    filtered.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    const page = filtered.slice(0, limit);
    return {
      state: "ready",
      entries: page,
      health,
      nextCursor: page.length === limit ? (page[page.length - 1]?.timestamp ?? null) : null,
    };
  });
