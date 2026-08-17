import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Central de Publicação — camada de leitura do Calendário.
 *
 * Agrupa PEÇAS (posts) com seus DESTINOS reais (post_placements + fila
 * social_posts). Nenhum estado novo é inventado: o status geral é derivado do
 * estado real dos destinos, exatamente como o pipeline persiste no banco.
 *
 *   rascunho → aprovação → agendado → fila → processando → publicado/parcial/falhou
 *
 * Não altera pipeline, workers ou integrações — apenas lê e transforma.
 */

export type PublicationDestination = {
  placementId: string | null;
  connectionId: string | null;
  /** instagram | facebook | ... (vazio quando o destino não tem conexão) */
  channel: string;
  accountLabel: string | null;
  format: string;
  /** draft | scheduled | publishing | published | failed | cancelled */
  status: string;
  scheduledAt: string | null;
  publishedAt: string | null;
  permalink: string | null;
  error: string | null;
  attempts: number;
  canRetry: boolean;
};

export type PublicationOverall =
  | "draft"
  | "awaiting_approval"
  | "ready"
  | "scheduled"
  | "publishing"
  | "published"
  | "partial"
  | "failed"
  | "cancelled";

export type PublicationItem = {
  postId: string;
  title: string;
  copy: string;
  coverUrl: string | null;
  brandId: string;
  clientId: string;
  pipelineId: string | null;
  stageId: string | null;
  stage: string | null;
  reviewStatus: string | null;
  /** Data efetiva na agenda: agendamento OU publicação. */
  when: string | null;
  scheduledAt: string | null;
  publishedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  overall: PublicationOverall;
  channels: string[];
  formats: string[];
  destinations: PublicationDestination[];
  publishedCount: number;
  totalDestinations: number;
  author: { id: string; name: string | null; avatar_url: string | null } | null;
};

export type PublicationBoard = {
  items: PublicationItem[];
  /** Aguardando aprovação (com ou sem data), fora da janela quando necessário. */
  awaitingApproval: PublicationItem[];
};

const familyOf = (format: string) =>
  (format ?? "").toLowerCase().includes("stor") ? "story" : "feed";

const ACTIVE_PLACEMENT_STATUS = [
  "draft",
  "scheduled",
  "publishing",
  "published",
  "failed",
];

