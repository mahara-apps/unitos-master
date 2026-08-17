import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Publicação parcial e republicação por DESTINO.
 *
 * Regra funcional: uma peça só é `published` quando TODOS os destinos
 * publicaram (garantido no banco por `sync_post_publication_state`). Quando
 * parte falha, a peça fica em "publicação parcial" e cada destino com falha
 * pode ser reenfileirado individualmente.
 *
 * A republicação NÃO publica direto no provider: ela apenas recoloca UMA linha
 * em `social_posts` (status `scheduled`) para o worker existente
 * (`/api/public/meta/publish-scheduled`) drenar, reaproveitando claim/lock e
 * retry já implementados. Idempotência extra vem do índice único
 * `social_posts_active_dest_key (post_id, connection_id, placement)`.
 */

export type PublicationDestinationState = {
  placementId: string;
  connectionId: string | null;
  channel: string;
  accountLabel: string;
  format: string;
  /** published | failed | scheduled | publishing | draft */
  status: string;
  publishedAt: string | null;
  permalink: string | null;
  error: string | null;
  attempts: number;
  canRetry: boolean;
};

export type PublicationState = {
  postId: string;
  /** none | pending | partial | published */
  overall: "none" | "pending" | "partial" | "published";
  postStage: string | null;
  destinations: PublicationDestinationState[];
};

const familyOf = (format: string) => (format === "stories" ? "story" : "feed");

// ============================================================
// listPostPublicationStateFn
// ============================================================

export const listPostPublicationStateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({ postId: z.string().uuid(), brandId: z.string().uuid() })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<PublicationState> => {
    const supabase = context.supabase;

    const { data: post, error: pErr } = await supabase
      .from("posts")
      .select("id, stage")
      .eq("id", data.postId)
      .eq("brand_id", data.brandId)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!post) throw new Error("Peça não encontrada.");

    const { data: placements, error: plErr } = await supabase
      .from("post_placements")
      .select("id, format, status, connection_id, published_at")
      .eq("post_id", data.postId)
      .eq("brand_id", data.brandId);
    if (plErr) throw new Error(plErr.message);

    const { data: queue, error: qErr } = await supabase
      .from("social_posts")
      .select(
        "id, connection_id, placement, status, last_error, publish_attempts, published_at, external_permalink",
      )
      .eq("post_id", data.postId)
      .eq("brand_id", data.brandId);
    if (qErr) throw new Error(qErr.message);
    const rows = queue ?? [];

    const connIds = Array.from(
      new Set(
        (placements ?? [])
          .map((p) => p.connection_id as string | null)
          .filter((v): v is string => !!v),
      ),
    );
    const connMap = new Map<
      string,
      { channel: string; label: string; status: string }
    >();
    if (connIds.length) {
      const { data: conns } = await supabase
        .from("social_connections")
        .select("id, channel, external_name, account_username, status")
        .eq("brand_id", data.brandId)
        .in("id", connIds);
      for (const c of conns ?? []) {
        connMap.set(c.id as string, {
          channel: (c.channel as string) ?? "",
          label:
            (c.account_username as string | null) ??
            (c.external_name as string | null) ??
            "Conta",
          status: (c.status as string) ?? "",
        });
      }
    }

    const destinations: PublicationDestinationState[] = (placements ?? []).map(
      (pl) => {
        const connectionId = (pl.connection_id as string | null) ?? null;
        const conn = connectionId ? connMap.get(connectionId) : undefined;
        const family = familyOf(pl.format as string);
        const mine = rows.filter(
          (r) =>
            r.connection_id === connectionId &&
            familyOf((r.placement as string) === "story" ? "stories" : "feed") ===
              family,
        );
        const published = mine.find((r) => r.status === "published");
        const failed = mine.find((r) => r.status === "failed");
        const inFlight = mine.find(
          (r) => r.status === "scheduled" || r.status === "publishing",
        );
        const status = published
          ? "published"
          : inFlight
            ? (inFlight.status as string)
            : failed
              ? "failed"
              : ((pl.status as string) ?? "draft");
        return {
          placementId: pl.id as string,
          connectionId,
          channel: conn?.channel ?? "",
          accountLabel: conn?.label ?? "Conta removida",
          format: pl.format as string,
          status,
          publishedAt:
            (published?.published_at as string | null) ??
            ((pl.published_at as string | null) ?? null),
          permalink: (published?.external_permalink as string | null) ?? null,
          error: published ? null : ((failed?.last_error as string | null) ?? null),
          attempts: Number(failed?.publish_attempts ?? 0),
          canRetry:
            !published && !inFlight && (status === "failed") && !!connectionId,
        };
      },
    );

    const anyPublished = destinations.some((d) => d.status === "published");
    const allPublished =
      destinations.length > 0 && destinations.every((d) => d.status === "published");
    const overall: PublicationState["overall"] = allPublished
      ? "published"
      : anyPublished
        ? "partial"
        : destinations.length
          ? "pending"
          : "none";

    return {
      postId: data.postId,
      overall,
      postStage: (post.stage as string | null) ?? null,
      destinations,
    };
  });

