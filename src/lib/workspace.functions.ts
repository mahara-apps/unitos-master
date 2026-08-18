import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertBrandAdmin, assertClientScope } from "@/lib/access-guard";
import { computeBriefingCompletion } from "@/lib/briefing-progress";
import type { BrandHubData } from "@/lib/brand-hub.functions";

/** Lista brands em que o usuário é membro. */
export const listMyBrands = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: memberships, error: memErr } = await supabase
      .from("brand_members")
      .select("brand_id, role")
      .eq("user_id", userId);
    if (memErr) throw memErr;
    const ids = (memberships ?? []).map((m) => m.brand_id);
    if (ids.length === 0) return [] as Array<{ id: string; name: string; slug: string; color: string | null; role: string }>;
    const { data: brands, error } = await supabase
      .from("brands")
      .select("id, name, slug, color")
      .in("id", ids)
      .order("name");
    if (error) throw error;
    return (brands ?? []).map((b) => ({
      ...b,
      role: memberships!.find((m) => m.brand_id === b.id)?.role ?? "editor",
    }));
  });

const CreateBrandInput = z.object({
  name: z.string().trim().min(2).max(80),
  color: z.string().optional(),
});

export const createBrand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CreateBrandInput.parse(input))
  .handler(async ({ data, context }) => {
    const id = crypto.randomUUID();
    const slugBase = data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const slug = `${slugBase}-${Math.random().toString(36).slice(2, 6)}`;
    const color = data.color ?? "#8b5cf6";
    const { error } = await context.supabase
      .from("brands")
      .insert({
        id,
        name: data.name,
        slug,
        color,
        created_by: context.userId,
      });
    if (error) throw error;
    return { id, name: data.name, slug, color, created_by: context.userId };
  });

export const listClients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ brandId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: clients, error } = await context.supabase
      .from("clients")
      .select("id, name, legal_name, cnpj, description, niche, color, logo_url, contact_name, contact_email, contact_phone, website, address, tone_of_voice, palette, socials, is_active, owner_user_id, created_at, updated_at, brand_hub")
      .eq("brand_id", data.brandId)
      .is("archived_at", null)
      .order("name");
    if (error) throw error;
    const list = clients ?? [];
    if (list.length === 0) return [];
    // `clients.brand_hub` é a fonte canônica do briefing; brand_briefings só
    // entra como fallback de compatibilidade (clientes antigos).
    const { data: briefings } = await context.supabase
      .from("brand_briefings")
      .select("client_id")
      .eq("brand_id", data.brandId)
      .in("client_id", list.map((c) => c.id));
    const withLegacyBriefing = new Set((briefings ?? []).map((b) => b.client_id));
    return list.map((c) => {
      const { brand_hub, ...rest } = c as typeof c & { brand_hub?: unknown };
      const completion = computeBriefingCompletion(
        (brand_hub ?? {}) as BrandHubData,
        { tone_of_voice: rest.tone_of_voice ?? null },
      );
      return {
        ...rest,
        has_briefing: completion > 0 || withLegacyBriefing.has(c.id),
        briefing_completion: completion,
      };
    });
  });

const CreateClientInput = z.object({
  brandId: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  legal_name: z.string().max(200).optional(),
  cnpj: z.string().max(24).optional(),
  description: z.string().max(2000).optional(),
  niche: z.string().max(120).optional(),
  color: z.string().optional(),
  logo_url: z.string().url().max(500).optional().or(z.literal("")),
  website: z.string().max(300).optional().or(z.literal("")),
  tone_of_voice: z.string().max(120).optional(),
  contact_name: z.string().max(120).optional(),
  contact_email: z.string().email().max(200).optional().or(z.literal("")),
  contact_phone: z.string().max(40).optional(),
  is_active: z.boolean().optional(),
  owner_user_id: z.string().uuid().nullable().optional(),
  socials: z
    .object({
      instagram: z.string().max(120).optional(),
      tiktok: z.string().max(120).optional(),
      youtube: z.string().max(200).optional(),
      linkedin: z.string().max(200).optional(),
      notes: z.string().max(2000).optional(),
    })
    .partial()
    .optional(),
});

export const createClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CreateClientInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertBrandAdmin(context.supabase, context.userId, data.brandId);
    const { data: client, error } = await context.supabase
      .from("clients")
      .insert({
        brand_id: data.brandId,
        name: data.name,
        legal_name: data.legal_name?.trim() || null,
        cnpj: data.cnpj?.trim() || null,
        description: data.description?.trim() || null,
        niche: data.niche ?? null,
        color: data.color ?? "#6366f1",
        logo_url: data.logo_url ? data.logo_url : null,
        website: data.website ? data.website : null,
        tone_of_voice: data.tone_of_voice ?? null,
        contact_name: data.contact_name ?? null,
        contact_email: data.contact_email ? data.contact_email : null,
        contact_phone: data.contact_phone?.trim() || null,
        is_active: data.is_active ?? true,
        owner_user_id: data.owner_user_id ?? null,
        socials: (data.socials ?? null) as never,
      })

      .select()
      .single();
    if (error) throw error;
    return client;
  });

