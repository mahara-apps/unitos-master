import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Feature flags por marca — controle central de módulos vendáveis (Brain,
 * Chat, Mídia Paga, Blog). Escritas restritas a super admins (validado no
 * servidor além da RLS).
 */

export const listFeatureCatalog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("feature_catalog")
      .select("id, key, name, description, category, icon, is_core, created_at")
      .order("is_core", { ascending: false })
      .order("name");
    if (error) throw error;
    return data ?? [];
  });

const BrandIdInput = z.object({ brandId: z.string().uuid() });

export const listBrandFeatures = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => BrandIdInput.parse(i))
  .handler(async ({ data, context }) => {
    const { data: catalog, error: catErr } = await context.supabase
      .from("feature_catalog")
      .select("key, name, description, category, icon, is_core");
    if (catErr) throw catErr;

    const { data: rows, error } = await context.supabase
      .from("brand_features")
      .select("id, brand_id, feature_key, enabled, enabled_at, enabled_by, notes, updated_at")
      .eq("brand_id", data.brandId);
    if (error) throw error;

    const byKey = new Map((rows ?? []).map((r) => [r.feature_key, r]));
    return (catalog ?? []).map((c) => {
      const row = byKey.get(c.key);
      return {
        key: c.key,
        name: c.name,
        description: c.description,
        category: c.category,
        icon: c.icon,
        is_core: c.is_core,
        enabled: c.is_core ? true : (row?.enabled ?? false),
        enabled_at: row?.enabled_at ?? null,
        enabled_by: row?.enabled_by ?? null,
        notes: row?.notes ?? null,
      };
    });
  });

const SetFeatureInput = z.object({
  brandId: z.string().uuid(),
  featureKey: z.string().min(1).max(64),
  enabled: z.boolean(),
  notes: z.string().max(500).optional().nullable(),
});

async function assertSuperAdmin(supabase: {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
}, userId: string) {
  const { data, error } = await supabase.rpc("is_super_admin", { _user_id: userId });
  if (error) throw error;
  if (!data) throw new Error("Forbidden: super admin required");
}

export const setBrandFeature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => SetFeatureInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase as never, context.userId);
    const now = new Date().toISOString();
    const { error } = await context.supabase
      .from("brand_features")
      .upsert(
        {
          brand_id: data.brandId,
          feature_key: data.featureKey,
          enabled: data.enabled,
          enabled_at: data.enabled ? now : null,
          enabled_by: data.enabled ? context.userId : null,
          notes: data.notes ?? null,
          updated_at: now,
        },
        { onConflict: "brand_id,feature_key" },
      );
    if (error) throw error;
    return { ok: true };
  });

export const listBrandsWithFeatureCounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.supabase as never, context.userId);
    const { data: brands, error } = await context.supabase
      .from("brands")
      .select("id, name, slug, color")
      .order("name");
    if (error) throw error;
    const list = brands ?? [];
    if (list.length === 0) return [];
    const { data: feats, error: fErr } = await context.supabase
      .from("brand_features")
      .select("brand_id, enabled")
      .eq("enabled", true);
    if (fErr) throw fErr;
    const counts = new Map<string, number>();
    for (const f of feats ?? []) counts.set(f.brand_id, (counts.get(f.brand_id) ?? 0) + 1);
    return list.map((b) => ({ ...b, active_features: counts.get(b.id) ?? 0 }));
  });

const RequireInput = z.object({
  brandId: z.string().uuid().nullable().optional(),
  featureKey: z.string().min(1).max(64),
});

/**
 * Bloqueio server-side de acesso a módulos.
 * - Super admin: sempre `enabled: true`.
 * - Sem brandId: `enabled: false` (rota redireciona).
 * - Sem linha em brand_features: `enabled: false` (nunca liberado por default).
 * - Features `is_core=true` sempre habilitadas.
 */
export const requireFeatureAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => RequireInput.parse(i))
  .handler(async ({ data, context }) => {
    const { data: isSuper } = await context.supabase.rpc("is_super_admin", {
      _user_id: context.userId,
    });
    if (isSuper) return { enabled: true, reason: "super_admin" as const };

    if (!data.brandId) return { enabled: false, reason: "no_brand" as const };

    const { data: cat } = await context.supabase
      .from("feature_catalog")
      .select("is_core")
      .eq("key", data.featureKey)
      .maybeSingle();
    if (cat?.is_core) return { enabled: true, reason: "core" as const };

    const { data: row, error } = await context.supabase
      .from("brand_features")
      .select("enabled")
      .eq("brand_id", data.brandId)
      .eq("feature_key", data.featureKey)
      .maybeSingle();
    if (error) throw error;
    return { enabled: !!row?.enabled, reason: row?.enabled ? "granted" : "denied" as const };
  });

export const amISuperAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("is_super_admin", {
      _user_id: context.userId,
    });
    if (error) throw error;
    return { isSuperAdmin: !!data };
  });
