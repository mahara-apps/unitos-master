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
  placements: Array<{ channel: string; format: string }>;
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
    // Contas sociais são globais na marca (/connections) e atribuídas ao
    // cliente a partir do perfil do cliente (aba "Canais"). O wizard lê o
    // vínculo em client_social_accounts.
    const { data: assigns, error: aErr } = await context.supabase
      .from("client_social_accounts")
      .select("connection_id")
      .eq("client_id", data.clientId)
      .eq("brand_id", data.brandId);
    if (aErr) throw new Error(aErr.message);
    const ids = (assigns ?? []).map((a) => a.connection_id);
    if (!ids.length) return [];
    const { data: rows, error } = await context.supabase
      .from("social_connections")
      .select("id, channel, external_name, account_username, status, metadata")
      .eq("brand_id", data.brandId)
      .in("id", ids)
      .eq("status", "active");
    console.log("[wizard] listClientSocialConnections", {
      brandId: data.brandId,
      clientId: data.clientId,
      rowsCount: rows?.length ?? 0,
      rows,
      error,
    });
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
    const postIds = (rows ?? []).map((r) => r.id as string);
    const placementsByPost = new Map<
      string,
      Array<{ channel: string; format: string }>
    >();
    if (postIds.length) {
      const { data: pls, error: plErr } = await context.supabase
        .from("post_placements")
        .select("post_id, format, copy_override")
        .in("post_id", postIds);
      if (plErr) throw new Error(plErr.message);
      for (const pl of pls ?? []) {
        const key = pl.post_id as string;
        const arr = placementsByPost.get(key) ?? [];
        const co = (pl.copy_override ?? {}) as Record<string, unknown>;
        const channel = typeof co.channel === "string" ? co.channel : "";
        arr.push({
          channel,
          format: pl.format as string,
        });
        placementsByPost.set(key, arr);
      }
    }
    return (rows ?? []).map((p) => ({
      postId: p.id as string,
      title: (p.title as string) ?? "Sem título",
      copy: (p.copy as string) ?? "",
      coverUrl: (p.cover_url as string | null) ?? null,
      channels: (p.channels as string[] | null) ?? [],
      approvedAt: (p.approved_at as string | null) ?? null,
      placements: placementsByPost.get(p.id as string) ?? [],
    }));
  });

// ============================================================
// saveScheduledPostFn — cria/atualiza post + placements
// ============================================================

// ============================================================
// listDraftsFn — rascunhos (stage=idea) do wizard
// ============================================================

