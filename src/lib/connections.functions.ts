import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BrandIdInput = z.object({ brandId: z.string().uuid() });

export type ProviderConfig = {
  connected: boolean;
  masked?: string;
  updatedAt?: string;
  /** Resultado do último teste real contra o provedor. */
  verified?: "valid" | "invalid" | "unverified";
  verifiedAt?: string;
  verifyMessage?: string;
};


export type ChannelConfig = {
  connected: boolean;
  handle?: string;
  updatedAt?: string;
};

export type ConnectionsSettings = {
  brandId: string;
  monthlyBudgetUsd: number;
  textProvider: "openai" | "anthropic" | "gemini";
  imageProvider: "openai" | "gemini";
  providers: Record<string, ProviderConfig>;
  channels: Record<string, ChannelConfig>;
  usage: {
    monthUsd: number;
    monthTokens: number;
    totalCalls: number;
    successCalls: number;
  };
};

function maskKey(key: string): string {
  if (!key) return "";
  const trimmed = key.trim();
  if (trimmed.length <= 8) return "•".repeat(trimmed.length);
  return `${trimmed.slice(0, 4)}${"•".repeat(Math.max(4, trimmed.length - 8))}${trimmed.slice(-4)}`;
}

export const getConnections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => BrandIdInput.parse(input))
  .handler(async ({ data, context }): Promise<ConnectionsSettings> => {
    const { supabase } = context;
    const { data: row } = await supabase
      .from("brand_connections")
      .select("*")
      .eq("brand_id", data.brandId)
      .maybeSingle();

    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const { data: usage } = await supabase
      .from("brand_ai_usage")
      .select("cost_usd, input_tokens, output_tokens, success")
      .eq("brand_id", data.brandId)
      .gte("created_at", monthStart.toISOString());

    const monthUsd = (usage ?? []).reduce((a, u) => a + Number(u.cost_usd ?? 0), 0);
    const monthTokens = (usage ?? []).reduce(
      (a, u) => a + Number(u.input_tokens ?? 0) + Number(u.output_tokens ?? 0),
      0,
    );
    const totalCalls = usage?.length ?? 0;
    const successCalls = (usage ?? []).filter((u) => u.success).length;

    return {
      brandId: data.brandId,
      monthlyBudgetUsd: row ? Number(row.monthly_budget_usd) : 500,
      textProvider: (row?.text_provider as ConnectionsSettings["textProvider"]) ?? "openai",
      imageProvider:
        row?.image_provider === "openai" ? "openai" : "gemini",
      providers: (row?.providers as Record<string, ProviderConfig>) ?? {},
      channels: (row?.channels as Record<string, ChannelConfig>) ?? {},
      usage: { monthUsd, monthTokens, totalCalls, successCalls },
    };
  });

const UpsertInput = z.object({
  brandId: z.string().uuid(),
  monthlyBudgetUsd: z.number().min(0).max(1_000_000).optional(),
  textProvider: z.enum(["openai", "anthropic", "gemini"]).optional(),
  // Anthropic não gera imagem — não pode ser selecionada como provedor de imagem.
  imageProvider: z.enum(["openai", "gemini"]).optional(),
});

export const updateConnectionsSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpsertInput.parse(input))
  .handler(async ({ data, context }) => {
    const patch = {
      brand_id: data.brandId,
      ...(data.monthlyBudgetUsd !== undefined ? { monthly_budget_usd: data.monthlyBudgetUsd } : {}),
      ...(data.textProvider ? { text_provider: data.textProvider } : {}),
      ...(data.imageProvider ? { image_provider: data.imageProvider } : {}),
    };

    const { error } = await context.supabase
      .from("brand_connections")
      .upsert(patch, { onConflict: "brand_id" });
    if (error) throw error;
    return { ok: true };
  });

const ProviderKeyInput = z.object({
  brandId: z.string().uuid(),
  provider: z.enum(["openai", "anthropic", "gemini"]),
  apiKey: z.string().trim().min(8).max(400),
});

export const saveProviderKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ProviderKeyInput.parse(input))
  .handler(async ({ data, context }) => {
    const { encryptCredential, maskCredential } = await import(
      "./credentials-crypto.server"
    );
    const ciphertext = await encryptCredential(data.apiKey);
    const masked = maskCredential(data.apiKey);

    // Persist the encrypted secret in brand_api_credentials (server-only read).
    const { error: credErr } = await context.supabase
      .from("brand_api_credentials")
      .upsert(
        {
          brand_id: data.brandId,
          provider: data.provider,
          ciphertext,
          masked,
          updated_by: context.userId,
        },
        { onConflict: "brand_id,provider" },
      );
    if (credErr) throw credErr;

    const { data: existing } = await context.supabase
      .from("brand_connections")
      .select("providers")
      .eq("brand_id", data.brandId)
      .maybeSingle();
    const providers = ((existing?.providers as Record<string, ProviderConfig>) ?? {}) as Record<
      string,
      ProviderConfig
    >;
    providers[data.provider] = {
      connected: true,
      masked,
      updatedAt: new Date().toISOString(),
    };
    const { error } = await context.supabase
      .from("brand_connections")
      .upsert(
        { brand_id: data.brandId, providers },
        { onConflict: "brand_id" },
      );
    if (error) throw error;
    return { ok: true, masked: providers[data.provider].masked };
  });

