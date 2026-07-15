import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SOCIAL_CHANNEL_IDS = [
  "instagram",
  "tiktok",
  "facebook",
  "youtube",
  "linkedin",
  "twitter",
  "threads",
] as const;

const CHANNEL_LABELS: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok Business API",
  facebook: "Facebook",
  youtube: "YouTube",
  linkedin: "LinkedIn",
  twitter: "Twitter / X",
  threads: "Threads",
};

const schema = z.object({ brandId: z.string().uuid() });

export type ChannelsKpis = {
  published30d: number;
  publishedPrev30d: number;
  trendPct: number | null;
  attempted30d: number;
  successRate: number | null; // 0..1
  failed7d: number;
  topFailedChannel: string | null;
  brandsTotal: number;
  brandsCovered: number;
};

export const getChannelsKpis = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data, context }): Promise<ChannelsKpis> => {
    const { supabase, userId } = context;
    const now = new Date();
    const iso = (d: Date) => d.toISOString();
    const d7 = iso(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));
    const d30 = iso(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));
    const d60 = iso(new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000));
    const nowIso = iso(now);

    // Card 1 — published in last 30d
    const pub30Q = await supabase
      .from("posts")
      .select("id", { count: "exact", head: true })
      .eq("brand_id", data.brandId)
      .is("deleted_at", null)
      .not("published_at", "is", null)
      .gte("published_at", d30);
    const published30d = pub30Q.count ?? 0;

    const pubPrevQ = await supabase
      .from("posts")
      .select("id", { count: "exact", head: true })
      .eq("brand_id", data.brandId)
      .is("deleted_at", null)
      .not("published_at", "is", null)
      .gte("published_at", d60)
      .lt("published_at", d30);
    const publishedPrev30d = pubPrevQ.count ?? 0;

    const trendPct =
      publishedPrev30d === 0
        ? null
        : Math.round(((published30d - publishedPrev30d) / publishedPrev30d) * 100);

    // Card 2 — success rate over attempts in last 30d.
    // Attempted = posts due (scheduled_at in [now-30d, now]) that reached scheduled/published stages.
    const attemptedQ = await supabase
      .from("posts")
      .select("id, published_at", { head: false })
      .eq("brand_id", data.brandId)
      .is("deleted_at", null)
      .in("stage", ["scheduled", "published"])
      .gte("scheduled_at", d30)
      .lte("scheduled_at", nowIso);
    const attemptedRows = attemptedQ.data ?? [];
    const attempted30d = attemptedRows.length;
    const successCount = attemptedRows.filter((r) => r.published_at !== null).length;
    const successRate = attempted30d === 0 ? null : successCount / attempted30d;

    // Card 3 — failures in last 7d = due & unpublished
    const failedQ = await supabase
      .from("posts")
      .select("id, channels")
      .eq("brand_id", data.brandId)
      .is("deleted_at", null)
      .is("published_at", null)
      .eq("stage", "scheduled")
      .gte("scheduled_at", d7)
      .lte("scheduled_at", nowIso);
    const failedRows = failedQ.data ?? [];
    const failed7d = failedRows.length;
    const counts = new Map<string, number>();
    for (const r of failedRows) {
      const chs = Array.isArray(r.channels) ? (r.channels as string[]) : [];
      for (const c of chs) counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    let topFailedChannel: string | null = null;
    let maxN = 0;
    for (const [ch, n] of counts) {
      if (n > maxN) {
        maxN = n;
        topFailedChannel = CHANNEL_LABELS[ch] ?? ch;
      }
    }

    // Card 4 — brand coverage (brands with >=1 active social channel)
    const memberships = await supabase
      .from("brand_members")
      .select("brand_id")
      .eq("user_id", userId);
    const brandIds = (memberships.data ?? []).map((m) => m.brand_id);
    const brandsTotal = brandIds.length;

    let brandsCovered = 0;
    if (brandsTotal > 0) {
      const connQ = await supabase
        .from("brand_connections")
        .select("brand_id, channels")
        .in("brand_id", brandIds);
      const socialSet = new Set<string>(SOCIAL_CHANNEL_IDS as unknown as string[]);
      for (const row of connQ.data ?? []) {
        const chMap = (row.channels ?? {}) as Record<
          string,
          { connected?: boolean } | undefined
        >;
        const hasActive = Object.entries(chMap).some(
          ([id, cfg]) => socialSet.has(id) && cfg?.connected === true,
        );
        if (hasActive) brandsCovered += 1;
      }
    }

    return {
      published30d,
      publishedPrev30d,
      trendPct,
      attempted30d,
      successRate,
      failed7d,
      topFailedChannel,
      brandsTotal,
      brandsCovered,
    };
  });