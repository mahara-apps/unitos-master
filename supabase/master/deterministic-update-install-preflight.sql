-- Preflight READ-ONLY para instalar exclusivamente o executor determinístico.
-- Preserva pending legítima e tentativas históricas de operações terminais.
\pset pager off
\timing off
WITH operation_facts AS (
  SELECT
    count(*) FILTER (WHERE status = 'pending' AND lease_owner IS NULL AND lease_expires_at IS NULL) AS queued_preserved,
    count(*) FILTER (WHERE status IN ('running','retryable')) AS active,
    count(*) FILTER (
      WHERE status = 'pending' AND (lease_owner IS NOT NULL OR lease_expires_at IS NOT NULL)
        OR status IN ('blocked','manual_review','success','failed') AND (
          (lease_owner IS NULL) <> (lease_expires_at IS NULL)
          OR lease_expires_at > now()
          OR fencing_token IS NULL
          OR EXISTS (
            SELECT 1 FROM public.installation_operation_attempts a
            WHERE a.operation_id = installation_operations.id
              AND (a.status = 'running' OR a.fencing_token IS NULL OR a.fencing_token > installation_operations.fencing_token)
          )
        )
    ) AS ambiguous,
    count(*) FILTER (
      WHERE status IN ('blocked','manual_review','success','failed')
        AND lease_owner IS NOT NULL AND lease_expires_at IS NOT NULL
        AND lease_expires_at <= now() AND fencing_token IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.installation_operation_attempts a
          WHERE a.operation_id = installation_operations.id
            AND (a.status = 'running' OR a.fencing_token IS NULL OR a.fencing_token > installation_operations.fencing_token)
        )
    ) AS residual_terminal_lease,
    count(*) FILTER (WHERE status IS NULL OR status NOT IN ('pending','running','retryable','blocked','manual_review','success','failed')) AS unknown_status
  FROM public.installation_operations
), attempt_facts AS (
  SELECT
    count(*) FILTER (WHERE a.status = 'running') AS active_or_concurrent,
    count(*) FILTER (
      WHERE a.status IN ('retryable','deferred','interrupted')
        AND o.status IN ('blocked','manual_review','success','failed')
        AND a.finished_at IS NOT NULL AND a.fencing_token IS NOT NULL
        AND o.fencing_token IS NOT NULL AND a.fencing_token <= o.fencing_token
    ) AS historical_terminal,
    count(*) FILTER (
      WHERE a.status IN ('retryable','deferred','interrupted') AND NOT (
        o.status IN ('blocked','manual_review','success','failed')
        AND a.finished_at IS NOT NULL AND a.fencing_token IS NOT NULL
        AND o.fencing_token IS NOT NULL AND a.fencing_token <= o.fencing_token
      )
    ) AS evidence_required_ambiguous,
    count(*) FILTER (WHERE o.id IS NULL) AS orphaned,
    count(*) FILTER (WHERE a.status IS NULL OR a.status NOT IN ('running','retryable','completed','failed','exhausted','orphaned','deferred','interrupted')) AS unknown_status
  FROM public.installation_operation_attempts a
  LEFT JOIN public.installation_operations o ON o.id = a.operation_id
), checks(ord, check_name, passed, observed) AS (
  SELECT 1, 'freeze instalado e ativo',
      to_regclass('public.installation_operations_freeze') IS NOT NULL
      AND (SELECT frozen FROM public.installation_operations_freeze WHERE singleton IS TRUE) IS TRUE,
      coalesce((SELECT 'frozen=' || frozen::text || ',generation=' || generation::text FROM public.installation_operations_freeze WHERE singleton IS TRUE), 'ausente')
  UNION ALL SELECT 2, 'contagem de pending sem lease íntegra', queued_preserved >= 0, queued_preserved::text FROM operation_facts
  UNION ALL SELECT 3, 'nenhuma operação running ou retryable', active = 0, active::text FROM operation_facts
  UNION ALL SELECT 4, 'estados de operação conhecidos', unknown_status = 0, unknown_status::text FROM operation_facts
  UNION ALL SELECT 5, 'nenhuma tentativa ativa ou concorrente', active_or_concurrent = 0, active_or_concurrent::text FROM attempt_facts
  UNION ALL SELECT 6, 'histórico deferred/interrupted/retryable tem evidência terminal', evidence_required_ambiguous = 0, historical_terminal::text || ' válidas; ' || evidence_required_ambiguous::text || ' ambíguas' FROM attempt_facts
  UNION ALL SELECT 7, 'nenhuma tentativa órfã', orphaned = 0, orphaned::text FROM attempt_facts
  UNION ALL SELECT 8, 'estados de tentativa conhecidos', unknown_status = 0, unknown_status::text FROM attempt_facts
  UNION ALL SELECT 9, 'leases residuais apenas terminais, expirados e fenced', ambiguous = 0, residual_terminal_lease::text || ' históricas; ' || ambiguous::text || ' ambíguas' FROM operation_facts
  UNION ALL SELECT 10, 'ledger operacional disponível',
      to_regclass('public.installation_operation_migrations') IS NOT NULL,
      coalesce(to_regclass('public.installation_operation_migrations')::text, 'ausente')
  UNION ALL SELECT 11, 'colunas de baseline e fencing disponíveis',
      (SELECT count(*) = 5 FROM information_schema.columns WHERE table_schema='public' AND table_name='installation_operations' AND column_name IN ('baseline_id','baseline_hash','fencing_token','lease_owner','lease_expires_at')),
      (SELECT count(*)::text || '/5' FROM information_schema.columns WHERE table_schema='public' AND table_name='installation_operations' AND column_name IN ('baseline_id','baseline_hash','fencing_token','lease_owner','lease_expires_at'))
)
SELECT ord, check_name, observed, CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS status FROM checks ORDER BY ord;