export const listDraftsFn = createServerFn({ method: "GET" })
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
      .select("id, title, copy, cover_url, channels, updated_at")
      .eq("brand_id", data.brandId)
      .eq("stage", "idea")
      .is("scheduled_at", null)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
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
      approvedAt: (p.updated_at as string | null) ?? null,
      placements: [],
    }));
  });

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
  firstComment: z.string().max(2200).nullable().optional(),
  linkUrl: z.string().url().nullable().optional(),
  locationName: z.string().max(120).nullable().optional(),
  destinations: z.array(DestinationSchema).default([]),
  scheduledAt: z.string().nullable().optional(), // ISO
  action: z.enum(["draft", "publish", "schedule", "save_draft"]),
}).superRefine((v, ctx) => {
  if (v.action !== "save_draft" && v.destinations.length < 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["destinations"],
      message: "Selecione ao menos um canal.",
    });
  }
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
    const channels = Array.from(
      new Set(data.destinations.map((d) => d.channel)),
    ).filter((c) => POST_CHANNEL_ENUM.has(c)) as (
      | "instagram"
      | "tiktok"
      | "linkedin"
      | "x"
      | "youtube"
      | "blog"
    )[];

    const stage =
      data.action === "schedule"
        ? "scheduled"
        : data.action === "publish"
          ? "approved"
          : data.action === "save_draft"
            ? "idea"
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
          approved_at: data.action === "save_draft" ? null : new Date().toISOString(),
          review_status: data.action === "save_draft" ? "pending" : "approved",
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
        copy_override: {
          connection_id: d.connectionId,
          channel: d.channel,
          ...(d.copyOverride ? { copy: d.copyOverride } : {}),
          ...(data.hashtags.length ? { hashtags: data.hashtags } : {}),
          ...(data.firstComment ? { first_comment: data.firstComment } : {}),
          ...(data.linkUrl ? { link: data.linkUrl } : {}),
          ...(data.locationName ? { location_name: data.locationName } : {}),
        },
        media: mediaJson,
        status: data.action === "schedule" ? "scheduled" : "draft",
        is_primary: i === 0,
      }));
      const { error: insErr } = await supabase.from("post_placements").insert(rows);
      if (insErr) throw new Error(insErr.message);
    }

    // ---- Publicar agora: dispara Meta para cada destino suportado ----
    if (data.action === "publish") {
      const { MetaPublishingService, formatPublishError } = await import(
        "@/lib/meta/publishing.server"
      );
      const svc = new MetaPublishingService();
      const results: Array<{ channel: string; format: string; ok: boolean; error?: string; permalink?: string | null }> = [];
      for (const d of data.destinations) {
        // Meta atualmente só publica Feed IG/FB. Reels/Stories vêm depois.
        const supported =
          d.format === "feed" && (d.channel === "instagram" || d.channel === "facebook");
        if (!supported) {
          results.push({ channel: d.channel, format: d.format, ok: false, error: "Formato ainda não publicável (apenas Feed IG/FB)" });
          continue;
        }
        // Valor persistido em social_posts.placement (CHECK constraint) e enviado
        // ao provider como identificador de superfície.
        const providerPlacement: "instagram_feed" | "facebook_feed" =
          d.channel === "instagram" ? "instagram_feed" : "facebook_feed";
        const dbPlacement = "feed" as const;
        try {
          // Carrega conexão (isolada por brand/cliente)
          const { data: conn, error: connErr } = await supabase
            .from("social_connections")
            .select(
              "id, brand_id, client_id, provider, external_id, account_id, access_token_ciphertext, status",
            )
            .eq("id", d.connectionId)
            .eq("brand_id", data.brandId)
            .maybeSingle();
          if (connErr) throw new Error(connErr.message);
          if (!conn) throw new Error("Conexão não encontrada");
          if (!conn.access_token_ciphertext) throw new Error("Conexão sem token — reconecte a página");
          if (conn.client_id && conn.client_id !== data.clientId) {
            throw new Error("Conexão não pertence a este cliente");
          }

          // Resolve mídia (signed URL curta para imagem privada)
          const mediaOut: { imageUrl?: string; link?: string } = {};
          if (data.linkUrl) mediaOut.link = data.linkUrl;
          if (data.mediaPaths[0]) {
            const path = data.mediaPaths[0];
            if (!path.startsWith(`${data.brandId}/`)) throw new Error("Mídia fora do escopo da marca");
            const { data: signed, error: sErr } = await supabase.storage
              .from("brand-media")
              .createSignedUrl(path, 3600);
            if (sErr) throw new Error(`Falha ao assinar mídia: ${sErr.message}`);
            mediaOut.imageUrl = signed.signedUrl;
          }
          if (providerPlacement === "instagram_feed" && !mediaOut.imageUrl) {
            throw new Error("Feed do Instagram exige uma imagem");
          }

          const caption = [
            data.copy,
            ...(data.hashtags.length
              ? [data.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")]
              : []),
          ]
            .filter(Boolean)
            .join("\n\n")
            .trim() || undefined;

          // Registro de auditoria em social_posts
          const { data: sp, error: spErr } = await supabase
            .from("social_posts")
            .insert({
              brand_id: data.brandId,
              client_id: data.clientId,
              connection_id: d.connectionId,
              provider: conn.provider,
              placement: dbPlacement,
              caption: caption ?? null,
              hashtags: data.hashtags,
              mentions: [],
              media: data.mediaPaths[0]
                ? { storagePath: data.mediaPaths[0], ...(data.linkUrl ? { link: data.linkUrl } : {}) }
                : (data.linkUrl ? { link: data.linkUrl } : {}),
              post_id: postId,
              status: "publishing",
              created_by: context.userId,
            })
            .select("id")
            .single();
          if (spErr) throw new Error(spErr.message);

          try {
            const result = await svc.publish(conn as any, { placement: providerPlacement, caption, media: mediaOut });
            await supabase
              .from("social_posts")
              .update({
                status: "published",
                published_at: new Date().toISOString(),
                external_post_id: result.externalPostId,
                external_permalink: result.externalPermalink,
                provider_response: result.providerResponse as any,
                last_error: null,
              })
              .eq("id", sp.id);
            results.push({ channel: d.channel, format: d.format, ok: true, permalink: result.externalPermalink });
          } catch (err) {
            const msg = formatPublishError(err);
            await supabase
              .from("social_posts")
              .update({ status: "failed", last_error: msg })
              .eq("id", sp.id);
            throw new Error(msg);
          }
        } catch (err) {
          results.push({ channel: d.channel, format: d.format, ok: false, error: (err as Error).message });
        }
      }
      const okCount = results.filter((r) => r.ok).length;
      if (okCount > 0) {
        await supabase
          .from("posts")
          .update({ stage: "published", published_at: new Date().toISOString() } as any)
          .eq("id", postId)
          .eq("brand_id", data.brandId);
      }
      return { ok: okCount > 0, postId, published: okCount, results };
    }

    return { ok: true, postId };
  });

// ============================================================
// deleteDraftPostFn — remove rascunho (stage=idea) do wizard
// ============================================================

export const deleteDraftPostFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        postId: z.string().uuid(),
        brandId: z.string().uuid(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    // Confirma que é rascunho antes de deletar (evita apagar post publicado/agendado).
    const { data: row, error: rErr } = await context.supabase
      .from("posts")
      .select("id, stage")
      .eq("id", data.postId)
      .eq("brand_id", data.brandId)
      .maybeSingle();
    if (rErr) throw new Error(rErr.message);
    if (!row) throw new Error("Rascunho não encontrado.");
    if (row.stage !== "idea") {
      throw new Error("Apenas rascunhos podem ser excluídos por aqui.");
    }
    // Placements dependem do post — remove primeiro por segurança se não houver cascade.
    await context.supabase.from("post_placements").delete().eq("post_id", data.postId);
    const { error } = await context.supabase
      .from("posts")
      .delete()
      .eq("id", data.postId)
      .eq("brand_id", data.brandId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
