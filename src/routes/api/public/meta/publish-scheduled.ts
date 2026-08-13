import { createFileRoute } from "@tanstack/react-router";

/**
 * Drena `social_posts` agendados. pg_cron chama a cada minuto.
 *
 * Concorrência: usa `claim_scheduled_social_posts` (SECURITY DEFINER + FOR UPDATE
 * SKIP LOCKED + lock de 10min) para reservar linhas sem risco de duplicar
 * publicação quando duas execuções do cron rodam em paralelo.
 *
 * Isolamento: a RPC revalida que `social_connections.brand_id` bate com o
 * post e que `client_id` do post é compatível com o `client_id` da conexão.
 * Nunca escolher "a primeira conexão da marca" — a conexão vem do próprio
 * `social_posts.connection_id` reservado.
 *
 * Retry: sucesso -> `mark_social_post_published`; erro -> `mark_social_post_failed`
 * (incrementa `publish_attempts`, muda para `failed` após 5 tentativas).
 *
 * Auth: bypass no edge via /api/public/*; exige `apikey` = anon publishable key.
 */
export const Route = createFileRoute("/api/public/meta/publish-scheduled")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const anon = process.env.SUPABASE_PUBLISHABLE_KEY!;
        const key = request.headers.get("apikey") ?? request.headers.get("x-api-key");
        if (!key || key !== anon) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );
        const { MetaPublishingService, formatPublishError } = await import(
          "@/lib/meta/publishing.server"
        );

        // Claim atômico via RPC (FOR UPDATE SKIP LOCKED + lock de 10min).
        const { data: claimed, error: claimErr } = await (supabaseAdmin as any).rpc(
          "claim_scheduled_social_posts",
          { p_limit: 25 },
        );
        if (claimErr) {
          return Response.json({ ok: false, error: claimErr.message }, { status: 500 });
        }
        if (!claimed || claimed.length === 0) {
          return Response.json({ ok: true, processed: 0 });
        }

        const svc = new MetaPublishingService();
        const results: Array<{ id: string; ok: boolean; error?: string }> = [];

        for (const post of claimed as Array<{
          id: string;
          brand_id: string;
          client_id: string | null;
          connection_id: string;
          placement: string;
          caption: string | null;
          hashtags: string[] | null;
          mentions: string[] | null;
          media: any;
        }>) {
          try {
            const { data: conn, error: connErr } = await supabaseAdmin
              .from("social_connections")
              .select(
                "id, brand_id, client_id, provider, channel, external_id, account_id, access_token_ciphertext",
              )
              .eq("id", post.connection_id)
              .eq("brand_id", post.brand_id)
              .maybeSingle();
            if (connErr) throw new Error(connErr.message);
            if (!conn) throw new Error("Conexão removida");
            // Revalida isolamento no worker também (defesa em profundidade).
            if (post.client_id && conn.client_id && conn.client_id !== post.client_id) {
              throw new Error(
                "Conexão não pertence ao mesmo cliente do post agendado",
              );
            }

            const caption = buildCaption(
              post.caption ?? undefined,
              (post.hashtags as string[] | null) ?? [],
              (post.mentions as string[] | null) ?? [],
            );
            // Signed URL discipline: se a mídia guarda apenas o path do bucket
            // privado (`storagePath`), assinamos AGORA (TTL curto) em vez de
            // usar uma URL previamente persistida que já pode ter expirado.
            const media = await resolveMediaForPublish(
              supabaseAdmin,
              post.brand_id,
              (post.media as any) ?? {},
            );
            // Mapeamento placement (DB) → providerPlacement:
            //   feed  → instagram_feed | facebook_feed (por canal)
            //   story → instagram_story (Stories NUNCA carrega caption)
            const channel = (conn as any).channel as string | undefined;
            const providerPlacement: "instagram_feed" | "facebook_feed" | "instagram_story" =
              post.placement === "story"
                ? "instagram_story"
                : channel === "facebook"
                  ? "facebook_feed"
                  : "instagram_feed";
            const result = await svc.publish(conn as any, {
              placement: providerPlacement,
              caption: providerPlacement === "instagram_story" ? undefined : caption,
              media,
            });
            const { error: okErr } = await (supabaseAdmin as any).rpc(
              "mark_social_post_published",
              {
                p_post_id: post.id,
                p_external_id: result.externalPostId,
                p_permalink: result.externalPermalink,
              },
            );
            if (okErr) throw new Error(okErr.message);
            // provider_response é metadado — atualização direta é OK, não altera lock/retry.
            await supabaseAdmin
              .from("social_posts")
              .update({ provider_response: result.providerResponse as any })
              .eq("id", post.id);
            // Reflete a publicação na peça editorial (posts/post_placements),
            // que é o que Calendário, Projeto e Conteúdo leem.
            await syncEditorialPublished(supabaseAdmin, post.id, post.placement);
            results.push({ id: post.id, ok: true });

          } catch (err) {
            const msg = formatPublishError(err);
            await (supabaseAdmin as any).rpc("mark_social_post_failed", {
              p_post_id: post.id,
              p_error: msg,
            });
            results.push({ id: post.id, ok: false, error: msg });
          }
        }

        return Response.json({ ok: true, processed: results.length, results });
      },
    },
  },
});

function buildCaption(base?: string, hashtags: string[] = [], mentions: string[] = []): string | undefined {
  const parts: string[] = [];
  if (base) parts.push(base);
  const tags = hashtags.filter(Boolean).map((t) => (t.startsWith("#") ? t : `#${t}`));
  const ats = mentions.filter(Boolean).map((m) => (m.startsWith("@") ? m : `@${m}`));
  if (ats.length) parts.push(ats.join(" "));
  if (tags.length) parts.push(tags.join(" "));
  const out = parts.join("\n\n").trim();
  return out.length ? out : undefined;
}

/**
 * Resolve a mídia a ser enviada ao provider.
 *
 * Regra: se o post gravou `storagePath` (bucket privado `brand-media`, sob o
 * prefixo `<brand_id>/`), o worker gera uma signed URL fresca (TTL 3600s)
 * antes de chamar o Meta. Signed URLs NUNCA são persistidas no banco.
 *
 * Compat: se o post foi criado antes desta mudança e só tem `imageUrl`,
 * usamos como estava. Novos composers devem preferir `storagePath`.
 */
async function resolveMediaForPublish(
  supabaseAdmin: any,
  brandId: string,
  media: { imageUrl?: string; videoUrl?: string; storagePath?: string; link?: string },
): Promise<{ imageUrl?: string; videoUrl?: string; link?: string }> {
  const out: { imageUrl?: string; videoUrl?: string; link?: string } = {};
  if (media?.link) out.link = media.link;

  if (media?.storagePath) {
    if (!media.storagePath.startsWith(`${brandId}/`)) {
      throw new Error("storagePath fora do escopo da marca");
    }
    const { data, error } = await supabaseAdmin.storage
      .from("brand-media")
      .createSignedUrl(media.storagePath, 3600);
    if (error) throw new Error(`Falha ao assinar mídia: ${error.message}`);
    if (isVideoPath(media.storagePath)) out.videoUrl = data.signedUrl;
    else out.imageUrl = data.signedUrl;
    return out;
  }

  if (media?.videoUrl) out.videoUrl = media.videoUrl;
  if (media?.imageUrl) out.imageUrl = media.imageUrl;
  return out;
}

function isVideoPath(path: string): boolean {
  return /\.(mp4|mov|m4v|webm|3gp)$/i.test(path);
}
