import { createFileRoute } from "@tanstack/react-router";
import { runAiModelHealthCheck } from "@/lib/ai-model-health.server";

/**
 * Daily health check: pings each provider's models (per role) with the
 * most-recent active brand key, auto-promotes successors for deprecated
 * models and notifies the super admins in-app.
 */
export const Route = createFileRoute("/api/public/hooks/ai-models-health")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // O projeto expõe a chave publicável em SUPABASE_PUBLISHABLE_KEY;
        // SUPABASE_ANON_KEY é mantida por compatibilidade.
        const expected = [
          process.env["SUPABASE_PUBLISHABLE_KEY"],
          process.env["SUPABASE_ANON_KEY"],
        ].filter((v): v is string => !!v);
        const apikey = request.headers.get("apikey");
        if (!apikey || !expected.includes(apikey)) {
          return new Response("Unauthorized", { status: 401 });
        }


        try {
          const result = await runAiModelHealthCheck();
          return Response.json(result);
        } catch (err) {
          console.error("[ai-models-health] falhou", err);
          return Response.json(
            { error: err instanceof Error ? err.message : String(err) },
            { status: 500 },
          );
        }
      },
    },
  },
});
