import { createFileRoute } from "@tanstack/react-router";
import { guardClientScope } from "@/lib/http-scope.server";
import { waitUntil } from "@/lib/wait-until.server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { CopilotInputSchema, runCopilotJob } from "@/lib/copilot-job.server";

function buildUserClient(token: string) {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  return createClient<Database>(url, key, {
    global: { headers: { Authorization: `Bearer ${token}`, apikey: key } },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

export const Route = createFileRoute("/api/jobs/copilot")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        if (!auth.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401 });
        const token = auth.slice(7);
        if (token.split(".").length !== 3) return new Response("Unauthorized", { status: 401 });

        const rawBody = await request.json().catch(() => null);
        const parse = CopilotInputSchema.safeParse(rawBody);
        if (!parse.success)
          return new Response(JSON.stringify(parse.error.format()), { status: 400 });
        const input = parse.data;

        const supabase = buildUserClient(token);
        const { data: claims } = await supabase.auth.getClaims(token);
        const userId = claims?.claims?.sub;
        if (!userId) return new Response("Unauthorized", { status: 401 });

        // Fase 2: nunca confiar no `clientId` do corpo — valida escopo antes
        // de qualquer trabalho com configuração administrativa de IA.
        const denied = await guardClientScope(supabase, userId, input.clientId);
        if (denied) return denied;

        const title = input.briefing.split("\n")[0].slice(0, 80) || "AI Draft";
        const { data: job, error: jobErr } = await supabase
          .from("ai_jobs")
          .insert({
            brand_id: input.brandId,
            client_id: input.clientId,
            user_id: userId,
            kind: "copilot_draft",
            title,
            subtitle: `${input.contentType} · ${input.channels.join(", ")}`,
            status: "queued",
            progress: 0,
            input: input as unknown as Database["public"]["Tables"]["ai_jobs"]["Insert"]["input"],
          })
          .select("id")
          .single();
        if (jobErr || !job)
          return new Response(jobErr?.message ?? "Failed to enqueue", { status: 500 });

        // Run in background — do NOT await. Cloudflare Workers keep the handler
        // alive until the promise settles even after the response is sent.
        waitUntil(runCopilotJob({ jobId: job.id, userId, input, supabase }));

        return new Response(JSON.stringify({ jobId: job.id }), {
          status: 202,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
