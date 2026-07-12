import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Structured brand-memory container persisted in clients.brand_hub jsonb. */
export type BrandHubData = {
  description?: string;
  audience?: string;
  pain_points?: string;
  demographics?: string;
  tone_tags?: string[];
  palette?: Array<{ label: string; hex: string }>;
  competitors?: BrandHubCompetitor[];
};

export type BrandHubCompetitor = {
  id: string;
  handle: string;
  platform: "instagram" | "tiktok" | "youtube" | "linkedin" | "x";
  notes?: string;
  added_at: string;
  last_scraped_at?: string;
  last_metrics?: BrandHubCompetitorMetrics | null;
  last_error?: string | null;
};

export type BrandHubCompetitorMetrics = {
  followers?: number;
  posts_count?: number;
  avg_likes?: number;
  avg_comments?: number;
  engagement_rate?: number;
  top_posts?: Array<{ url?: string; caption?: string; likes?: number; comments?: number }>;
  recurring_hooks?: string[];
};

const Scope = z.object({
  brandId: z.string().uuid(),
  clientId: z.string().uuid(),
});

export type BrandHubClient = {
  id: string;
  name: string;
  niche: string | null;
  color: string | null;
  logo_url: string | null;
  logo_secondary_url: string | null;
  favicon_url: string | null;
  tone_of_voice: string | null;
  brand_hub: BrandHubData;
};

export const getBrandHub = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Scope.parse(i))
  .handler(async ({ data, context }): Promise<BrandHubClient> => {
    const { data: row, error } = await context.supabase
      .from("clients")
      .select(
        "id, name, niche, color, logo_url, logo_secondary_url, favicon_url, tone_of_voice, brand_hub" as never,
      )
      .eq("id", data.clientId)
      .eq("brand_id", data.brandId)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new Error("client_not_found");
    const r = row as unknown as BrandHubClient & { brand_hub: BrandHubData | null };
    return { ...r, brand_hub: r.brand_hub ?? {} };
  });

const HubPatch = Scope.extend({
  patch: z
    .object({
      description: z.string().max(5000).optional(),
      audience: z.string().max(2000).optional(),
      pain_points: z.string().max(2000).optional(),
      demographics: z.string().max(1000).optional(),
      tone_tags: z.array(z.string().max(40)).max(20).optional(),
      palette: z
        .array(
          z.object({
            label: z.string().max(40),
            hex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
          }),
        )
        .max(24)
        .optional(),
    })
    .partial(),
});

export const updateBrandHub = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => HubPatch.parse(i))
  .handler(async ({ data, context }) => {
    const { data: current } = await context.supabase
      .from("clients")
      .select("brand_hub" as never)
      .eq("id", data.clientId)
      .eq("brand_id", data.brandId)
      .maybeSingle();
    const prev = ((current as { brand_hub?: BrandHubData } | null)?.brand_hub ?? {}) as BrandHubData;
    const next = { ...prev, ...data.patch } as BrandHubData;
    const { error } = await context.supabase
      .from("clients")
      .update({ brand_hub: next } as never)
      .eq("id", data.clientId)
      .eq("brand_id", data.brandId);
    if (error) throw error;
    return { ok: true, brand_hub: next };
  });

const VisualsPatch = Scope.extend({
  patch: z
    .object({
      logo_url: z.string().url().nullable().optional(),
      logo_secondary_url: z.string().url().nullable().optional(),
      favicon_url: z.string().url().nullable().optional(),
    })
    .partial(),
});

export const updateBrandVisuals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => VisualsPatch.parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("clients")
      .update(data.patch as never)
      .eq("id", data.clientId)
      .eq("brand_id", data.brandId);
    if (error) throw error;
    return { ok: true };
  });

/** Uploads an asset (logo/favicon) to the brand-assets bucket and returns a signed URL. */
const AssetUpload = Scope.extend({
  kind: z.enum(["logo", "logo_secondary", "favicon"]),
  filename: z.string().max(200),
  contentType: z.string().max(120),
  base64: z.string().min(1),
});

