import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const payloadSchema = z.object({
  token: z.string().min(32).max(200),
  operationId: z.string().uuid(),
});

export const Route = createFileRoute("/api/public/installations/execute")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { detectMaster } = await import("@/lib/installation/manager.server");
        if (!detectMaster()) return new Response("Not found", { status: 404 });

        const parsed = payloadSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return new Response("Invalid payload", { status: 400 });

        const { hashRunToken } = await import("@/lib/installation/runner.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { assertInstallationOperationsWritable } =
          await import("@/lib/installation/freeze.server");
        try {
          await assertInstallationOperationsWritable(supabaseAdmin as never);
        } catch {
          return new Response("Installation operations are frozen", { status: 423 });
        }
        const tokenHash = await hashRunToken(parsed.data.token);
        const { data: operation, error } = await supabaseAdmin
          .from("installation_operations")
          .select("id, run_token_expires_at, detail")
          .eq("id", parsed.data.operationId)
          .eq("run_token_hash", tokenHash)
          .in("status", ["pending", "running", "retryable"])
          .maybeSingle();
        if (error) return new Response("Execution lookup failed", { status: 500 });
        if (!operation) return new Response("Unauthorized", { status: 401 });
        const expires = operation.run_token_expires_at
          ? Date.parse(operation.run_token_expires_at)
          : 0;
        if (!expires || expires < Date.now()) return new Response("Token expired", { status: 401 });
        const detail = (operation.detail ?? {}) as Record<string, unknown>;
        if (detail["automated"] !== true) {
          return new Response("Operation is not automated", { status: 409 });
        }

        const { error: wakeError } = await supabaseAdmin
          .from("installation_operations")
          .update({ next_attempt_at: new Date().toISOString(), next_command: "execute" })
          .eq("id", operation.id);
        if (wakeError) return new Response("Execution scheduling failed", { status: 500 });
        return Response.json({ ok: true, delegated: true }, { status: 202 });
      },
    },
  },
});
