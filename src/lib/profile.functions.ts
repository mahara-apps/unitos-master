import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const UpdateSchema = z.object({
  full_name: z.string().trim().min(1, "Nome obrigatório").max(120),
  phone: z.string().trim().max(40).optional().nullable(),
  job_title: z.string().trim().max(120).optional().nullable(),
  bio: z.string().trim().max(600).optional().nullable(),
  timezone: z.string().trim().min(1).max(64),
  locale: z.string().trim().min(2).max(10),
  avatar_url: z.string().trim().url().max(500).optional().nullable(),
});

export type ProfileUpdateInput = z.infer<typeof UpdateSchema>;

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("user_profiles")
      .select("id, full_name, role, avatar_url, phone, job_title, bio, timezone, locale, created_at, updated_at")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw error;
    const email = (context.claims as { email?: string } | undefined)?.email ?? null;
    return {
      id: context.userId,
      email,
      full_name: (data?.full_name ?? "") as string,
      role: (data?.role ?? "member") as string,
      avatar_url: (data?.avatar_url ?? null) as string | null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      phone: ((data as any)?.phone ?? null) as string | null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      job_title: ((data as any)?.job_title ?? null) as string | null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      bio: ((data as any)?.bio ?? null) as string | null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      timezone: ((data as any)?.timezone ?? "America/Sao_Paulo") as string,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      locale: ((data as any)?.locale ?? "pt-BR") as string,
    };
  });

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const payload = {
      full_name: data.full_name,
      phone: data.phone ?? null,
      job_title: data.job_title ?? null,
      bio: data.bio ?? null,
      timezone: data.timezone,
      locale: data.locale,
      avatar_url: data.avatar_url ?? null,
    };
    const { error } = await context.supabase
      .from("user_profiles")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update(payload as any)
      .eq("id", context.userId);
    if (error) throw error;
    return { ok: true };
  });

const PasswordSchema = z.object({
  newPassword: z.string().min(8, "Mínimo 8 caracteres").max(72),
});

export const changeMyPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => PasswordSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.auth.updateUser({ password: data.newPassword });
    if (error) throw error;
    await context.supabase
      .from("user_profiles")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ requires_password_change: false } as any)
      .eq("id", context.userId);
    return { ok: true };
  });