const RemoveProviderInput = z.object({
  brandId: z.string().uuid(),
  provider: z.enum(["openai", "anthropic", "gemini"]),
});

export const removeProviderKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RemoveProviderInput.parse(input))
  .handler(async ({ data, context }) => {
    await context.supabase
      .from("brand_api_credentials")
      .delete()
      .eq("brand_id", data.brandId)
      .eq("provider", data.provider);

    const { data: existing } = await context.supabase
      .from("brand_connections")
      .select("providers")
      .eq("brand_id", data.brandId)
      .maybeSingle();
    const providers = ((existing?.providers as Record<string, ProviderConfig>) ?? {}) as Record<
      string,
      ProviderConfig
    >;
    delete providers[data.provider];
    const { error } = await context.supabase
      .from("brand_connections")
      .upsert(
        { brand_id: data.brandId, providers },
        { onConflict: "brand_id" },
      );
    if (error) throw error;
    return { ok: true };
  });

const ChannelInput = z.object({
  brandId: z.string().uuid(),
  channel: z.enum([
    "instagram",
    "facebook",
    "tiktok",
    "youtube",
    "linkedin",
    "twitter",
    "threads",
    "meta",
    "resend",
    "whatsapp_evolution",
    "whatsapp_cloud",
  ]),
  handle: z.string().trim().min(1).max(200).optional(),
  connected: z.boolean(),
});

export const upsertChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ChannelInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: existing } = await context.supabase
      .from("brand_connections")
      .select("channels")
      .eq("brand_id", data.brandId)
      .maybeSingle();
    const channels = ((existing?.channels as Record<string, ChannelConfig>) ?? {}) as Record<
      string,
      ChannelConfig
    >;
    if (data.connected) {
      channels[data.channel] = {
        connected: true,
        handle: data.handle,
        updatedAt: new Date().toISOString(),
      };
    } else {
      delete channels[data.channel];
    }
    const { error } = await context.supabase
      .from("brand_connections")
      .upsert(
        { brand_id: data.brandId, channels },
        { onConflict: "brand_id" },
      );
    if (error) throw error;
    return { ok: true };
  });

// -----------------------------------------------------------------------------
// Tool credentials (Resend, WhatsApp Evolution, WhatsApp Cloud, …)
// Uses the same AES-256-GCM store; metadata carries non-secret fields.
// -----------------------------------------------------------------------------

const ToolProvider = z.enum([
  "resend",
  "whatsapp_evolution",
  "whatsapp_cloud",
]);

const SaveToolCredentialInput = z.object({
  brandId: z.string().uuid(),
  provider: ToolProvider,
  apiKey: z.string().trim().min(4).max(800),
  metadata: z.record(z.string().max(400)).optional(),
});

export const saveToolCredential = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SaveToolCredentialInput.parse(input))
  .handler(async ({ data, context }) => {
    const { encryptCredential, maskCredential } = await import(
      "./credentials-crypto.server"
    );
    const ciphertext = await encryptCredential(data.apiKey);
    const masked = maskCredential(data.apiKey);

    const { error: credErr } = await context.supabase
      .from("brand_api_credentials")
      .upsert(
        {
          brand_id: data.brandId,
          provider: data.provider,
          ciphertext,
          masked,
          metadata: data.metadata ?? {},
          updated_by: context.userId,
        },
        { onConflict: "brand_id,provider" },
      );
    if (credErr) throw credErr;

    // Mirror connection status in brand_connections.channels for the UI.
    const { data: existing } = await context.supabase
      .from("brand_connections")
      .select("channels")
      .eq("brand_id", data.brandId)
      .maybeSingle();
    const channels = ((existing?.channels as Record<string, ChannelConfig>) ?? {}) as Record<
      string,
      ChannelConfig
    >;
    channels[data.provider] = {
      connected: true,
      handle: data.metadata?.handle ?? masked,
      updatedAt: new Date().toISOString(),
    };
    const { error } = await context.supabase
      .from("brand_connections")
      .upsert(
        { brand_id: data.brandId, channels },
        { onConflict: "brand_id" },
      );
    if (error) throw error;
    return { ok: true, masked };
  });

const RemoveToolInput = z.object({
  brandId: z.string().uuid(),
  provider: ToolProvider,
});

export const removeToolCredential = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RemoveToolInput.parse(input))
  .handler(async ({ data, context }) => {
    await context.supabase
      .from("brand_api_credentials")
      .delete()
      .eq("brand_id", data.brandId)
      .eq("provider", data.provider);

    const { data: existing } = await context.supabase
      .from("brand_connections")
      .select("channels")
      .eq("brand_id", data.brandId)
      .maybeSingle();
    const channels = ((existing?.channels as Record<string, ChannelConfig>) ?? {}) as Record<
      string,
      ChannelConfig
    >;
    delete channels[data.provider];
    const { error } = await context.supabase
      .from("brand_connections")
      .upsert(
        { brand_id: data.brandId, channels },
        { onConflict: "brand_id" },
      );
    if (error) throw error;
    return { ok: true };
  });