import { createFileRoute } from "@tanstack/react-router";

// Cron endpoint: sintetiza feedbacks de rework em insights consolidados.
// Chamado por pg_cron 1×/dia; gate por apikey (SUPABASE_PUBLISHABLE_KEY).
export const Route = createFileRoute("/api/public/hooks/brain-synthesis")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("apikey") ?? "";
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
        if (!expected || apiKey !== expected) {
          return new Response("unauthorized", { status: 401 });
        }
        const { runBrainSynthesis } = await import(
          "@/lib/brain/learning/synthesize.server"
        );
        try {
          const report = await runBrainSynthesis();
          return Response.json({ ok: true, report });
        } catch (err) {
          console.error("[brain-synthesis] failed", err);
          return Response.json(
            { ok: false, error: err instanceof Error ? err.message : String(err) },
            { status: 500 },
          );
        }
      },
    },
  },
});