import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  syncPostPlacements,
  deriveChannelsFromDestinations,
  deriveTargetConnectionIds,
} from "@/lib/placements.server";
import { resolveStageIdByKey } from "@/lib/post-stage.server";


/**
 * Server functions do wizard de agendamento (/calendar).
 * Reaproveita `posts` + `post_placements` + `social_connections`.
 * Leituras de posts filtram por (brand_id, client_id); canais vêm do vínculo
 * client_social_accounts (o campo legado social_connections.client_id não é usado).
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
  targetConnectionIds: string[];
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
      .select("id, title, copy, cover_url, channels, approved_at, target_connection_ids")
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
      targetConnectionIds: (p.target_connection_ids as string[] | null) ?? [],
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
      .select("id, title, copy, cover_url, channels, updated_at, target_connection_ids")
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
      targetConnectionIds: (p.target_connection_ids as string[] | null) ?? [],
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
  locationId: z.string().max(64).nullable().optional(),
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

    // Pré-validação de agendamento: antes de gravar o post como "scheduled",
    // conferimos que cada destino suportado tem conexão ativa, token presente
    // e vínculo com o cliente. Sem isso, o Kanban ficaria marcado como
    // agendado mesmo com a conexão social quebrada — e o cron nunca publicaria.
    type ValidatedScheduleTarget = {
      destination: (typeof data.destinations)[number];
      connection: { id: string; provider: string };
    };
    const validatedScheduleTargets: ValidatedScheduleTarget[] = [];
    const scheduleWarnings: Array<{ channel: string; format: string; error: string }> = [];
    if (data.action === "schedule") {
      const connIds = Array.from(new Set(data.destinations.map((d) => d.connectionId)));
      const { data: conns, error: connsErr } = await supabase
        .from("social_connections")
        .select("id, brand_id, provider, status, access_token_ciphertext")
        .eq("brand_id", data.brandId)
        .in("id", connIds);
      if (connsErr) throw new Error(connsErr.message);
      const connMap = new Map(
        (conns ?? []).map((c) => [c.id as string, c]),
      );
      // Vínculo canal ↔ cliente: única fonte de verdade.
      const { data: links, error: linksErr } = await supabase
        .from("client_social_accounts")
        .select("connection_id")
        .eq("brand_id", data.brandId)
        .eq("client_id", data.clientId);
      if (linksErr) throw new Error(linksErr.message);
      const linkedIds = new Set(
        ((links ?? []) as Array<{ connection_id: string }>).map((l) => l.connection_id),
      );
      for (const d of data.destinations) {
        // Suportado hoje: Feed IG/FB e Stories no IG (multi-frame automático).
        const supported =
          (d.format === "feed" &&
            (d.channel === "instagram" || d.channel === "facebook")) ||
          (d.format === "stories" && d.channel === "instagram");
        if (!supported) {
          scheduleWarnings.push({
            channel: d.channel,
            format: d.format,
            error: "Formato ainda não agendável (Feed IG/FB ou Stories IG)",
          });
          continue;
        }
        const conn = connMap.get(d.connectionId);
        if (!conn) {
          throw new Error(`Conexão ${d.channel} não encontrada nesta marca.`);
        }
        if (!conn.access_token_ciphertext) {
          throw new Error(
            `Conexão ${d.channel} sem token — reconecte a página antes de agendar.`,
          );
        }
        if (!linkedIds.has(d.connectionId)) {
          throw new Error(
            `Canal ${d.channel} não está vinculado a este cliente. Vincule em Perfil do cliente > Canais.`,
          );
        }
        if (conn.status !== "active") {
          throw new Error(
            `Conexão ${d.channel} não está ativa — reconecte antes de agendar.`,
          );
        }
        validatedScheduleTargets.push({
          destination: d,
          connection: {
            id: conn.id as string,
            provider: conn.provider as string,
          },
        });
      }
      if (validatedScheduleTargets.length === 0) {
        throw new Error(
          scheduleWarnings[0]?.error ??
            "Nenhum destino suportado para agendamento (Feed IG/FB ou Stories IG).",
        );
      }
    }


    // Canais únicos (post.channels usa enum post_channel — filtra os aceitos)
    const channels = deriveChannelsFromDestinations(data.destinations);

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
    const targetConnIds = deriveTargetConnectionIds(data.destinations);
    if (!postId) {
      const { data: inserted, error } = await supabase
        .from("posts")
        .insert({
          brand_id: data.brandId,
          client_id: data.clientId,
          title: data.title,
          copy: data.copy,
          channels,
          target_connection_ids: targetConnIds,
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
          target_connection_ids: targetConnIds,
          stage,
          scheduled_at: scheduledIso,
        })
        .eq("id", postId)
        .eq("brand_id", data.brandId);
      if (error) throw new Error(error.message);
    }

    // ---- Estágio operacional (stage_id) acompanha a ação ----
    // O wizard historicamente escrevia só o campo legado `posts.stage`, o que
    // deixava a peça parada na coluna antiga do Kanban. Aqui movemos a coluna
    // real do pipeline da peça (quando existir equivalente).
    {
      const { data: row } = await supabase
        .from("posts")
        .select("pipeline_id, stage_id")
        .eq("id", postId)
        .maybeSingle();
      const pipelineId = (row?.pipeline_id as string | null) ?? null;
      const keys =
        data.action === "schedule"
          ? ["scheduled"]
          : data.action === "save_draft"
            ? ["idea", "briefing"]
            : ["approved"];
      const stageId = await resolveStageIdByKey(supabase, pipelineId, keys);
      if (stageId && stageId !== (row?.stage_id as string | null)) {
        await supabase
          .from("posts")
          .update({ stage_id: stageId } as never)
          .eq("id", postId)
          .eq("brand_id", data.brandId);
      }
    }


    // ---- Sync placements por (channel, format) via helper compartilhado ----
    await syncPostPlacements(supabase, {
      postId,
      brandId: data.brandId,
      clientId: data.clientId,
      destinations: data.destinations,
      mediaPaths: data.mediaPaths,
      hashtags: data.hashtags,
      firstComment: data.firstComment ?? null,
      linkUrl: data.linkUrl ?? null,
      locationName: data.locationName ?? null,
      locationId: data.locationId ?? null,
      scheduledIso,
      status: data.action === "schedule" ? "scheduled" : "draft",
    });

    // ---- Agendar: cria linhas em social_posts para o worker pg_cron drenar ----
    // Sem isso, o horário passa e nada é publicado (Kanban fica "Agendado" para sempre).
    if (data.action === "schedule" && scheduledIso) {
      // Formatos ainda não agendáveis viram avisos (mesmo padrão da branch publish).
      const enqueueResults: Array<{
        channel: string;
        format: string;
        ok: boolean;
        error?: string;
      }> = scheduleWarnings.map((w) => ({ ...w, ok: false }));

      for (const { destination: d, connection: conn } of validatedScheduleTargets) {
        const isStory = d.format === "stories";
        // Stories NUNCA carrega caption (Meta API ignora / retorna erro).
        const caption = isStory
          ? null
          :
          [
            d.copyOverride ?? data.copy,
            ...(data.hashtags.length
              ? [data.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")]
              : []),
          ]
            .filter(Boolean)
            .join("\n\n")
            .trim() || null;

        // Stories multi-frame: 1 social_posts por mídia, +1 minuto por frame.
        // Feed/Reels: 1 linha (usa a primeira mídia).
        const frames =
          isStory && data.mediaPaths.length > 0
            ? data.mediaPaths
            : [data.mediaPaths[0] as string | undefined];
        const baseMs = new Date(scheduledIso!).getTime();

        let frameErr: string | null = null;
        for (let i = 0; i < frames.length; i++) {
          const path = frames[i];
          const media =
            path
              ? {
                  storagePath: path,
                  ...(isStory ? {} : data.linkUrl ? { link: data.linkUrl } : {}),
                }
              : !isStory && data.linkUrl
                ? { link: data.linkUrl }
                : {};
          const frameIso = new Date(baseMs + i * 60_000).toISOString();
          const { error: spErr } = await supabase.from("social_posts").insert({
            brand_id: data.brandId,
            client_id: data.clientId,
            connection_id: d.connectionId,
            provider: conn.provider,
            placement: isStory ? "story" : "feed",
            caption: isStory ? null : caption,
            hashtags: isStory ? [] : data.hashtags,
            mentions: [],
            media,
            post_id: postId,
            status: "scheduled",
            scheduled_at: frameIso,
            created_by: context.userId,
            location_id: isStory ? null : data.locationId ?? null,
          });
          if (spErr) {
            frameErr = spErr.message;
            break;
          }
        }
        if (frameErr) {
          // Rollback: o post não pode ficar como "scheduled" no Kanban se não
          // conseguimos enfileirar todas as publicações — o cron não vai
          // publicar e o usuário ficaria com um agendamento fantasma.
          await supabase
            .from("social_posts")
            .delete()
            .eq("post_id", postId)
            .eq("status", "scheduled");
          await supabase
            .from("posts")
            .update({ stage: "approved", scheduled_at: null })
            .eq("id", postId)
            .eq("brand_id", data.brandId);
          throw new Error(
            `Falha ao agendar ${d.channel}: ${frameErr}`,
          );
        }
        enqueueResults.push({ channel: d.channel, format: d.format, ok: true });
      }

      return {
        ok: true,
        postId,
        scheduled: validatedScheduleTargets.length,
        results: enqueueResults,
      };
    }

    // ---- Publicar agora: dispara Meta para cada destino suportado ----
    if (data.action === "publish") {
      const { MetaPublishingService, formatPublishError } = await import(
        "@/lib/meta/publishing.server"
      );
      const svc = new MetaPublishingService();
      // Vínculo canal ↔ cliente (client_social_accounts) = fonte de verdade.
      const { data: pubLinks, error: pubLinksErr } = await supabase
        .from("client_social_accounts")
        .select("connection_id")
        .eq("brand_id", data.brandId)
        .eq("client_id", data.clientId);
      if (pubLinksErr) throw new Error(pubLinksErr.message);
      const publishLinkedIds = new Set(
        ((pubLinks ?? []) as Array<{ connection_id: string }>).map((l) => l.connection_id),
      );
      const results: Array<{ channel: string; format: string; ok: boolean; error?: string; permalink?: string | null }> = [];
      for (const d of data.destinations) {
        // Publicação direta: Feed IG/FB e Stories no IG (multi-frame automático).
        const supported =
          (d.format === "feed" &&
            (d.channel === "instagram" || d.channel === "facebook")) ||
          (d.format === "stories" && d.channel === "instagram");
        if (!supported) {
          results.push({ channel: d.channel, format: d.format, ok: false, error: "Formato ainda não publicável (Feed IG/FB ou Stories IG)" });
          continue;
        }
        const isStory = d.format === "stories";
        // Valor persistido em social_posts.placement (CHECK constraint) e enviado
        // ao provider como identificador de superfície.
        const providerPlacement: "instagram_feed" | "facebook_feed" | "instagram_story" =
          isStory
            ? "instagram_story"
            : d.channel === "instagram"
              ? "instagram_feed"
              : "facebook_feed";
        const dbPlacement: "feed" | "story" = isStory ? "story" : "feed";
        try {
          // Carrega conexão do workspace (a marca é a dona do canal)
          const { data: conn, error: connErr } = await supabase
            .from("social_connections")
            .select(
              "id, brand_id, provider, external_id, account_id, access_token_ciphertext, status",
            )
            .eq("id", d.connectionId)
            .eq("brand_id", data.brandId)
            .maybeSingle();
          if (connErr) throw new Error(connErr.message);
          if (!conn) throw new Error("Conexão não encontrada");
          if (!conn.access_token_ciphertext) throw new Error("Conexão sem token — reconecte a página");
          if (!publishLinkedIds.has(d.connectionId)) {
            throw new Error("Canal não vinculado a este cliente");
          }


          // Stories multi-frame: publica cada mídia como um Story separado.
          // Feed/Reels: 1 chamada, primeira mídia.
          const frames = isStory && data.mediaPaths.length > 0
            ? data.mediaPaths
            : [data.mediaPaths[0] as string | undefined];

          const caption = isStory
            ? undefined
            : [
                data.copy,
                ...(data.hashtags.length
                  ? [data.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")]
                  : []),
              ]
                .filter(Boolean)
                .join("\n\n")
                .trim() || undefined;

          let lastPermalink: string | null = null;
          for (const path of frames) {
            // Resolve mídia por frame (signed URL curta).
            const mediaOut: { imageUrl?: string; videoUrl?: string; link?: string } = {};
            if (!isStory && data.linkUrl) mediaOut.link = data.linkUrl;
            if (path) {
              if (!path.startsWith(`${data.brandId}/`)) throw new Error("Mídia fora do escopo da marca");
              const { data: signed, error: sErr } = await supabase.storage
                .from("brand-media")
                .createSignedUrl(path, 3600);
              if (sErr) throw new Error(`Falha ao assinar mídia: ${sErr.message}`);
              if (/\.(mp4|mov|m4v|webm|3gp)$/i.test(path)) mediaOut.videoUrl = signed.signedUrl;
              else mediaOut.imageUrl = signed.signedUrl;
            }
            if (providerPlacement === "instagram_feed" && !mediaOut.imageUrl) {
              throw new Error("Feed do Instagram exige uma imagem");
            }
            if (providerPlacement === "instagram_story" && !mediaOut.imageUrl && !mediaOut.videoUrl) {
              throw new Error("Stories exige imagem ou vídeo");
            }

            // Registro de auditoria em social_posts (1 por frame)
            const { data: sp, error: spErr } = await supabase
              .from("social_posts")
              .insert({
                brand_id: data.brandId,
                client_id: data.clientId,
                connection_id: d.connectionId,
                provider: conn.provider,
                placement: dbPlacement,
                caption: caption ?? null,
                hashtags: isStory ? [] : data.hashtags,
                mentions: [],
                media: path
                  ? { storagePath: path, ...(!isStory && data.linkUrl ? { link: data.linkUrl } : {}) }
                  : (!isStory && data.linkUrl ? { link: data.linkUrl } : {}),
                post_id: postId,
                status: "publishing",
                created_by: context.userId,
                location_id: isStory ? null : data.locationId ?? null,
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
              lastPermalink = result.externalPermalink;
            } catch (err) {
              const msg = formatPublishError(err);
              await supabase
                .from("social_posts")
                .update({ status: "failed", last_error: msg })
                .eq("id", sp.id);
              throw new Error(msg);
            }
          }
          results.push({ channel: d.channel, format: d.format, ok: true, permalink: lastPermalink });
        } catch (err) {
          results.push({ channel: d.channel, format: d.format, ok: false, error: (err as Error).message });
        }
      }
      const okCount = results.filter((r) => r.ok).length;
      if (okCount > 0) {
        const nowIso = new Date().toISOString();
        // `stage_id` não é tocado aqui de propósito: os pipelines não têm coluna
        // "published" e o trigger `posts_sync_legacy_stage` só reage a stage_id.
        await supabase
          .from("posts")
          .update({ stage: "published", published_at: nowIso } as any)
          .eq("id", postId)
          .eq("brand_id", data.brandId);

        // Placements dos destinos publicados com sucesso viram histórico
        // (o calendário lê status/published_at do placement).
        const okFormats = results.filter((r) => r.ok).map((r) => r.format);
        if (okFormats.length) {
          await supabase
            .from("post_placements")
            .update({ status: "published", published_at: nowIso } as never)
            .eq("post_id", postId)
            .in("format", okFormats);
        }
        const failFormats = results.filter((r) => !r.ok).map((r) => r.format);
        if (failFormats.length) {
          await supabase
            .from("post_placements")
            .update({ status: "failed" } as never)
            .eq("post_id", postId)
            .in("format", failFormats);
        }
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

// ============================================================
// deleteApprovedPostFn — remove post aprovado aguardando agendamento
// ============================================================

export const deleteApprovedPostFn = createServerFn({ method: "POST" })
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
    const { data: row, error: rErr } = await context.supabase
      .from("posts")
      .select("id, stage")
      .eq("id", data.postId)
      .eq("brand_id", data.brandId)
      .maybeSingle();
    if (rErr) throw new Error(rErr.message);
    if (!row) throw new Error("Post não encontrado ou sem permissão.");
    // Bloqueia exclusão quando há publicações em andamento ou já publicadas.
    const { data: spRows, error: spErr } = await context.supabase
      .from("social_posts")
      .select("id, status")
      .eq("post_id", data.postId);
    if (spErr) throw new Error(spErr.message);
    const blocking = (spRows ?? []).filter(
      (r) => r.status && r.status !== "scheduled",
    );
    if (blocking.length > 0) {
      throw new Error(
        "Não é possível excluir: já existem publicações em andamento ou publicadas.",
      );
    }
    // Ordem: social_posts (scheduled) → placements → posts
    await context.supabase
      .from("social_posts")
      .delete()
      .eq("post_id", data.postId);
    await context.supabase
      .from("post_placements")
      .delete()
      .eq("post_id", data.postId);
    const { error } = await context.supabase
      .from("posts")
      .delete()
      .eq("id", data.postId)
      .eq("brand_id", data.brandId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
