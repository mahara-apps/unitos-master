import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const scope = z.object({
  brandId: z.string().uuid(),
  clientId: z.string().uuid(),
});

export type CustomerDashboardData = Awaited<ReturnType<typeof loadCustomerDashboardFn>>;

export const loadCustomerDashboardFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => scope.parse(i))
  .handler(async ({ data, context }) => {
    const since14d = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();
    const since30d = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

    const [client, portalTokens, activity, posts, tasks, usage] = await Promise.all([
      context.supabase
        .from("clients")
        .select("id,name,niche,color,socials,contact_name,contact_email,tone_of_voice,is_active,created_at,updated_at")
        .eq("id", data.clientId)
        .maybeSingle(),
      context.supabase
        .from("portal_tokens")
        .select("id,token,label,expires_at,revoked_at,last_seen_at,created_at")
        .eq("client_id", data.clientId)
        .order("created_at", { ascending: false }),
      context.supabase
        .from("activity_events")
        .select("id,entity_type,entity_id,verb,payload,created_at,actor_id")
        .eq("brand_id", data.brandId)
        .eq("client_id", data.clientId)
        .order("created_at", { ascending: false })
        .limit(25),
      context.supabase
        .from("posts")
        .select("id,stage,stage_id,scheduled_at,published_at,created_at")
        .eq("brand_id", data.brandId)
        .eq("client_id", data.clientId),
      context.supabase
        .from("tasks")
        .select("id,status")
        .eq("brand_id", data.brandId)
        .eq("client_id", data.clientId),
      context.supabase
        .from("brand_ai_usage")
        .select("cost_usd,created_at")
        .eq("brand_id", data.brandId)
        .gte("created_at", since30d)
        .order("created_at", { ascending: true }),
    ]);

    const postIds = (posts.data ?? []).map((p) => p.id as string);
    const { data: approvalData } = postIds.length
      ? await context.supabase
          .from("post_approvals")
          .select("id,status,post_id,created_at")
          .in("post_id", postIds)
      : { data: [] as Array<{ status: string }> };

    // Resolve stage_id -> canonical key via content_pipeline_stages so counts
    // stay in sync with the Kanban (which updates stage_id, not the legacy
    // text `stage` column).
    const stageIds = Array.from(
      new Set(
        (posts.data ?? [])
          .map((p) => p.stage_id as string | null)
          .filter((v): v is string => !!v),
      ),
    );
    const stageKeyById = new Map<string, string>();
    if (stageIds.length) {
      const { data: stageRows } = await context.supabase
        .from("content_pipeline_stages")
        .select("id,key")
        .in("id", stageIds);
      for (const row of stageRows ?? []) {
        stageKeyById.set(row.id as string, String(row.key ?? "").toLowerCase());
      }
    }

    // Bucket AI cost per-day (last 14d) for sparkline
    const days: string[] = Array.from({ length: 14 }, (_, i) => {
      const d = new Date();
      d.setUTCHours(0, 0, 0, 0);
      d.setUTCDate(d.getUTCDate() - (13 - i));
      return d.toISOString().slice(0, 10);
    });
    const bucket = new Map<string, number>(days.map((d) => [d, 0]));
    for (const row of usage.data ?? []) {
      const key = new Date(row.created_at as string).toISOString().slice(0, 10);
      if (bucket.has(key)) bucket.set(key, (bucket.get(key) ?? 0) + Number(row.cost_usd ?? 0));
    }
    const costSpark = Array.from(bucket.values());
    const costTotal30d = (usage.data ?? []).reduce((s, r) => s + Number(r.cost_usd ?? 0), 0);
    const costTotal14d = (usage.data ?? [])
      .filter((r) => (r.created_at as string) >= since14d)
      .reduce((s, r) => s + Number(r.cost_usd ?? 0), 0);

    // Pipeline stage counts
    const stages = ["idea", "production", "review", "approved", "scheduled", "published"] as const;
    const stageCounts = Object.fromEntries(stages.map((s) => [s, 0])) as Record<(typeof stages)[number], number>;
    for (const p of posts.data ?? []) {
      const resolved = (p.stage_id ? stageKeyById.get(p.stage_id as string) : null) ?? (p.stage as string | null) ?? "idea";
      const s = resolved as (typeof stages)[number];
      if (s in stageCounts) stageCounts[s] += 1;
      else stageCounts.idea += 1;
    }

    const approvalRows = (approvalData ?? []) as Array<{ status: string }>;
    const pendingApprovals = approvalRows.filter((a) => a.status === "pending").length;
    const decidedApprovals = approvalRows.length - pendingApprovals;

    const taskRows = (tasks.data ?? []) as Array<{ status: string }>;
    const openTasks = taskRows.filter((t) => t.status !== "done").length;
    const doneTasks = taskRows.length - openTasks;

    return {
      client: client.data,
      portalTokens: portalTokens.data ?? [],
      activity: activity.data ?? [],
      pipeline: { stages: stageCounts, total: (posts.data ?? []).length },
      metrics: {
        costTotal30d,
        costTotal14d,
        costSpark,
        pendingApprovals,
        decidedApprovals,
        totalApprovals: approvalRows.length,
        scheduled: stageCounts.scheduled,
        published: stageCounts.published,
        openTasks,
        doneTasks,
      },
    };
  });

function randomToken(len = 40): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("").slice(0, len);
}

export const createPortalTokenFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clientId: z.string().uuid(),
        label: z.string().trim().min(1).max(80).default("Public link"),
        expiresInDays: z.number().int().min(1).max(365).nullable().default(null),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const token = randomToken();
    const expires_at = data.expiresInDays
      ? new Date(Date.now() + data.expiresInDays * 24 * 3600 * 1000).toISOString()
      : null;
    const { data: row, error } = await context.supabase
      .from("portal_tokens")
      .insert({
        client_id: data.clientId,
        token,
        label: data.label,
        expires_at,
        created_by: context.userId,
      })
      .select("id,token,label,expires_at,revoked_at,last_seen_at,created_at")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });
