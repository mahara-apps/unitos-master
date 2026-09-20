-- Preflight READ-ONLY para instalar exclusivamente o executor determinístico.
\pset pager off
\timing off
WITH checks(ord, check_name, passed, observed) AS (
  VALUES
    (1, 'freeze instalado e ativo',
      to_regclass('public.installation_operations_freeze') IS NOT NULL
      AND (SELECT frozen FROM public.installation_operations_freeze WHERE singleton IS TRUE) IS TRUE,
      coalesce((SELECT 'frozen=' || frozen::text || ',generation=' || generation::text FROM public.installation_operations_freeze WHERE singleton IS TRUE), 'ausente')),
    (2, 'operações ativas ausentes',
      NOT EXISTS (SELECT 1 FROM public.installation_operations WHERE status IN ('pending','running','retryable')),
      (SELECT count(*)::text FROM public.installation_operations WHERE status IN ('pending','running','retryable'))),
    (3, 'tentativas ativas ausentes',
      NOT EXISTS (SELECT 1 FROM public.installation_operation_attempts WHERE status IN ('running','retryable')),
      (SELECT count(*)::text FROM public.installation_operation_attempts WHERE status IN ('running','retryable'))),
    (4, 'ledger operacional disponível',
      to_regclass('public.installation_operation_migrations') IS NOT NULL,
      coalesce(to_regclass('public.installation_operation_migrations')::text, 'ausente')),
    (5, 'colunas de baseline e fencing disponíveis',
      (SELECT count(*) = 5 FROM information_schema.columns WHERE table_schema='public' AND table_name='installation_operations' AND column_name IN ('baseline_id','baseline_hash','fencing_token','lease_owner','lease_expires_at')),
      (SELECT count(*)::text || '/5' FROM information_schema.columns WHERE table_schema='public' AND table_name='installation_operations' AND column_name IN ('baseline_id','baseline_hash','fencing_token','lease_owner','lease_expires_at')))
)
SELECT ord, check_name, observed, CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS status FROM checks ORDER BY ord;
