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
 *   - só assume operações `pending`/`running` marcadas como `automated`;
 *   - o UPDATE condicional em `last_report_at` funciona como lease e impede
 *     duas retomadas concorrentes;
 *   - só roda na instalação MASTER (é lá que o módulo existe);
 *   - nunca expõe secrets: mensagens persistidas passam por `sanitize()`.
 */

import { AUTOMATION_LEASE_SECONDS } from "./runner.server";

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
    const { data: installation } = await supabaseAdmin
      .from("installations")
      .select("*")
      .eq("id", (op as { installation_id: string }).installation_id)
      .maybeSingle();
    if (!installation) continue;

    const row = installation as Record<string, unknown>;
    const { runAutomatedProvision, runAutomatedUpdate, runAutomatedValidate } =
      await import("./automation.server");
    const { finalizeOperation, withOperationHeartbeat } = await import("./runner.server");
    // Cada tipo de operação tem o próprio conjunto de etapas: retomar tudo como
    // provisionamento deixava UPDATE/VALIDATE presos reportando etapas inexistentes.
    const kind = (op as { kind?: string }).kind ?? "provision";
    // Cada instalação pode ter credenciais próprias (banco/deploy/repositório
    // do cliente): a retomada precisa usar as MESMAS credenciais do início.
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
      // Retomada nunca "atualiza para o mais novo": segue o commit autorizado
      // quando a operação foi aberta.
      commitSha:
        ((op as { detail?: { targetCommitSha?: string } }).detail?.targetCommitSha ?? null) ||
        ((row.pinned_commit_sha ?? null) as string | null),
    };
    try {
      if (kind === "update") {
        const outcome = await withOperationHeartbeat(supabaseAdmin as never, op as never, () =>
          runAutomatedUpdate(args),
        );
        if (outcome.result !== "PENDING") {
          await setRemoteInstallationServiceState({
            env,
            projectRef: (row.supabase_project_ref ?? null) as string | null,
            state: "active",
            actor: null,
          });
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
      await finalizeOperation(supabaseAdmin as never, op as never, {
        ok: false,
        summary: `FAIL: ${message}`,
        errorKind: "unexpected_error",
      });
      if (kind === "update") {
        await setRemoteInstallationServiceState({
          env,
          projectRef: (row.supabase_project_ref ?? null) as string | null,
          state: "active",
          actor: null,
        });
      }
    }
    operations.push((op as { id: string }).id);
  }

  return { claimed: operations.length, operations };
}
