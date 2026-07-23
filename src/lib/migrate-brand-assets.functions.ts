import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * One-off migration: copia todos os objetos referenciados por posts.reference_media
 * do bucket `brand-assets` para `brand-media` preservando o path, e atualiza o
 * JSON de reference_media para apontar para o novo bucket. Idempotente.
 */
export const migrateBrandAssetsToBrandMediaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Guard: apenas usuários autenticados. (Chamada manual pelo dev.)
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: posts, error } = await supabaseAdmin
      .from("posts")
      .select("id, reference_media")
      .not("reference_media", "is", null);
    if (error) throw error;

    let copied = 0;
    let skipped = 0;
    let missing = 0;
    const errors: Array<{ path: string; error: string }> = [];
    const updates: Array<{ id: string; reference_media: unknown }> = [];

    for (const p of posts ?? []) {
      const refs = Array.isArray(p.reference_media)
        ? (p.reference_media as Array<Record<string, unknown>>)
        : [];
      if (refs.length === 0) continue;

      let changed = false;
      const nextRefs = [] as Array<Record<string, unknown>>;
      for (const r of refs) {
        const bucket = typeof r?.bucket === "string" ? (r.bucket as string) : "brand-assets";
        const path = typeof r?.path === "string" ? (r.path as string) : null;
        const thumb = typeof r?.thumb_path === "string" ? (r.thumb_path as string) : null;
        if (!path || bucket !== "brand-assets") {
          nextRefs.push(r);
          continue;
        }

        for (const target of [path, thumb].filter(Boolean) as string[]) {
          // Skip if já existe no destino
          const { data: existsList } = await supabaseAdmin.storage
            .from("brand-media")
            .list(target.split("/").slice(0, -1).join("/"), {
              search: target.split("/").pop() ?? "",
              limit: 1,
            });
          if (existsList && existsList.length > 0) {
            skipped++;
            continue;
          }
          const { data: blob, error: dlErr } = await supabaseAdmin.storage
            .from("brand-assets")
            .download(target);
          if (dlErr || !blob) {
            missing++;
            errors.push({ path: target, error: dlErr?.message ?? "not found" });
            continue;
          }
          const { error: upErr } = await supabaseAdmin.storage
            .from("brand-media")
            .upload(target, blob, {
              contentType: (blob as Blob).type || undefined,
              upsert: false,
            });
          if (upErr) {
            errors.push({ path: target, error: upErr.message });
            continue;
          }
          copied++;
        }

        nextRefs.push({ ...r, bucket: "brand-media" });
        changed = true;
      }

      if (changed) {
        updates.push({ id: p.id as string, reference_media: nextRefs });
      }
    }

    for (const u of updates) {
      await supabaseAdmin
        .from("posts")
        .update({ reference_media: u.reference_media } as never)
        .eq("id", u.id);
    }

    return {
      posts_updated: updates.length,
      objects_copied: copied,
      objects_skipped_existing: skipped,
      objects_missing_in_source: missing,
      errors,
    };
  });
