import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * Canal de progresso do provisionamento/validação de uma instalação.
 *
 * Chamado pelos scripts existentes (`supabase/install/bootstrap.sh`,
 * `supabase/install/validate.sh`) rodando NA INSTALAÇÃO DE DESTINO.
 *
 * Segurança:
 *  - existe somente na instalação MASTER (fora dela responde 404);
 *  - autenticado por token de execução de uso único, comparado por hash
 *    SHA-256 — o MASTER nunca guarda o token em claro;
 *  - token expira e é invalidado ao fechar a operação;
 *  - nenhum secret é aceito/persistido: todo texto livre é sanitizado.
 */

const Body = z.object({
  token: z.string().min(32).max(200),
  step: z.string().max(40).optional(),
  state: z.enum(["pending", "running", "done", "error"]).optional(),
  detail: z.string().max(2000).nullable().optional(),
  done: z.boolean().optional(),
  ok: z.boolean().optional(),
  warnings: z.boolean().optional(),
  version: z.string().max(40).nullable().optional(),
  summary: z.string().max(2000).nullable().optional(),
  errorKind: z.string().max(60).nullable().optional(),
  checks: z
    .record(z.string(), z.enum(["ok", "attention", "error", "pending"]))
    .optional(),
});

export const Route = createFileRoute("/api/public/installations/report")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { detectMaster } = await import("@/lib/installation/manager.server");
        if (!detectMaster()) return new Response("Not found", { status: 404 });

        let body: z.infer<typeof Body>;
        try {
          body = Body.parse(await request.json());
        } catch {
          return new Response("Invalid payload", { status: 400 });
        }

        const { applyProgressReport, finalizeOperation, hashRunToken } = await import(
          "@/lib/installation/runner.server"
        );


        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const tokenHash = await hashRunToken(body.token);

        const { data: op, error } = await supabaseAdmin
          .from("installation_operations")
          .select("*")
          .eq("run_token_hash", tokenHash)
          .in("status", ["pending", "running"])
          .maybeSingle();
        if (error) return new Response("Report failed", { status: 500 });
        if (!op) return new Response("Unauthorized", { status: 401 });

        const expires = op.run_token_expires_at ? Date.parse(op.run_token_expires_at) : 0;
        if (!expires || expires < Date.now()) {
          return new Response("Token expired", { status: 401 });
        }

        if (body.done) {
          await finalizeOperation(supabaseAdmin as never, op as never, {
            ok: body.ok === true,
            warnings: body.warnings ?? false,
            version: body.version ?? null,
            summary: body.summary ?? null,
            errorKind: body.errorKind ?? null,
            checks: body.checks as never,
          });
          return Response.json({ ok: true, finished: true });
        }

        if (!body.step || !body.state) {
          return new Response("Missing step/state", { status: 400 });
        }

        const steps = await applyProgressReport(supabaseAdmin as never, op as never, {
          step: body.step,
          state: body.state,
          detail: body.detail ?? null,
        });
        return Response.json({ ok: true, steps: steps.length });
      },
    },
  },
});
