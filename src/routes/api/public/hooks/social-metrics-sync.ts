import { createFileRoute } from "@tanstack/react-router";

// Cron endpoint: sincroniza roll-up de social_posts como eventos do Brain.
// Chamado por pg_cron 1×/dia; gate por apikey (SUPABASE_PUBLISHABLE_KEY).
export const Route = createFileRoute("/api/public/hooks/social-metrics-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("apikey") ?? "";
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
        if (!expected || apiKey !== expected) {
          return new Response("unauthorized", { status: 401 });
        }
        const { runSocialMetricsSync } = await import(
          "@/lib/brain/social-metrics-sync.server"
        );
        try {
          const report = await runSocialMetricsSync();
          return Response.json({ ok: true, report });
        } catch (err) {
          console.error("[social-metrics-sync] failed", err);
          return Response.json(
            { ok: false, error: err instanceof Error ? err.message : String(err) },
            { status: 500 },
          );
        }
      },
    },
  },
});