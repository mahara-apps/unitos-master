/**
 * Continuação SERVER-SIDE do provisionamento automático de instalações.
 *
 * Por que existe: cada invocação do executor aplica apenas uma fatia do
 * baseline e encerra (o runtime do Worker tem vida curta). Sem um disparador
 * independente, a continuação dependeria da aba do navegador aberta. Este
 * worker é chamado pelo cron (`/api/public/cron/installation-resume`) e retoma
 * qualquer operação automatizada sem heartbeat recente.
 *
 * Regras:
 *   - só assume operações `pending`/`running`/`retryable` marcadas como `automated`;
 *   - o UPDATE condicional em `last_report_at` funciona como lease e impede
 *     duas retomadas concorrentes;
 *   - só roda na instalação MASTER (é lá que o módulo existe);
 *   - nunca expõe secrets: mensagens persistidas passam por `sanitize()`.
 */

import { AUTOMATION_LEASE_SECONDS } from "./runner.server";
import {
  InstallationReadError,
  isTransientMasterReadFailure,
  readWithBackoff,
} from "./resilience.server";

export function resumeFailureAction(
  cause: unknown,
  accessKind: "permission" | "transient" | "other",
): "defer" | "block" | "retry" {
  if (isTransientMasterReadFailure(cause)) return "defer";
  return accessKind === "permission" ? "block" : "retry";
}

export async function resumeStaleAutomatedProvisions(limit = 3): Promise<{
  claimed: number;
  operations: string[];
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const owner = `cron:${crypto.randomUUID()}`;
  const { data: rows, error } = await supabaseAdmin.rpc(
    "claim_stale_installation_operations",
    { _owner: owner, _limit: limit, _lease_seconds: AUTOMATION_LEASE_SECONDS },
  );
  if (error) throw error;

  const operations: string[] = [];
  for (const op of rows ?? []) {
    const operationId = (op as { id: string }).id;
    let targetStarted = false;
    try {
      const installation = await readWithBackoff(async () => {
        const result = await supabaseAdmin
          .from("installations")
          .select("*")
          .eq("id", (op as { installation_id: string }).installation_id)
          .maybeSingle();
        return { data: result.data, error: result.error };
      });
      if (!installation) throw new Error("Instalação da operação não foi encontrada.");

      const row = installation as Record<string, unknown>;
      const { runAutomatedProvision, runAutomatedUpdate, runAutomatedValidate, classifyAccessFailure } =
        await import("./automation.server");
      const { finalizeOperation, retryOperation, withOperationHeartbeat, yieldOperation } = await import("./runner.server");
      const kind = (op as { kind?: string }).kind ?? "provision";
      const { resolveInstallationEnv } = await import("./credentials.server");
      const { setRemoteInstallationServiceState } = await import("./service-state.server");
      const env = await resolveInstallationEnv(supabaseAdmin as never, row.id as string);
      const args = {
        client: supabaseAdmin as never,
        operation: op as never,
        env,
        installation: {
          id: row.id as string,
          domain: (row.domain ?? null) as string | null,
          supabaseUrl: (row.supabase_url ?? null) as string | null,
          supabaseProjectRef: (row.supabase_project_ref ?? null) as string | null,
          deployProject: (row.deploy_project ?? null) as string | null,
          gitRepoUrl: (row.git_repo_url ?? null) as string | null,
        },
        commitSha:
          ((op as { detail?: { targetCommitSha?: string } }).detail?.targetCommitSha ?? null) ||
          ((row.pinned_commit_sha ?? null) as string | null),
      };
      targetStarted = true;
      if (kind === "update") {
        const outcome = await withOperationHeartbeat(supabaseAdmin as never, op as never, () =>
          runAutomatedUpdate(args),
        );
        if (outcome.result === "PENDING") {
          await yieldOperation(supabaseAdmin as never, op as never);
        } else {
          const restored = await setRemoteInstallationServiceState({
            env,
            projectRef: (row.supabase_project_ref ?? null) as string | null,
            state: "active",
            actor: null,
          });
          if (!restored) throw new Error("estado remoto ativo não foi confirmado");
        }
      } else if (kind === "validate") {
        await withOperationHeartbeat(supabaseAdmin as never, op as never, () =>
          runAutomatedValidate(args),
        );
      } else {
        await withOperationHeartbeat(supabaseAdmin as never, op as never, () =>
          runAutomatedProvision(args),
        );
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "falha inesperada na retomada";
      try {
        const { classifyAccessFailure } = await import("./automation.server");
        const { deferOperation, finalizeOperation, retryOperation } = await import("./runner.server");
        const action = resumeFailureAction(cause, classifyAccessFailure(message));
        if (action === "defer") {
          if (!(cause instanceof InstallationReadError)) {
            throw new Error("falha do MASTER sem classificação de leitura");
          }
          await deferOperation(
            supabaseAdmin as never,
            op as never,
            `master_${cause.kind}`,
            cause.message,
          );
          operations.push(operationId);
          continue;
        }
        if (action === "block") {
          await finalizeOperation(supabaseAdmin as never, op as never, {
            ok: false,
            summary: `BLOCKED: ${message}`,
            errorKind: "permission",
          });
        } else {
          // Em retry o ambiente continua em manutenção; só volta a active após
          // conclusão definitiva confirmada pelo caminho de sucesso acima.
          await retryOperation(supabaseAdmin as never, op as never, "transient", message);
        }
      } catch {
        // Falha de uma operação não interrompe os demais claims deste lote.
      }
    }
    operations.push(operationId);
  }

  return { claimed: operations.length, operations };
}
