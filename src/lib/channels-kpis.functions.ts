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

    // Fonte da verdade: `social_posts` (uma linha por destino/placement),
    // populada tanto pelo "Publicar agora" quanto pelo worker pg_cron. A
    // tabela legada `posts.published_at` só é escrita no branch "Publicar
    // agora" do wizard, então usá-la subestima drasticamente o volume real.

    // Card 1 — publicações efetivas nos últimos 30d.
    const pub30Q = await supabase
      .from("social_posts")
      .select("id", { count: "exact", head: true })
      .eq("brand_id", data.brandId)
      .eq("status", "published")
      .gte("published_at", d30);
    const published30d = pub30Q.count ?? 0;

    const pubPrevQ = await supabase
      .from("social_posts")
      .select("id", { count: "exact", head: true })
      .eq("brand_id", data.brandId)
      .eq("status", "published")
      .gte("published_at", d60)
      .lt("published_at", d30);
    const publishedPrev30d = pubPrevQ.count ?? 0;

    const trendPct =
      publishedPrev30d === 0
        ? null
        : Math.round(((published30d - publishedPrev30d) / publishedPrev30d) * 100);

    // Card 2 — taxa de sucesso sobre tentativas nos últimos 30d.
    // Tentativa = social_posts com janela de agendamento em [d30, now] cujo
    // status já saiu de 'scheduled' (published ou failed). Ignora rascunhos
    // ('draft') e itens ainda por vencer.
    const attemptedQ = await supabase
      .from("social_posts")
      .select("id, status", { head: false })
      .eq("brand_id", data.brandId)
      .in("status", ["published", "failed"])
      .gte("scheduled_at", d30)
      .lte("scheduled_at", nowIso);
    const attemptedRows = attemptedQ.data ?? [];
    const attempted30d = attemptedRows.length;
    const successCount = attemptedRows.filter((r) => r.status === "published").length;
    const successRate = attempted30d === 0 ? null : successCount / attempted30d;

    // Card 3 — falhas nos últimos 7d = social_posts marcados como 'failed'
    // (worker gravou last_error) OU vencidos há mais de 2min ainda presos em
    // 'scheduled' (worker travou / integração indisponível).
    const staleCutoff = iso(new Date(now.getTime() - 2 * 60 * 1000));
    const failedQ = await supabase
      .from("social_posts")
      .select("id, provider, status, scheduled_at")
      .eq("brand_id", data.brandId)
      .gte("scheduled_at", d7)
      .lte("scheduled_at", nowIso)
      .or(`status.eq.failed,and(status.eq.scheduled,scheduled_at.lt.${staleCutoff})`);
    const failedRows = failedQ.data ?? [];
    const failed7d = failedRows.length;
    const counts = new Map<string, number>();
    for (const r of failedRows) {
      const provider = (r.provider ?? "") as string;
      if (!provider) continue;
      counts.set(provider, (counts.get(provider) ?? 0) + 1);
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
      // Real source of truth = rows in social_connections (OAuth-established).
      const socialSet = new Set<string>(SOCIAL_CHANNEL_IDS as unknown as string[]);
      const connQ = await supabase
        .from("social_connections")
        .select("brand_id, channel, status")
        .in("brand_id", brandIds)
        .eq("status", "active");
      const covered = new Set<string>();
      for (const row of connQ.data ?? []) {
        if (socialSet.has(row.channel)) covered.add(row.brand_id);
      }
      brandsCovered = covered.size;
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