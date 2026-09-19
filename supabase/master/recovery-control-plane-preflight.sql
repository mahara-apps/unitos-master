-- Preflight READ-ONLY da recuperação 1.4.14. Nunca altera catálogo, ledger ou dados.
\pset pager off
\timing off

WITH facts AS (
  SELECT
    EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20260917190721') AS has_1411,
    EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20260917184500') AS has_1410,
    EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20260919143000') AS has_recovery,
    to_regclass('public.installation_migration_reconciliation_evidence') IS NOT NULL AS has_table,
    EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('record_installation_migration_reconciliation_evidence','read_installation_migration_reconciliation_evidence')) AS has_any_reconciliation_rpc,
    to_regprocedure('public.reconcile_installation_operation_migrations(uuid,text,bigint,jsonb)') IS NOT NULL AS has_1411_reconcile,
    to_regprocedure('public.normalize_legacy_installation_operations(integer)') IS NOT NULL AS has_1411_normalize,
    to_regclass('public.installations') IS NOT NULL AS has_installations,
    to_regclass('public.installation_operations') IS NOT NULL AS has_operations,
    to_regprocedure('public.is_super_admin(uuid)') IS NOT NULL AS has_super_admin,
    NOT EXISTS (SELECT 1 FROM public.installation_operations WHERE status IN ('pending','running','retryable') AND (lease_expires_at IS NULL OR lease_expires_at > now())) AS no_active_operations
), checks AS (
  SELECT 1 ord, 'ledger: 1.4.10 ausente, 1.4.11 presente, recuperação ausente' check_name, CASE WHEN has_1411 AND NOT has_1410 AND NOT has_recovery THEN 'PASS' ELSE 'FAIL' END status FROM facts
  UNION ALL SELECT 2, 'objetos 1.4.10 integralmente ausentes', CASE WHEN NOT has_table AND NOT has_any_reconciliation_rpc THEN 'PASS' ELSE 'FAIL' END FROM facts
  UNION ALL SELECT 3, 'dependências anteriores e 1.4.11 presentes', CASE WHEN has_installations AND has_operations AND has_super_admin AND has_1411_reconcile AND has_1411_normalize THEN 'PASS' ELSE 'FAIL' END FROM facts
  UNION ALL SELECT 4, 'nenhuma operação ativa ou retomável', CASE WHEN no_active_operations THEN 'PASS' ELSE 'FAIL' END FROM facts
)
SELECT ord, check_name, status FROM checks ORDER BY ord;