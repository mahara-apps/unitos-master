-- Preflight READ-ONLY para instalar exclusivamente o freeze global.
-- Preserva tentativas históricas e bloqueia estados ativos, concorrentes ou ambíguos.
\pset pager off
\timing off

WITH operation_facts AS (
  SELECT
    count(*) FILTER (WHERE status = 'pending' AND lease_owner IS NULL AND lease_expires_at IS NULL) AS queued_without_lease,
    count(*) FILTER (WHERE status IN ('running','retryable')) AS active,
    count(*) FILTER (WHERE status = 'pending' AND (lease_owner IS NOT NULL OR lease_expires_at IS NOT NULL)
      OR status IN ('blocked','manual_review','success','failed') AND (
        (lease_owner IS NULL) <> (lease_expires_at IS NULL) OR lease_expires_at > now() OR fencing_token IS NULL
        OR EXISTS (SELECT 1 FROM public.installation_operation_attempts a WHERE a.operation_id=installation_operations.id
          AND (a.status='running' OR a.fencing_token IS NULL OR a.fencing_token>installation_operations.fencing_token))
      )) AS ambiguous,
    count(*) FILTER (WHERE status IN ('blocked','manual_review','success','failed') AND lease_owner IS NOT NULL
      AND lease_expires_at IS NOT NULL AND lease_expires_at<=now() AND fencing_token IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.installation_operation_attempts a WHERE a.operation_id=installation_operations.id
        AND (a.status='running' OR a.fencing_token IS NULL OR a.fencing_token>installation_operations.fencing_token))) AS residual_terminal_lease,
    count(*) FILTER (WHERE status IS NULL OR status NOT IN ('pending', 'running', 'retryable', 'blocked', 'manual_review', 'success', 'failed')) AS unknown_status
  FROM public.installation_operations
), attempt_facts AS (
  SELECT
    count(*) FILTER (
      WHERE a.status = 'running'
    ) AS active_or_concurrent,
    count(*) FILTER (
      WHERE a.status IN ('retryable','deferred','interrupted')
        AND o.status IN ('blocked', 'manual_review', 'success', 'failed')
        AND a.finished_at IS NOT NULL AND a.fencing_token IS NOT NULL
        AND o.fencing_token IS NOT NULL AND a.fencing_token <= o.fencing_token
    ) AS historical_terminal,
    count(*) FILTER (WHERE a.status IN ('retryable','deferred','interrupted') AND NOT (
      o.status IN ('blocked','manual_review','success','failed') AND a.finished_at IS NOT NULL
      AND a.fencing_token IS NOT NULL AND o.fencing_token IS NOT NULL AND a.fencing_token<=o.fencing_token
    )) AS evidence_required_ambiguous,
    count(*) FILTER (WHERE o.id IS NULL) AS orphaned,
    count(*) FILTER (
      WHERE a.status IS NULL
        OR a.status NOT IN ('running', 'retryable', 'completed', 'failed', 'exhausted', 'orphaned', 'deferred', 'interrupted')
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
  SELECT 3, 'nenhuma operação em execução, leased, stale ou ambígua', active::text || ' ativas; ' || ambiguous::text || ' ambíguas',
    active = 0 AND ambiguous = 0 FROM operation_facts
  UNION ALL
  SELECT 4, 'contagem de operações enfileiradas sem lease íntegra', queued_without_lease::text, queued_without_lease >= 0 FROM operation_facts
  UNION ALL
  SELECT 5, 'estados de tentativa conhecidos', unknown_status::text, unknown_status = 0 FROM attempt_facts
  UNION ALL
  SELECT 6, 'nenhuma tentativa ativa ou concorrente', active_or_concurrent::text,
    active_or_concurrent = 0 FROM attempt_facts
  UNION ALL
  SELECT 7, 'nenhuma tentativa órfã', orphaned::text, orphaned = 0 FROM attempt_facts
  UNION ALL
  SELECT 8, 'histórico deferred/interrupted/retryable tem evidência terminal', historical_terminal::text || ' válidas; ' || evidence_required_ambiguous::text || ' ambíguas', evidence_required_ambiguous = 0 FROM attempt_facts
  UNION ALL
  SELECT 9, 'leases residuais apenas terminais, expirados e fenced', residual_terminal_lease::text || ' históricas; ' || ambiguous::text || ' ambíguas', ambiguous = 0 FROM operation_facts
)
SELECT ord, check_name, observed, CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS status
FROM checks ORDER BY ord;