export const listPublicationBoardFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        brandId: z.string().uuid(),
        clientId: z.string().uuid().nullable().optional(),
        from: z.string(),
        to: z.string(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<PublicationBoard> => {
    const supabase = context.supabase;
    const dateWindow = [
      `and(scheduled_at.gte.${data.from},scheduled_at.lte.${data.to})`,
      `and(published_at.gte.${data.from},published_at.lte.${data.to})`,
    ].join(",");

    // 1) Destinos com data na janela.
    let plq = supabase
      .from("post_placements")
      .select("post_id")
      .eq("brand_id", data.brandId)
      .in("status", ["scheduled", "publishing", "published", "failed"])
      .or(dateWindow);
    if (data.clientId) plq = plq.eq("client_id", data.clientId);
    const { data: windowPlacements, error: plErr } = await plq;
    if (plErr) throw new Error(plErr.message);

    // 2) Peças com data na janela (inclui publicação imediata sem scheduled_at).
    let dq = supabase
      .from("posts")
      .select("id")
      .eq("brand_id", data.brandId)
      .is("deleted_at", null)
      .in("stage", ["idea", "production", "review", "approved", "scheduled", "published"])
      .or(dateWindow);
    if (data.clientId) dq = dq.eq("client_id", data.clientId);
    const { data: windowPosts, error: dErr } = await dq;
    if (dErr) throw new Error(dErr.message);

    // 3) Peças aguardando aprovação (sempre relevantes para a operação).
    let aq = supabase
      .from("posts")
      .select("id")
      .eq("brand_id", data.brandId)
      .is("deleted_at", null)
      .eq("stage", "review")
      .order("updated_at", { ascending: false })
      .limit(30);
    if (data.clientId) aq = aq.eq("client_id", data.clientId);
    const { data: reviewPosts, error: aErr } = await aq;
    if (aErr) throw new Error(aErr.message);

    const reviewIds = new Set((reviewPosts ?? []).map((r) => r.id as string));
    const postIds = Array.from(
      new Set([
        ...(windowPlacements ?? []).map((p) => p.post_id as string),
        ...(windowPosts ?? []).map((p) => p.id as string),
        ...reviewIds,
      ]),
    );
    if (postIds.length === 0) return { items: [], awaitingApproval: [] };

    const { data: posts, error: postErr } = await supabase
      .from("posts")
      .select(
        "id,title,copy,cover_url,channels,client_id,brand_id,pipeline_id,stage_id,stage,review_status,scheduled_at,published_at,created_at,updated_at,created_by",
      )
      .in("id", postIds)
      .is("deleted_at", null);
    if (postErr) throw new Error(postErr.message);

    // 4) Todos os destinos das peças selecionadas.
    const { data: placements, error: allPlErr } = await supabase
      .from("post_placements")
      .select(
        "id,post_id,format,status,connection_id,scheduled_at,published_at,copy_override",
      )
      .in("post_id", postIds)
      .in("status", ACTIVE_PLACEMENT_STATUS);
    if (allPlErr) throw new Error(allPlErr.message);

    // 5) Fila real de publicação (erro/permalink/tentativas).
    const { data: queue, error: qErr } = await supabase
      .from("social_posts")
      .select(
        "post_id,connection_id,placement,status,last_error,publish_attempts,published_at,external_permalink,scheduled_at",
      )
      .eq("brand_id", data.brandId)
      .in("post_id", postIds);
    if (qErr) throw new Error(qErr.message);

    // 6) Contas conectadas (rótulo/canal por destino).
    const connIds = Array.from(
      new Set(
        (placements ?? [])
          .map((p) => p.connection_id as string | null)
          .filter((v): v is string => !!v),
      ),
    );
    const connMap = new Map<string, { channel: string; label: string }>();
    if (connIds.length) {
      const { data: conns } = await supabase
        .from("social_connections")
        .select("id,channel,external_name,account_username")
        .eq("brand_id", data.brandId)
        .in("id", connIds);
      for (const c of conns ?? []) {
        connMap.set(c.id as string, {
          channel: (c.channel as string) ?? "",
          label:
            (c.account_username as string | null) ??
            (c.external_name as string | null) ??
            null,
        } as { channel: string; label: string });
      }
    }

    // 7) Autores.
    const userIds = Array.from(
      new Set(
        (posts ?? [])
          .map((p) => p.created_by as string | null)
          .filter((v): v is string => !!v),
      ),
    );
    const authors = new Map<
      string,
      { id: string; name: string | null; avatar_url: string | null }
    >();
    if (userIds.length) {
      const { data: profs } = await supabase
        .from("user_profiles")
        .select("id,full_name,avatar_url")
        .in("id", userIds);
      for (const p of profs ?? []) {
        authors.set(p.id as string, {
          id: p.id as string,
          name: (p.full_name as string | null) ?? null,
          avatar_url: (p.avatar_url as string | null) ?? null,
        });
      }
    }

    const placementsByPost = new Map<string, typeof placements>();
    for (const pl of placements ?? []) {
      const key = pl.post_id as string;
      const arr = placementsByPost.get(key) ?? [];
      arr!.push(pl);
      placementsByPost.set(key, arr);
    }

    const items: PublicationItem[] = (posts ?? []).map((post) => {
      const pls = placementsByPost.get(post.id as string) ?? [];
      const rows = (queue ?? []).filter((r) => r.post_id === post.id);

      const destinations: PublicationDestination[] = (pls ?? []).map((pl) => {
        const connectionId = (pl.connection_id as string | null) ?? null;
        const conn = connectionId ? connMap.get(connectionId) : undefined;
        const co = (pl.copy_override ?? {}) as Record<string, unknown>;
        const family = familyOf(pl.format as string);
        const mine = rows.filter(
          (r) =>
            r.connection_id === connectionId &&
            ((r.placement as string) === "story" ? "story" : "feed") === family,
        );
        const published = mine.find((r) => r.status === "published");
        const inFlight = mine.find(
          (r) => r.status === "publishing" || r.status === "scheduled",
        );
        const failed = mine.find((r) => r.status === "failed");
        const status = published
          ? "published"
          : inFlight
            ? inFlight.status === "publishing"
              ? "publishing"
              : "scheduled"
            : failed
              ? "failed"
              : ((pl.status as string) ?? "draft");
        return {
          placementId: pl.id as string,
          connectionId,
          channel:
            conn?.channel ??
            (typeof co.channel === "string" ? (co.channel as string) : ""),
          accountLabel: conn?.label ?? null,
          format: pl.format as string,
          status,
          scheduledAt:
            (pl.scheduled_at as string | null) ??
            (inFlight?.scheduled_at as string | null) ??
            null,
          publishedAt:
            (published?.published_at as string | null) ??
            ((pl.published_at as string | null) ?? null),
          permalink: (published?.external_permalink as string | null) ?? null,
          error: published ? null : ((failed?.last_error as string | null) ?? null),
          attempts: Number(failed?.publish_attempts ?? 0),
          canRetry: !published && !inFlight && status === "failed" && !!connectionId,
        };
      });

      const stage = (post.stage as string | null) ?? null;
      const publishedCount = destinations.filter(
        (d) => d.status === "published",
      ).length;
      const total = destinations.length;

      let overall: PublicationOverall;
      if (total > 0 && publishedCount === total) overall = "published";
      else if (publishedCount > 0) overall = "partial";
      else if (destinations.some((d) => d.status === "publishing"))
        overall = "publishing";
      else if (destinations.some((d) => d.status === "failed")) overall = "failed";
      else if (destinations.some((d) => d.status === "scheduled"))
        overall = "scheduled";
      else if (stage === "review") overall = "awaiting_approval";
      else if (stage === "published") overall = "published";
      else if (stage === "scheduled") overall = "scheduled";
      else if (stage === "approved") overall = "ready";
      else overall = "draft";

      const when =
        destinations.find((d) => d.status === "published")?.publishedAt ??
        (post.published_at as string | null) ??
        (post.scheduled_at as string | null) ??
        destinations.map((d) => d.scheduledAt).find((v) => !!v) ??
        // Destino que falhou numa publicação imediata não tem data própria:
        // herda o último toque da peça para ficar visível no dia da tentativa.
        (total > 0 && (overall === "failed" || overall === "publishing")
          ? ((post.updated_at as string | null) ?? null)
          : null);


      const channels = Array.from(
        new Set([
          ...destinations.map((d) => d.channel).filter(Boolean),
          ...(((post.channels as string[] | null) ?? []) as string[]),
        ]),
      );

      return {
        postId: post.id as string,
        title: (post.title as string) ?? "Sem título",
        copy: (post.copy as string) ?? "",
        coverUrl: (post.cover_url as string | null) ?? null,
        brandId: post.brand_id as string,
        clientId: post.client_id as string,
        pipelineId: (post.pipeline_id as string | null) ?? null,
        stageId: (post.stage_id as string | null) ?? null,
        stage,
        reviewStatus: (post.review_status as string | null) ?? null,
        when,
        scheduledAt: (post.scheduled_at as string | null) ?? null,
        publishedAt: (post.published_at as string | null) ?? null,
        createdAt: (post.created_at as string | null) ?? null,
        updatedAt: (post.updated_at as string | null) ?? null,
        overall,
        channels,
        formats: Array.from(new Set(destinations.map((d) => d.format).filter(Boolean))),
        destinations,
        publishedCount,
        totalDestinations: total,
        author: post.created_by
          ? (authors.get(post.created_by as string) ?? null)
          : null,
      };
    });

    const inWindow = (v: string | null) =>
      !!v && v >= data.from && v <= data.to;

    return {
      items: items.filter(
        (it) =>
          inWindow(it.when) ||
          it.destinations.some(
            (d) => inWindow(d.scheduledAt) || inWindow(d.publishedAt),
          ),
      ),
      awaitingApproval: items.filter((it) => it.overall === "awaiting_approval"),
    };
  });