export const uploadBrandAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => AssetUpload.parse(i))
  .handler(async ({ data, context }) => {
    const bin = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
    if (bin.byteLength > 5 * 1024 * 1024) throw new Error("asset_too_large");
    const safeName = data.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${data.brandId}/${data.clientId}/${data.kind}-${Date.now()}-${safeName}`;
    const { error } = await context.supabase.storage
      .from("brand-assets")
      .upload(path, bin, { contentType: data.contentType, upsert: true });
    if (error) throw error;
    const { data: signed, error: se } = await context.supabase.storage
      .from("brand-assets")
      .createSignedUrl(path, 60 * 60 * 24 * 365);
    if (se) throw se;
    const column =
      data.kind === "logo" ? "logo_url" : data.kind === "favicon" ? "favicon_url" : "logo_secondary_url";
    const { error: ue } = await context.supabase
      .from("clients")
      .update({ [column]: signed.signedUrl } as never)
      .eq("id", data.clientId)
      .eq("brand_id", data.brandId);
    if (ue) throw ue;
    return { url: signed.signedUrl, path };
  });

/* -------------------- Documents (knowledge base) -------------------- */

export type ClientDocument = {
  id: string;
  name: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
};

export const listClientDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Scope.parse(i))
  .handler(async ({ data, context }): Promise<ClientDocument[]> => {
    const { data: rows, error } = await (context.supabase as never as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (k: string, v: string) => {
            eq: (k: string, v: string) => {
              order: (c: string, o: { ascending: boolean }) => Promise<{ data: ClientDocument[] | null; error: unknown }>;
            };
          };
        };
      };
    })
      .from("client_documents")
      .select("id, name, storage_path, mime_type, size_bytes, created_at")
      .eq("brand_id", data.brandId)
      .eq("client_id", data.clientId)
      .order("created_at", { ascending: false });
    if (error) throw error as Error;
    return rows ?? [];
  });

const DocUpload = Scope.extend({
  filename: z.string().max(200),
  contentType: z.string().max(120),
  sizeBytes: z.number().int().nonnegative(),
  base64: z.string().min(1),
});

export const uploadClientDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => DocUpload.parse(i))
  .handler(async ({ data, context }) => {
    if (data.sizeBytes > 25 * 1024 * 1024) throw new Error("document_too_large");
    const bin = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
    const safe = data.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${data.brandId}/${data.clientId}/${Date.now()}-${safe}`;
    const { error: ue } = await context.supabase.storage
      .from("brand-documents")
      .upload(path, bin, { contentType: data.contentType, upsert: false });
    if (ue) throw ue;
    const { data: inserted, error } = await (context.supabase as never as {
      from: (t: string) => {
        insert: (v: Record<string, unknown>) => {
          select: (c: string) => { single: () => Promise<{ data: ClientDocument | null; error: unknown }> };
        };
      };
    })
      .from("client_documents")
      .insert({
        brand_id: data.brandId,
        client_id: data.clientId,
        name: data.filename,
        storage_path: path,
        mime_type: data.contentType,
        size_bytes: data.sizeBytes,
        uploaded_by: context.userId,
      })
      .select("id, name, storage_path, mime_type, size_bytes, created_at")
      .single();
    if (error) throw error as Error;
    return inserted!;
  });

const DocDelete = Scope.extend({ documentId: z.string().uuid() });

export const deleteClientDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => DocDelete.parse(i))
  .handler(async ({ data, context }) => {
    const { data: row, error: qe } = await (context.supabase as never as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (k: string, v: string) => {
            eq: (k: string, v: string) => {
              eq: (k: string, v: string) => {
                maybeSingle: () => Promise<{ data: { storage_path: string } | null; error: unknown }>;
              };
            };
          };
        };
      };
    })
      .from("client_documents")
      .select("storage_path")
      .eq("id", data.documentId)
      .eq("brand_id", data.brandId)
      .eq("client_id", data.clientId)
      .maybeSingle();
    if (qe) throw qe as Error;
    if (!row) throw new Error("document_not_found");
    await context.supabase.storage.from("brand-documents").remove([row.storage_path]);
    const { error } = await (context.supabase as never as {
      from: (t: string) => {
        delete: () => {
          eq: (k: string, v: string) => {
            eq: (k: string, v: string) => Promise<{ error: unknown }>;
          };
        };
      };
    })
      .from("client_documents")
      .delete()
      .eq("id", data.documentId)
      .eq("brand_id", data.brandId);
    if (error) throw error as Error;
    return { ok: true };
  });

export const signClientDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Scope.extend({ documentId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: row } = await (context.supabase as never as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (k: string, v: string) => {
            eq: (k: string, v: string) => {
              eq: (k: string, v: string) => {
                maybeSingle: () => Promise<{ data: { storage_path: string } | null }>;
              };
            };
          };
        };
      };
    })
      .from("client_documents")
      .select("storage_path")
      .eq("id", data.documentId)
      .eq("brand_id", data.brandId)
      .eq("client_id", data.clientId)
      .maybeSingle();
    if (!row) throw new Error("document_not_found");
    const { data: signed, error } = await context.supabase.storage
      .from("brand-documents")
      .createSignedUrl(row.storage_path, 60 * 5);
    if (error) throw error;
    return { url: signed.signedUrl };
  });