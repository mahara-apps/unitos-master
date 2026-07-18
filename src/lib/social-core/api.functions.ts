/**
 * Social Core — API pública client-callable.
 *
 * Toda a plataforma consome o Social Core através destas server functions.
 * Nenhum componente de UI chama providers, `SocialAnalyticsService` ou
 * server functions específicas de uma rede. Cada chamada carrega apenas
 * `brandId + channel`; a conta ativa é resolvida server-side.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { SOCIAL_CHANNELS } from "./capabilities";

const Channel = z.enum(SOCIAL_CHANNELS);
const BrandChannel = z.object({
  brandId: z.string().uuid(),
  channel: Channel,
});
const Range = z.object({
  since: z.string(),
  until: z.string(),
});

function tokenFromRequest(): string {
  const auth = getRequestHeader("authorization") ?? "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : "";
}

// -------------------- Lifecycle --------------------

export const socialCoreConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    BrandChannel.extend({ returnUrl: z.string().url().optional() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { connect } = await import("./core.server");
    return connect({
      brandId: data.brandId,
      channel: data.channel,
      userId: context.userId,
      returnUrl: data.returnUrl,
    });
  });

export const socialCoreDisconnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => BrandChannel.parse(i))
  .handler(async ({ data, context }) => {
    const { disconnect } = await import("./core.server");
    return disconnect(context.supabase, data, tokenFromRequest());
  });

export const socialCoreRefreshToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => BrandChannel.parse(i))
  .handler(async ({ data, context }) => {
    const { refreshToken } = await import("./core.server");
    const info = await refreshToken(context.supabase, data, tokenFromRequest());
    // Nunca expor o token ao cliente
    const { accessToken: _t, ...safe } = info;
    return safe;
  });

// -------------------- Publishing --------------------

const PublishInput = BrandChannel.extend({
  placement: z.enum(["feed", "story", "reel"]),
  caption: z.string().max(2200).optional(),
  hashtags: z.array(z.string()).default([]),
  mentions: z.array(z.string()).default([]),
  media: z.object({
    imageUrl: z.string().url().optional(),
    videoUrl: z.string().url().optional(),
    link: z.string().url().optional(),
  }),
});

export const socialCorePublish = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => PublishInput.parse(i))
  .handler(async ({ data, context }) => {
    const { publish } = await import("./core.server");
    const r = await publish(context.supabase, data, tokenFromRequest());
    return {
      network: r.network,
      externalPostId: r.externalPostId,
      externalPermalink: r.externalPermalink,
    };
  });

export const socialCoreSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    PublishInput.extend({
      scheduledAt: z
        .string()
        .datetime()
        .refine((v) => new Date(v).getTime() > Date.now() + 30_000, {
          message: "scheduledAt deve estar pelo menos 30s no futuro",
        }),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { schedule } = await import("./core.server");
    const r = await schedule(context.supabase, data, tokenFromRequest());
    return { network: r.network, scheduledAt: r.scheduledAt, reference: r.reference };
  });

// -------------------- Read --------------------

export const socialCoreGetDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    BrandChannel.extend({ range: Range, period: z.string().optional() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { getDashboard } = await import("./core.server");
    return getDashboard(context.supabase, data, tokenFromRequest());
  });

export const socialCoreGetPosts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    BrandChannel.extend({ limit: z.number().int().min(1).max(100).optional() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { getPosts } = await import("./core.server");
    return getPosts(context.supabase, data, tokenFromRequest());
  });

export const socialCoreGetPost = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    BrandChannel.extend({ postId: z.string().min(1) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { getPost } = await import("./core.server");
    return getPost(context.supabase, data, tokenFromRequest());
  });

export const socialCoreGetTopPosts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    BrandChannel.extend({
      limit: z.number().int().min(1).max(50).optional(),
      sortBy: z.string().optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { getTopPosts } = await import("./core.server");
    return getTopPosts(context.supabase, data, tokenFromRequest());
  });

export const socialCoreGetAudience = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    BrandChannel.extend({ range: Range }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { getAudience } = await import("./core.server");
    return getAudience(context.supabase, data, tokenFromRequest());
  });

export const socialCoreGetProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => BrandChannel.parse(i))
  .handler(async ({ data, context }) => {
    const { getProfile } = await import("./core.server");
    return getProfile(context.supabase, data, tokenFromRequest());
  });

// -------------------- Introspection --------------------

export const socialCoreListChannels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ brandId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { listChannels } = await import("./core.server");
    return listChannels(context.supabase, data.brandId);
  });

export const socialCoreCapabilities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ channel: Channel }).parse(i))
  .handler(async ({ data }) => {
    const { capabilities } = await import("./core.server");
    return capabilities(data.channel);
  });