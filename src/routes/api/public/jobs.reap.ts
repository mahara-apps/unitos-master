import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

// Watchdog: marca como failed qualquer ai_jobs preso em queued/running por
// mais de 5 min. Chamado por pg_cron a cada 2 min. Autentica via apikey
// (publishable key da Supabase) e usa service_role para escrever.
export const Route = createFileRoute("/api/public/jobs/reap")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey") ?? "";
        if (apikey !== process.env.SUPABASE_PUBLISHABLE_KEY) {
          return new Response("Unauthorized", { status: 401 });
        }
        const admin = createClient<Database>(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { auth: { persistSession: false, autoRefreshToken: false } },
        );
        const cutoff = new Date(Date.now() - 5 * 60_000).toISOString();
        const { data, error } = await admin
          .from("ai_jobs")
          .update({
            status: "failed",
            error: "timeout: worker interrompido antes da conclusão",
            finished_at: new Date().toISOString(),
            step_label: null,
          })
          .in("status", ["queued", "running"])
          .lt("updated_at", cutoff)
          .select("id");
        if (error) return new Response(error.message, { status: 500 });
        return Response.json({ reaped: data?.length ?? 0 });
      },
    },
  },
});