// ============================================================
// retryFailedPlacementFn — reenfileira SOMENTE o destino com falha
// ============================================================

export const retryFailedPlacementFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        postId: z.string().uuid(),
        brandId: z.string().uuid(),
        placementId: z.string().uuid(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;

    // 1) Placement pertence ao post/marca e está em falha
    const { data: pl, error: plErr } = await supabase
      .from("post_placements")
      .select("id, post_id, brand_id, client_id, format, status, connection_id, media, copy_override")
      .eq("id", data.placementId)
      .eq("post_id", data.postId)
      .eq("brand_id", data.brandId)
      .maybeSingle();
    if (plErr) throw new Error(plErr.message);
    if (!pl) throw new Error("Destino não encontrado nesta peça.");
    if (!pl.connection_id) {
      throw new Error("Destino sem conta vinculada — reabra a peça e escolha a conta.");
    }
    const clientId = pl.client_id as string | null;
    const family = familyOf(pl.format as string);
    const dbPlacement: "feed" | "story" = family === "story" ? "story" : "feed";

    // 2) Não pode existir publicação bem-sucedida nem item ativo para o destino
    const { data: queue, error: qErr } = await supabase
      .from("social_posts")
      .select("id, status, placement, caption, hashtags, media, location_id, provider, publish_locked_at")
      .eq("post_id", data.postId)
      .eq("brand_id", data.brandId)
      .eq("connection_id", pl.connection_id);
    if (qErr) throw new Error(qErr.message);
    const mine = (queue ?? []).filter((r) => (r.placement as string) === dbPlacement);
    if (mine.some((r) => r.status === "published")) {
      throw new Error("Este destino já foi publicado — nada a republicar.");
    }
    if (
      mine.some(
        (r) =>
          r.status === "scheduled" ||
          r.status === "publishing" ||
          !!r.publish_locked_at,
      )
    ) {
      throw new Error("Já existe uma republicação em andamento para este destino.");
    }
    const failedRow = mine.find((r) => r.status === "failed");
    if (!failedRow && (pl.status as string) !== "failed") {
      throw new Error("Este destino não está em falha.");
    }

    // 3) Conexão ativa, do canal certo e vinculada ao cliente
    const { data: conn, error: cErr } = await supabase
      .from("social_connections")
      .select(
        "id, channel, provider, status, external_id, account_id, access_token_ciphertext",
      )
      .eq("id", pl.connection_id)
      .eq("brand_id", data.brandId)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!conn) throw new Error("Conexão não pertence a esta marca.");
    if (conn.status !== "active") {
      throw new Error("Conexão não está ativa — reconecte a conta em Canais.");
    }
    if (!conn.access_token_ciphertext) {
      throw new Error("Conexão sem token — reconecte a conta em Canais.");
    }
    if (dbPlacement === "story" && conn.channel !== "instagram") {
      throw new Error("Stories só é suportado em conexões Instagram.");
    }
    if (conn.channel === "instagram" && !conn.account_id) {
      throw new Error("Conexão sem conta Instagram Business vinculada.");
    }
    if (clientId) {
      const { data: link, error: lErr } = await supabase
        .from("client_social_accounts")
        .select("id")
        .eq("brand_id", data.brandId)
        .eq("client_id", clientId)
        .eq("connection_id", pl.connection_id)
        .maybeSingle();
      if (lErr) throw new Error(lErr.message);
      if (!link) {
        throw new Error(
          "Este canal não está mais vinculado ao cliente. Vincule em Perfil do cliente > Canais.",
        );
      }
    }

    // 4) Mídia: reaproveita exatamente a mesma da tentativa anterior
    const prevMedia = (failedRow?.media ?? null) as
      | { storagePath?: string; link?: string; imageUrl?: string; videoUrl?: string }
      | null;
    let storagePath: string | null = prevMedia?.storagePath ?? null;
    if (!storagePath) {
      const arr = Array.isArray(pl.media) ? (pl.media as Array<{ storagePath?: string }>) : [];
      storagePath = arr.find((m) => m?.storagePath)?.storagePath ?? null;
    }
    const link = prevMedia?.link ?? null;
    if (!storagePath && !link) {
      throw new Error("Sem mídia para republicar — reabra a peça e anexe a mídia.");
    }
    if (storagePath) {
      if (!storagePath.startsWith(`${data.brandId}/`)) {
        throw new Error("Mídia fora do escopo da marca.");
      }
      // Confirma que o arquivo continua acessível ANTES de gastar tentativa.
      const { data: signed, error: sErr } = await supabase.storage
        .from("brand-media")
        .createSignedUrl(storagePath, 120);
      if (sErr || !signed?.signedUrl) {
        throw new Error("Mídia indisponível no armazenamento — reanexe o arquivo.");
      }
      const head = await fetch(signed.signedUrl, { method: "HEAD" });
      if (!head.ok) {
        throw new Error("URL da mídia não está acessível — reanexe o arquivo.");
      }
    }
    if (conn.channel === "instagram" && !storagePath) {
      throw new Error("Instagram exige mídia (imagem ou vídeo).");
    }

    // 5) Pré-flight completo de capacidade (cadeia + granular scope do target).
    //    Bloqueia ANTES de reenfileirar, sem consumir tentativa do worker.
    if (conn.provider === "meta") {
      const { resolvePublishTarget } = await import(
        "@/lib/meta/publish-capability.server"
      );
      const { capability } = await resolvePublishTarget(supabase, {
        brandId: data.brandId,
        clientId: clientId ?? null,
        connectionId: pl.connection_id as string,
        channel: conn.channel as string,
        force: true,
      });
      if (!capability.publishReady) throw new Error(capability.message);
    }


    // 6) Caption/hashtags: reaproveita a tentativa anterior; senão deriva do post
    let caption: string | null = (failedRow?.caption as string | null) ?? null;
    let hashtags: string[] = ((failedRow?.hashtags as string[] | null) ?? []) as string[];
    if (!failedRow) {
      const { data: post } = await supabase
        .from("posts")
        .select("copy")
        .eq("id", data.postId)
        .maybeSingle();
      const co = (pl.copy_override ?? {}) as {
        copy?: string;
        hashtags?: string[];
      };
      hashtags = co.hashtags ?? [];
      const base = co.copy ?? (post?.copy as string | null) ?? null;
      caption =
        dbPlacement === "story"
          ? null
          : [
              base,
              hashtags.length
                ? hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")
                : null,
            ]
              .filter(Boolean)
              .join("\n\n")
              .trim() || null;
    }

    // 7) Reenfileira UMA linha (o worker existente publica com claim/lock)
    const nowIso = new Date().toISOString();
    const { error: insErr } = await supabase.from("social_posts").insert({
      brand_id: data.brandId,
      client_id: clientId,
      connection_id: pl.connection_id,
      provider: conn.provider,
      placement: dbPlacement,
      caption: dbPlacement === "story" ? null : caption,
      hashtags: dbPlacement === "story" ? [] : hashtags,
      mentions: [],
      media: {
        ...(storagePath ? { storagePath } : {}),
        ...(link && dbPlacement !== "story" ? { link } : {}),
      },
      post_id: data.postId,
      status: "scheduled",
      scheduled_at: nowIso,
      created_by: context.userId,
      location_id: (failedRow?.location_id as string | null) ?? null,
    });
    if (insErr) {
      // Índice único de destino ativo = alguém já reenfileirou (duplo clique).
      if (/duplicate key|social_posts_active_dest_key/i.test(insErr.message)) {
        throw new Error("Já existe uma republicação na fila para este destino.");
      }
      throw new Error(insErr.message);
    }

    // 8) Placement volta para "agendado" (histórico publicado nunca é tocado)
    await supabase
      .from("post_placements")
      .update({ status: "scheduled", scheduled_at: nowIso })
      .eq("id", data.placementId)
      .neq("status", "published");

    return { ok: true, queuedAt: nowIso, channel: conn.channel as string };
  });
