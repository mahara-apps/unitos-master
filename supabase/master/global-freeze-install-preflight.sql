-- Preflight READ-ONLY para instalar exclusivamente o freeze global.
-- Preserva tentativas históricas e bloqueia estados ativos, concorrentes ou ambíguos.
\pset pager off
\timing off

WITH operation_facts AS (
  SELECT
    count(*) FILTER (WHERE status = 'pending' AND lease_owner IS NULL AND lease_expires_at IS NULL) AS queued_without_lease,
    count(*) FILTER (WHERE status = 'running' OR lease_owner IS NOT NULL OR lease_expires_at IS NOT NULL) AS active_stale_or_ambiguous,
    count(*) FILTER (WHERE status IS NULL OR status NOT IN ('pending', 'running', 'retryable', 'blocked', 'manual_review', 'success', 'failed')) AS unknown_status
  FROM public.installation_operations
), attempt_facts AS (
  SELECT
    count(*) FILTER (
      WHERE a.status = 'running'
        OR (a.status = 'retryable' AND o.status IN ('pending', 'running', 'retryable'))
    ) AS active_or_concurrent,
    count(*) FILTER (
      WHERE a.status = 'retryable'
        AND o.status IN ('blocked', 'manual_review', 'success', 'failed')
    ) AS historical_terminal,
    count(*) FILTER (WHERE o.id IS NULL) AS orphaned,
    count(*) FILTER (
      WHERE a.status IS NULL
        OR a.status NOT IN ('running', 'retryable', 'completed', 'failed', 'exhausted', 'orphaned')
    ) AS unknown_status
  FROM public.installation_operation_attempts a
  LEFT JOIN public.installation_operations o ON o.id = a.operation_id
), checks(ord, check_name, observed, passed) AS (
  SELECT 1, 'cron 37 permanece inativo',
    coalesce((SELECT 'active=' || active::text FROM cron.job WHERE jobid = 37 AND jobname = 'installation-provision-resume'), 'ausente ou divergente'),
    (SELECT count(*) = 1 AND bool_and(active IS FALSE) FROM cron.job WHERE jobid = 37 AND jobname = 'installation-provision-resume')
  UNION ALL
  SELECT 2, 'estados de operação conhecidos', unknown_status::text, unknown_status = 0 FROM operation_facts
  UNION ALL
  SELECT 3, 'nenhuma operação em execução, leased, stale ou ambígua', active_stale_or_ambiguous::text,
    active_stale_or_ambiguous = 0 FROM operation_facts
  UNION ALL
  SELECT 4, 'operações apenas enfileiradas sem lease são preservadas', queued_without_lease::text, true FROM operation_facts
  UNION ALL
  SELECT 5, 'estados de tentativa conhecidos', unknown_status::text, unknown_status = 0 FROM attempt_facts
  UNION ALL
  SELECT 6, 'nenhuma tentativa ativa ou concorrente', active_or_concurrent::text,
    active_or_concurrent = 0 FROM attempt_facts
  UNION ALL
  SELECT 7, 'nenhuma tentativa órfã', orphaned::text, orphaned = 0 FROM attempt_facts
  UNION ALL
  SELECT 8, 'tentativas retryable históricas em operações terminais preservadas', historical_terminal::text, true FROM attempt_facts
)
SELECT ord, check_name, observed, CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS status
FROM checks ORDER BY ord;