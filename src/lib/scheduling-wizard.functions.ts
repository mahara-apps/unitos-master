import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Server functions do wizard de agendamento (/calendar).
 * Reaproveita `posts` + `post_placements` + `social_connections`.
 * Todas as leituras de conexão filtram por (brand_id, client_id).
 */

// ============================================================
// Types
// ============================================================

export type WizardConnection = {
  connectionId: string;
  channel: string; // instagram | facebook | ...
  accountLabel: string;
  handle: string | null;
  avatarUrl: string | null;
  status: string;
};

export type PendingSchedulePost = {
  postId: string;
  title: string;
  copy: string;
  coverUrl: string | null;
  channels: string[];
  approvedAt: string | null;
};

// ============================================================
// listClientSocialConnectionsFn
// ============================================================

export const listClientSocialConnectionsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        brandId: z.string().uuid(),
        clientId: z.string().uuid(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<WizardConnection[]> => {
    const { data: rows, error } = await context.supabase
      .from("social_connections")
      .select(
        "id, channel, external_name, account_username, status, metadata",
      )
      .eq("brand_id", data.brandId)
      .eq("client_id", data.clientId)
      .eq("status", "active");
    if (error) throw new Error(error.message);

    return (rows ?? []).map((r) => {
      const meta = (r.metadata ?? {}) as Record<string, unknown>;
      const avatar =
        r.channel === "instagram"
          ? ((meta.instagram_picture_url ?? meta.page_picture_url ?? null) as
              | string
              | null)
          : r.channel === "facebook"
            ? ((meta.page_picture_url ?? null) as string | null)
            : null;
      const handle =
        r.channel === "instagram"
          ? (r.account_username ?? null)
          : (r.external_name ?? null);
      return {
        connectionId: r.id as string,
        channel: r.channel as string,
        accountLabel: (r.external_name ?? handle ?? r.channel) as string,
        handle,
        avatarUrl: avatar,
        status: r.status as string,
      };
    });
  });

// ============================================================
// listApprovedUnscheduledFn — painel lateral
// ============================================================

export const listApprovedUnscheduledFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        brandId: z.string().uuid(),
        clientId: z.string().uuid().nullable().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<PendingSchedulePost[]> => {
    let q = context.supabase
      .from("posts")
      .select("id, title, copy, cover_url, channels, approved_at")
      .eq("brand_id", data.brandId)
      .eq("stage", "approved")
      .is("scheduled_at", null)
      .is("deleted_at", null)
      .order("approved_at", { ascending: true, nullsFirst: false })
      .limit(50);
    if (data.clientId) q = q.eq("client_id", data.clientId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []).map((p) => ({
      postId: p.id as string,
      title: (p.title as string) ?? "Sem título",
      copy: (p.copy as string) ?? "",
      coverUrl: (p.cover_url as string | null) ?? null,
      channels: (p.channels as string[] | null) ?? [],
      approvedAt: (p.approved_at as string | null) ?? null,
    }));
  });

// ============================================================
// saveScheduledPostFn — cria/atualiza post + placements
// ============================================================

const DestinationSchema = z.object({
  connectionId: z.string().uuid(),
  channel: z.enum([
    "instagram",
    "facebook",
    "linkedin",
    "tiktok",
    "youtube",
    "x",
    "threads",
  ]),
  format: z.enum(["feed", "stories", "reels", "carrossel"]),
  copyOverride: z.string().nullable().optional(),
});

const SaveInput = z.object({
  postId: z.string().uuid().nullable().optional(),
  brandId: z.string().uuid(),
  clientId: z.string().uuid(),
  title: z.string().min(1).max(160),
  copy: z.string().default(""),
  mediaPaths: z.array(z.string()).default([]),
  hashtags: z.array(z.string()).default([]),
  destinations: z.array(DestinationSchema).min(1),
  scheduledAt: z.string().nullable().optional(), // ISO
  action: z.enum(["draft", "publish", "schedule"]),
});

export const saveScheduledPostFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => SaveInput.parse(i))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;

    // Validação de horário mínimo (>= agora + 5min) para agendamento
    let scheduledIso: string | null = null;
    if (data.action === "schedule") {
      if (!data.scheduledAt) throw new Error("Data de agendamento obrigatória");
      const scheduled = new Date(data.scheduledAt);
      const min = Date.now() + 5 * 60 * 1000;
      if (scheduled.getTime() < min) {
        throw new Error("Agende para pelo menos 5 minutos a partir de agora");
      }
      scheduledIso = scheduled.toISOString();
    }

    // Mapeia mídia (paths → jsonb array) para persistir em placements
    const mediaJson = data.mediaPaths.map((p) => ({ storagePath: p }));
    // Canais únicos (post.channels usa enum post_channel — filtra os aceitos)
    const POST_CHANNEL_ENUM = new Set([
      "instagram",
      "tiktok",
      "linkedin",
      "x",
      "youtube",
      "blog",
    ]);
    const channels = Array.from(new Set(data.destinations.map((d) => d.channel)))
      .filter((c) => POST_CHANNEL_ENUM.has(c));

    const stage =
      data.action === "schedule"
        ? "scheduled"
        : data.action === "publish"
          ? "approved"
          : "approved";

    // ---- Upsert post ----
    let postId = data.postId ?? null;
    if (!postId) {
      const { data: inserted, error } = await supabase
        .from("posts")
        .insert({
          brand_id: data.brandId,
          client_id: data.clientId,
          title: data.title,
          copy: data.copy,
          channels,
          stage,
          scheduled_at: scheduledIso,
          created_by: context.userId,
          approved_at: new Date().toISOString(),
          review_status: "approved",
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      postId = inserted.id as string;
    } else {
      const { error } = await supabase
        .from("posts")
        .update({
          title: data.title,
          copy: data.copy,
          channels,
          stage,
          scheduled_at: scheduledIso,
        })
        .eq("id", postId)
        .eq("brand_id", data.brandId);
      if (error) throw new Error(error.message);
    }

    // ---- Sync placements por (channel, format) ----
    // Estratégia simples: apaga tudo do post e reinsere. Baixa cardinalidade.
    const { error: delErr } = await supabase
      .from("post_placements")
      .delete()
      .eq("post_id", postId);
    if (delErr) throw new Error(delErr.message);

    if (data.destinations.length) {
      // Deduplica pares (channel, format) pra respeitar UNIQUE(post_id, format)
      // Como a UNIQUE é por format apenas, mantemos 1 por format (última vence).
      const byFormat = new Map<string, (typeof data.destinations)[number]>();
      for (const d of data.destinations) byFormat.set(d.format, d);

      const rows = Array.from(byFormat.values()).map((d, i) => ({
        post_id: postId,
        brand_id: data.brandId,
        client_id: data.clientId,
        format: d.format,
        scheduled_at: scheduledIso,
        copy_override: d.copyOverride
          ? { copy: d.copyOverride, connection_id: d.connectionId, channel: d.channel }
          : { connection_id: d.connectionId, channel: d.channel },
        media: mediaJson,
        status: data.action === "schedule" ? "scheduled" : "draft",
        is_primary: i === 0,
      }));
      const { error: insErr } = await supabase.from("post_placements").insert(rows);
      if (insErr) throw new Error(insErr.message);
    }

    return { ok: true, postId };
  });
