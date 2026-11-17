/**
 * Acompanhamento das gerações de IA na tela.
 *
 * O aviso em tempo real é o caminho rápido, mas não pode ser o único: se a
 * instalação não publica `ai_jobs` (ou a conexão cai), a tela ficava presa em
 * "Gerando" mesmo com a geração já concluída. Enquanto houver geração em
 * andamento, a lista é relida periodicamente.
 */

export const AI_JOBS_ACTIVE_POLL_MS = 4_000;

type JobLike = { status: string; kind?: string | null };

export function isActiveAiJob(job: JobLike): boolean {
  return job.status === "queued" || job.status === "running";
}

/** Intervalo de releitura: só enquanto existir geração em andamento. */
export function aiJobsPollInterval(jobs: readonly JobLike[] | undefined): number | false {
  return (jobs ?? []).some(isActiveAiJob) ? AI_JOBS_ACTIVE_POLL_MS : false;
}

/**
 * Listas que mudam quando uma geração termina. Prefixos de queryKey, para
 * invalidar todas as variações (filtros, cliente, projeto).
 */
export function queryKeysToRefreshOnJobEnd(job: JobLike): ReadonlyArray<readonly string[]> {
  if (job.kind === "monthly_plan") {
    return [["plan-board"], ["monthly-plans"], ["monthly-plan"], ["content-board"]];
  }
  return [];
}
