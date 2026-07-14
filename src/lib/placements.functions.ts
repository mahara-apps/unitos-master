import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const PLACEMENT_FORMATS = ["feed", "stories", "reels", "carrossel"] as const;
export type PlacementFormat = (typeof PLACEMENT_FORMATS)[number];

// Business rule: which combos may coexist on the same card.
// Feed and Reels both occupy the main grid; Feed and Carrossel occupy the same slot.
const INVALID_PAIRS: Array<[PlacementFormat, PlacementFormat]> = [
  ["feed", "reels"],
  ["feed", "carrossel"],
  ["reels", "carrossel"],
];

export function validatePlacementSet(formats: PlacementFormat[]): string | null {
  const set = new Set(formats);
  for (const [a, b] of INVALID_PAIRS) {
    if (set.has(a) && set.has(b)) {
      return `Combinação inválida: ${a.toUpperCase()} + ${b.toUpperCase()} ocupam o mesmo espaço de publicação.`;
    }
  }
  return null;
}

export type Placement = {
  id: string;
  post_id: string;
  brand_id: string;
  client_id: string;
  format: PlacementFormat;
  scheduled_at: string | null;
  copy_override: Record<string, unknown> | null;
  media: Array<{ path: string; type?: string; name?: string }>;
  status: "draft" | "scheduled" | "published" | "failed";
  published_at: string | null;
  is_primary: boolean;
  external_ref: string | null;
};

const PlacementInput = z.object({
  format: z.enum(PLACEMENT_FORMATS),
  scheduled_at: z.string().nullable().optional(),
  copy_override: z.record(z.string(), z.any()).nullable().optional(),
  media: z
    .array(z.object({ path: z.string(), type: z.string().optional(), name: z.string().optional() }))
    .optional(),
  is_primary: z.boolean().optional(),
});

export const listPlacementsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ postId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<Placement[]> => {
    const { data: rows, error } = await context.supabase
      .from("post_placements")
      .select("id,post_id,brand_id,client_id,format,scheduled_at,copy_override,media,status,published_at,is_primary,external_ref")
      .eq("post_id", data.postId)
      .order("is_primary", { ascending: false })
      .order("scheduled_at", { ascending: true });
    if (error) throw error;
    return (rows ?? []) as Placement[];
  });

/**
 * Full replace of placement set for a post.
 * - Deletes placements whose format is no longer in the input list.
 * - Upserts each placement by (post_id, format).
 * - Ensures exactly one is_primary.
 * - Auto-syncs `posts.format` and `posts.scheduled_at` to the primary placement.
 */
export const savePlacementsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        postId: z.string().uuid(),
        placements: z.array(PlacementInput).min(1).max(4),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const formats = data.placements.map((p) => p.format);
    if (new Set(formats).size !== formats.length) {
      throw new Error("Cada formato só pode aparecer uma vez por card.");
    }
    const invalid = validatePlacementSet(formats);
    if (invalid) throw new Error(invalid);

    const { data: post, error: pe } = await context.supabase
      .from("posts")
      .select("id, brand_id, client_id")
      .eq("id", data.postId)
      .single();
    if (pe || !post) throw pe ?? new Error("post_not_found");

    // Ensure exactly one primary. If none flagged, first item becomes primary.
    const primaryCount = data.placements.filter((p) => p.is_primary).length;
    if (primaryCount > 1) throw new Error("Apenas um placement pode ser primário.");
    const primaryFormat: PlacementFormat = (
      primaryCount === 1 ? data.placements.find((p) => p.is_primary)!.format : data.placements[0].format
    );

    // Delete removed placements
    await context.supabase
      .from("post_placements")
      .delete()
      .eq("post_id", data.postId)
      .not("format", "in", `(${formats.map((f) => `"${f}"`).join(",")})`);

    // Upsert each placement
    const rows = data.placements.map((p) => ({
      post_id: data.postId,
      brand_id: post.brand_id,
      client_id: post.client_id,
      format: p.format,
      scheduled_at: p.scheduled_at ?? null,
      copy_override: p.copy_override ?? null,
      media: p.media ?? [],
      is_primary: p.format === primaryFormat,
      status: p.scheduled_at ? "scheduled" : "draft",
    }));
    const { error: upErr } = await context.supabase
      .from("post_placements")
      .upsert(rows, { onConflict: "post_id,format" });
    if (upErr) throw upErr;

    // Sync primary format/date back to posts row for compat with legacy views
    const primary = data.placements.find((p) => p.format === primaryFormat)!;
    const displayFormat = { feed: "Feed", stories: "Story", reels: "Reels", carrossel: "Carrossel" }[primaryFormat];
    await context.supabase
      .from("posts")
      .update({ format: displayFormat, scheduled_at: primary.scheduled_at ?? null } as never)
      .eq("id", data.postId);

    return { ok: true };
  });

export const deletePlacementFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ placementId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    // Prevent deleting the last placement of a post
    const { data: row, error } = await context.supabase
      .from("post_placements")
      .select("id, post_id, is_primary")
      .eq("id", data.placementId)
      .single();
    if (error || !row) throw error ?? new Error("placement_not_found");
    const { count } = await context.supabase
      .from("post_placements")
      .select("id", { count: "exact", head: true })
      .eq("post_id", row.post_id);
    if ((count ?? 0) <= 1) throw new Error("Não é possível remover o último placement do card.");

    await context.supabase.from("post_placements").delete().eq("id", data.placementId);

    // If we removed the primary, promote another
    if (row.is_primary) {
      const { data: remaining } = await context.supabase
        .from("post_placements")
        .select("id, format, scheduled_at")
        .eq("post_id", row.post_id)
        .order("created_at", { ascending: true })
        .limit(1);
      if (remaining && remaining[0]) {
        await context.supabase
          .from("post_placements")
          .update({ is_primary: true })
          .eq("id", remaining[0].id);
      }
    }
    return { ok: true };
  });