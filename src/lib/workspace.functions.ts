import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const slugBase = data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const slug = `${slugBase}-${Math.random().toString(36).slice(2, 6)}`;
    const { data: brand, error } = await supabaseAdmin
      .from("brands")
      .insert({
        name: data.name,
        slug,
        color: data.color ?? "#8b5cf6",
        created_by: context.userId,
      })
      .select()
      .single();
    if (error) throw error;
    return brand;
  });

export const listClients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ brandId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: clients, error } = await context.supabase
      .from("clients")
      .select("id, name, niche, color, contact_name, contact_email, contact_phone, tone_of_voice, palette, socials")
      .eq("brand_id", data.brandId)
      .is("archived_at", null)
      .order("name");
    if (error) throw error;
    return clients ?? [];
  });

const CreateClientInput = z.object({
  brandId: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  niche: z.string().max(120).optional(),
  color: z.string().optional(),
});

export const createClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CreateClientInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: client, error } = await context.supabase
      .from("clients")
      .insert({
        brand_id: data.brandId,
        name: data.name,
        niche: data.niche ?? null,
        color: data.color ?? "#6366f1",
      })
      .select()
      .single();
    if (error) throw error;
    return client;
  });

const SeedInput = z.object({ brandId: z.string().uuid() });

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