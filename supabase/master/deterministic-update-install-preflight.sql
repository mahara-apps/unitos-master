-- Preflight READ-ONLY para instalar exclusivamente o executor determinístico.
-- Preserva pending legítima e tentativas históricas de operações terminais.
\pset pager off
\timing off
WITH operation_facts AS (
  SELECT
    count(*) FILTER (WHERE status = 'pending' AND lease_owner IS NULL AND lease_expires_at IS NULL) AS queued_preserved,
    count(*) FILTER (WHERE status = 'running' OR status = 'retryable' OR lease_owner IS NOT NULL OR lease_expires_at IS NOT NULL) AS active_or_ambiguous,
    count(*) FILTER (WHERE status IS NULL OR status NOT IN ('pending','running','retryable','blocked','manual_review','success','failed')) AS unknown_status
  FROM public.installation_operations
), attempt_facts AS (
  SELECT
    count(*) FILTER (WHERE a.status = 'running' OR (a.status = 'retryable' AND o.status IN ('pending','running','retryable'))) AS active_or_concurrent,
    count(*) FILTER (WHERE a.status = 'retryable' AND o.status IN ('blocked','manual_review','success','failed')) AS historical_terminal,
    count(*) FILTER (WHERE o.id IS NULL) AS orphaned,
    count(*) FILTER (WHERE a.status IS NULL OR a.status NOT IN ('running','retryable','completed','failed','exhausted','orphaned')) AS unknown_status
  FROM public.installation_operation_attempts a
  LEFT JOIN public.installation_operations o ON o.id = a.operation_id
), checks(ord, check_name, passed, observed) AS (
  SELECT 1, 'freeze instalado e ativo',
      to_regclass('public.installation_operations_freeze') IS NOT NULL
      AND (SELECT frozen FROM public.installation_operations_freeze WHERE singleton IS TRUE) IS TRUE,
      coalesce((SELECT 'frozen=' || frozen::text || ',generation=' || generation::text FROM public.installation_operations_freeze WHERE singleton IS TRUE), 'ausente')
  UNION ALL SELECT 2, 'pending sem lease preservadas', true, queued_preserved::text FROM operation_facts
  UNION ALL SELECT 3, 'nenhuma operação running, retryable, leased ou ambígua', active_or_ambiguous = 0, active_or_ambiguous::text FROM operation_facts
  UNION ALL SELECT 4, 'estados de operação conhecidos', unknown_status = 0, unknown_status::text FROM operation_facts
  UNION ALL SELECT 5, 'nenhuma tentativa ativa ou concorrente', active_or_concurrent = 0, active_or_concurrent::text FROM attempt_facts
  UNION ALL SELECT 6, 'tentativas históricas terminais preservadas', true, historical_terminal::text FROM attempt_facts
  UNION ALL SELECT 7, 'nenhuma tentativa órfã', orphaned = 0, orphaned::text FROM attempt_facts
  UNION ALL SELECT 8, 'estados de tentativa conhecidos', unknown_status = 0, unknown_status::text FROM attempt_facts
  UNION ALL SELECT 9, 'ledger operacional disponível',
      to_regclass('public.installation_operation_migrations') IS NOT NULL,
      coalesce(to_regclass('public.installation_operation_migrations')::text, 'ausente')
  UNION ALL SELECT 10, 'colunas de baseline e fencing disponíveis',
      (SELECT count(*) = 5 FROM information_schema.columns WHERE table_schema='public' AND table_name='installation_operations' AND column_name IN ('baseline_id','baseline_hash','fencing_token','lease_owner','lease_expires_at')),
      (SELECT count(*)::text || '/5' FROM information_schema.columns WHERE table_schema='public' AND table_name='installation_operations' AND column_name IN ('baseline_id','baseline_hash','fencing_token','lease_owner','lease_expires_at'))
)
SELECT ord, check_name, observed, CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS status FROM checks ORDER BY ord;
