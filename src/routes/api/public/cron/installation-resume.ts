import { createFileRoute } from "@tanstack/react-router";
import { assertCronRequest } from "@/lib/cron-auth.server";

/**
 * Continuação do provisionamento automático de instalações (somente MASTER).
 * Cada execução aplica a próxima fatia do baseline das operações sem
 * heartbeat, tornando o provisionamento independente da aba do navegador.
 *
 * Autenticação: `x-cron-secret` (CRON_SECRET).
 */
export const Route = createFileRoute("/api/public/cron/installation-resume")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const startedAt = Date.now();
        const denied = assertCronRequest(request);
        if (denied) return denied;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { assertInstallationOperationsWritable } =
          await import("@/lib/installation/freeze.server");
        try {
          await assertInstallationOperationsWritable(supabaseAdmin as never);
        } catch {
          return new Response(JSON.stringify({ ok: false, frozen: true }), {
            status: 423,
            headers: { "content-type": "application/json" },
          });
        }
        const { resumeStaleAutomatedProvisions } =
          await import("@/lib/installation/resume-worker.server");
        const result = await resumeStaleAutomatedProvisions();
        const durationMs = Date.now() - startedAt;
        console.info(JSON.stringify({
          event: "cron.completed",
          job: "installation-provision-resume",
          path: "/api/public/cron/installation-resume",
          durationMs,
          claimed: result.claimed,
        }));
        return new Response(JSON.stringify({ ok: true, job: "installation-provision-resume", durationMs, result }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
