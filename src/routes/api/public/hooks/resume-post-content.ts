import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * Retoma a geração de conteúdo de peças pendentes (idea / copy_failed*) e
 * libera travas órfãs em `copy_running`. Endpoint de operação/cron: exige a
 * chave publicável no header `apikey`, igual aos demais hooks.
 */
const BodySchema = z.object({
  brandId: z.string().uuid().nullable().optional(),
  clientId: z.string().uuid().nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
  limit: z.number().int().min(1).max(25).optional(),
});

export const Route = createFileRoute("/api/public/hooks/resume-post-content")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("apikey") ?? "";
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
        if (!expected || apiKey !== expected) {
          return new Response("unauthorized", { status: 401 });
        }

        let raw: unknown = {};
        try {
          raw = await request.json();
        } catch {
          raw = {};
        }
        const parsed = BodySchema.safeParse(raw ?? {});
        if (!parsed.success) {
          return Response.json({ error: "invalid_body" }, { status: 400 });
        }

        const { resumePendingPostContent } = await import("@/lib/post-agents.server");
        const result = await resumePendingPostContent({
          brandId: parsed.data.brandId ?? null,
          clientId: parsed.data.clientId ?? null,
          projectId: parsed.data.projectId ?? null,
          limit: parsed.data.limit ?? 3,
          userId: null,
        });
        return Response.json(result);
      },
    },
  },
});
