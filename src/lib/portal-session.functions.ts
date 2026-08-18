import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizePortalTheme, resolvePortalTheme } from "@/lib/portal-theme";
import { fillPortalCovers, signPortalDocument, signPortalRefs } from "@/lib/portal-media.server";
import type { PortalApproval, PortalBrand, PortalClient, PortalPost } from "@/lib/portal-public.functions";

/**
 * Fase B — portal do cliente no modo LOGIN.
 *
 * As mesmas RPCs `public.portal_*` do modo token, agora chamadas sem `_token`:
 * o banco resolve cliente/marca por `auth.uid()` via `client_members`
 * (`role = 'portal_client'`). Contrato de retorno idêntico ao modo token, para
 * que os componentes do portal sirvam às duas árvores de rota.
 *
 * Blindagem: todas as RPCs aceitam `_client_id` opcional. O banco valida o
 * vínculo (`client_not_allowed` quando o usuário não é portal_client daquele
 * cliente), então um cliente/marca extra nunca é acessível por palpite de ID.
 */

type Json = Parameters<typeof normalizePortalTheme>[0];

export type PortalSessionResolve = {
  clientId: string | null;
  brandId: string | null;
  client: PortalClient | null;
  brand: PortalBrand | null;
  theme: ReturnType<typeof resolvePortalTheme> | null;
  error?: string;
};

type PortalMetrics = { pending: number; approvedThisMonth: number; scheduled: number; total: number };
type PortalFile = {
  id: string;
  name: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
};
type PortalBriefing = {
  id: string;
  token: string;
  label: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  submitted_at: string | null;
  created_at: string;
};
export type PortalClientLink = {
  client_id: string;
  brand_id: string;
  client_name: string | null;
  brand_name: string | null;
};

type Ctx = { supabase: { rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> } };

async function rpc<T>(context: Ctx, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await context.supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

/** `_client_id` opcional; null = vínculo mais recente do usuário. */
const scopeIn = z.object({ clientId: z.string().uuid().optional() });
const scope = (data?: { clientId?: string }) => ({ _client_id: data?.clientId ?? null });

/** Vínculos de portal do usuário (para escolher cliente/marca quando há mais de um). */
export const listMyPortalClientsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PortalClientLink[]> =>
    (await rpc<PortalClientLink[]>(context as unknown as Ctx, "portal_my_clients")) ?? [],
  );

export const resolvePortalSessionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => scopeIn.parse(i ?? {}))
  .handler(async ({ context, data }): Promise<PortalSessionResolve> => {
    try {
      const res = await rpc<Omit<PortalSessionResolve, "theme" | "error">>(
        context as unknown as Ctx,
        "portal_resolve",
        scope(data),
      );
      const theme = resolvePortalTheme(normalizePortalTheme((res.client?.portal_theme ?? null) as Json), {
        color: res.client?.color ?? null,
        logoUrl: null,
        agencyName: res.brand?.name ?? null,
      });
      return { ...res, theme };
    } catch (e) {
      return {
        clientId: null,
        brandId: null,
        client: null,
        brand: null,
        theme: null,
        error: e instanceof Error ? e.message : "invalid_token",
      };
    }
  });

export const getPortalSessionMetricsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => scopeIn.parse(i ?? {}))
  .handler(async ({ context, data }): Promise<PortalMetrics> =>
    rpc<PortalMetrics>(context as unknown as Ctx, "portal_metrics", scope(data)),
  );

export const listPortalSessionApprovalsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    scopeIn
      .extend({ status: z.enum(["all", "pending", "approved", "adjust"]).default("all") })
      .parse(i ?? {}),
  )
  .handler(async ({ context, data }): Promise<PortalPost[]> => {
    const rows = await rpc<PortalPost[]>(context as unknown as Ctx, "portal_approvals", {
      _status: data.status,
      ...scope(data),
    });
    await fillPortalCovers(rows ?? []);
    return rows ?? [];
  });

export const getPortalSessionPostFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => scopeIn.extend({ postId: z.string().uuid() }).parse(i))
  .handler(
    async ({ context, data }): Promise<{ post: PortalPost; approval: PortalApproval | null; media: Array<{ url: string; type: string }> }> => {
      const res = await rpc<{ post: PortalPost; approval: PortalApproval | null }>(
        context as unknown as Ctx,
        "portal_post",
        { _post_id: data.postId, ...scope(data) },
      );
      const post = res.post;
      const media = await signPortalRefs(post.reference_media);
      if (!post.cover_url && media[0]) post.cover_url = media[0].url;
      return { post, approval: res.approval, media };
    },
  );

export const decidePortalSessionApprovalFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    scopeIn
      .extend({
        postId: z.string().uuid(),
        decision: z.enum(["approved", "rejected", "adjust", "comment"]),
        note: z.string().max(4000).optional(),
      })
      .parse(i),
  )
  .handler(async ({ context, data }) =>
    rpc<{ ok: boolean }>(context as unknown as Ctx, "portal_decide", {
      _post_id: data.postId,
      _decision: data.decision,
      _note: data.note ?? null,
      ...scope(data),
    }),
  );

export const listPortalSessionCalendarFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    scopeIn.extend({ month: z.string().regex(/^\d{4}-\d{2}$/).optional() }).parse(i ?? {}),
  )
  .handler(async ({ context, data }): Promise<PortalPost[]> =>
    (await rpc<PortalPost[]>(context as unknown as Ctx, "portal_calendar", {
      _month: data.month ?? null,
      ...scope(data),
    })) ?? [],
  );

export const listPortalSessionFilesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => scopeIn.extend({ search: z.string().optional() }).parse(i ?? {}))
  .handler(async ({ context, data }): Promise<Array<PortalFile & { url: string | null }>> => {
    const docs = await rpc<PortalFile[]>(context as unknown as Ctx, "portal_files", {
      _search: (data.search ?? "").trim() || null,
      ...scope(data),
    });
    return Promise.all(
      (docs ?? []).map(async (d) => ({ ...d, url: await signPortalDocument(d.storage_path) })),
    );
  });

export const listPortalSessionBriefingsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => scopeIn.parse(i ?? {}))
  .handler(async ({ context, data }): Promise<PortalBriefing[]> =>
    (await rpc<PortalBriefing[]>(context as unknown as Ctx, "portal_briefings", scope(data))) ?? [],
  );