/**
 * Upload de logo do cliente para o bucket privado `brand-assets`, gerando
 * uma URL assinada de longa duração que pode ser usada como `logo_url` no
 * registro do cliente. Usado pelo drawer unificado de criação rápida.
 */
const UploadCustomerLogoInput = z.object({
  brandId: z.string().uuid(),
  filename: z.string().min(1).max(200),
  contentType: z
    .string()
    .refine((v) => ["image/png", "image/jpeg", "image/jpg", "image/svg+xml", "image/webp"].includes(v.toLowerCase()), "Formato não suportado"),
  base64: z.string().min(1),
});

export const uploadCustomerLogo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UploadCustomerLogoInput.parse(input))
  .handler(async ({ data, context }) => {
    const bin = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
    if (bin.byteLength > 5 * 1024 * 1024) throw new Error("Arquivo maior que 5MB");
    const safe = data.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${data.brandId}/clients/logos/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${safe}`;
    const { error: ue } = await context.supabase.storage
      .from("brand-assets")
      .upload(path, bin, { contentType: data.contentType, upsert: false });
    if (ue) throw ue;
    const { data: signed, error: se } = await context.supabase.storage
      .from("brand-assets")
      .createSignedUrl(path, 60 * 60 * 24 * 365 * 10); // ~10 anos
    if (se || !signed?.signedUrl) throw se ?? new Error("Falha ao gerar URL");
    return { path, url: signed.signedUrl };
  });

const UpdateClientInput = z.object({
  brandId: z.string().uuid(),
  clientId: z.string().uuid(),
  patch: z.object({
    name: z.string().trim().min(2).max(120).optional(),
    legal_name: z.string().max(200).nullable().optional(),
    cnpj: z.string().max(24).nullable().optional(),
    description: z.string().max(2000).nullable().optional(),
    niche: z.string().max(120).nullable().optional(),
    logo_url: z.string().max(500).nullable().optional().or(z.literal("")),
    color: z.string().nullable().optional(),
    tone_of_voice: z.string().max(120).nullable().optional(),
    contact_name: z.string().max(120).nullable().optional(),
    contact_email: z.string().email().max(200).nullable().optional().or(z.literal("")),
    contact_phone: z.string().max(40).nullable().optional(),
    website: z.string().max(300).nullable().optional().or(z.literal("")),
    address: z.string().max(500).nullable().optional(),
    is_active: z.boolean().optional(),
    owner_user_id: z.string().uuid().nullable().optional(),
    socials: z
      .object({
        instagram: z.string().max(120).optional(),
        tiktok: z.string().max(120).optional(),
        youtube: z.string().max(200).optional(),
        linkedin: z.string().max(200).optional(),
        facebook: z.string().max(200).optional(),
        phone: z.string().max(40).optional(),
        notes: z.string().max(2000).optional(),
      })
      .partial()
      .nullable()
      .optional(),
  }),
});

export const updateClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdateClientInput.parse(input))
  .handler(async ({ data, context }) => {
    // Escopo: o cliente precisa estar no escopo do usuário (mesma regra da RLS).
    await assertClientScope(context.supabase, context.userId, data.clientId);
    // Autoridade: dados básicos (nome/contato/socials) exigem ADMIN/MANAGER.
    const basicKeys = new Set(["contact_name", "contact_email", "socials", "name"]);
    const patchesBasic = Object.keys(data.patch).some((k) => basicKeys.has(k));
    if (patchesBasic) {
      await assertBrandAdmin(context.supabase, context.userId, data.brandId);
    }

    const patch = { ...data.patch } as Record<string, unknown>;
    if (patch.contact_email === "") patch.contact_email = null;
    if (patch.website === "") patch.website = null;
    if (patch.logo_url === "") patch.logo_url = null;
    const { error } = await context.supabase
      .from("clients")
      .update(patch as never)
      .eq("id", data.clientId)
      .eq("brand_id", data.brandId);
    if (error) throw error;
    return { ok: true };
  });

const DeleteClientInput = z.object({
  brandId: z.string().uuid(),
  clientId: z.string().uuid(),
});

export const deleteClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DeleteClientInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertBrandAdmin(context.supabase, context.userId, data.brandId);
    const { error } = await context.supabase
      .from("clients")
      .delete()
      .eq("id", data.clientId)
      .eq("brand_id", data.brandId);
    if (error) throw error;
    return { ok: true };
  });

const SeedInput = z.object({ brandId: z.string().uuid() });

/* --------------------------- Brand company data --------------------------- */

const BrandCompanySchema = z.object({
  brandId: z.string().uuid(),
  cpf: z.string().trim().max(20).nullable().optional(),
  cnpj: z.string().trim().max(20).nullable().optional(),
  nome_fantasia: z.string().trim().max(160).nullable().optional(),
  razao_social: z.string().trim().max(200).nullable().optional(),
  cep: z.string().trim().max(12).nullable().optional(),
  rua: z.string().trim().max(200).nullable().optional(),
  numero: z.string().trim().max(20).nullable().optional(),
  complemento: z.string().trim().max(120).nullable().optional(),
  bairro: z.string().trim().max(120).nullable().optional(),
  cidade: z.string().trim().max(120).nullable().optional(),
  estado: z.string().trim().max(2).nullable().optional(),
});

export const getBrandCompany = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ brandId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("brands")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select("id, name, cpf, cnpj, nome_fantasia, razao_social, cep, rua, numero, complemento, bairro, cidade, estado" as any)
      .eq("id", data.brandId)
      .maybeSingle();
    if (error) throw error;
    return (row ?? null) as null | {
      id: string; name: string;
      cpf: string | null; cnpj: string | null;
      nome_fantasia: string | null; razao_social: string | null;
      cep: string | null; rua: string | null; numero: string | null;
      complemento: string | null; bairro: string | null; cidade: string | null; estado: string | null;
    };
  });

export const updateBrandCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => BrandCompanySchema.parse(input))
  .handler(async ({ data, context }) => {
    // Somente owner/manager podem alterar dados da empresa.
    const { data: mem } = await context.supabase
      .from("brand_members")
      .select("role")
      .eq("brand_id", data.brandId)
      .eq("user_id", context.userId)
      .maybeSingle();
    const role = (mem?.role ?? "").toLowerCase();
    if (role !== "owner" && role !== "manager") {
      throw new Error("Apenas administradores podem editar os dados da empresa.");
    }
    const { brandId, ...patch } = data;
    const { error } = await context.supabase
      .from("brands")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update(patch as any)
      .eq("id", brandId);
    if (error) throw error;
    return { ok: true };
  });

/** Cria conjunto de dados de exemplo para uma brand vazia. Idempotente por marca. */
export const seedDemoData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SeedInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { count } = await supabase
      .from("clients")
      .select("id", { count: "exact", head: true })
      .eq("brand_id", data.brandId);
    if ((count ?? 0) > 0) return { seeded: false };

    const clients = [
      { name: "Café Aurora", niche: "F&B", color: "#f59e0b" },
      { name: "Studio Nova", niche: "Design", color: "#8b5cf6" },
      { name: "Verde Fit", niche: "Fitness", color: "#10b981" },
    ];
    const { data: inserted, error } = await supabase
      .from("clients")
      .insert(clients.map((c) => ({ ...c, brand_id: data.brandId })))
      .select();
    if (error) throw error;

    const now = Date.now();
    const day = 86400000;
    const tasks = inserted!.flatMap((c, i) => [
      {
        brand_id: data.brandId,
        client_id: c.id,
        title: `Aprovar copy — ${c.name}`,
        status: "review" as const,
        priority: "high" as const,
        assignee_id: userId,
        due_at: new Date(now - day * (i + 1)).toISOString(),
        created_by: userId,
      },
      {
        brand_id: data.brandId,
        client_id: c.id,
        title: `Gravar reels — ${c.name}`,
        status: "in_progress" as const,
        priority: "medium" as const,
        assignee_id: userId,
        due_at: new Date(now + day * (i + 2)).toISOString(),
        created_by: userId,
      },
      {
        brand_id: data.brandId,
        client_id: c.id,
        title: `Planejar mês — ${c.name}`,
        status: "todo" as const,
        priority: "low" as const,
        due_at: new Date(now + day * (i + 5)).toISOString(),
        created_by: userId,
      },
    ]);
    await supabase.from("tasks").insert(tasks);

    const stages = ["idea", "production", "review", "approved", "scheduled", "published"] as const;
    const posts = inserted!.flatMap((c, ci) =>
      stages.map((stage, si) => ({
        brand_id: data.brandId,
        client_id: c.id,
        title: `Post ${stage} — ${c.name}`,
        copy: `Rascunho ${stage} para ${c.name}.`,
        channels: ["instagram", "tiktok"] as ("instagram" | "tiktok")[],
        stage,
        scheduled_at:
          stage === "scheduled" ? new Date(now + day * (ci + si + 1)).toISOString() : null,
        published_at:
          stage === "published" ? new Date(now - day * (ci * 2 + si)).toISOString() : null,
        created_by: userId,
      })),
    );
    await supabase.from("posts").insert(posts);

    return { seeded: true };
  });