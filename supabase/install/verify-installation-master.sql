-- Verificação READ-ONLY do Control-plane MASTER. Nunca executar no Client.
\pset pager off
\timing off

WITH expected_tables(name) AS (VALUES
  ('installations'), ('installation_credentials'), ('installation_operations'),
  ('installation_operation_attempts'), ('installation_operation_steps'),
  ('installation_operation_outbox'), ('installation_operation_migrations'),
  ('installation_migration_reconciliation_evidence'),
  ('installation_operations_freeze'), ('installation_operations_freeze_events'),
  ('control_plane_release_state'), ('control_plane_release_events')
), expected_columns(table_name, column_name) AS (VALUES
  ('installation_operations','workflow_version'), ('installation_operations','baseline_id'),
  ('installation_operations','baseline_hash'), ('installation_operations','heartbeat_at'),
  ('installation_operations','blocked_reason'), ('installation_operations','reconciled_at'),
  ('installation_operations','next_command'),
  ('installation_operation_steps','operation_id'), ('installation_operation_steps','step_key'),
  ('installation_operation_steps','position'), ('installation_operation_steps','state'),
  ('installation_operation_outbox','operation_id'), ('installation_operation_outbox','deduplication_key'),
  ('installation_operation_outbox','status'), ('installation_operation_outbox','available_at'),
  ('installations','clean_replacement_of'), ('installations','pending_domain')
), expected_functions(signature) AS (VALUES
  ('start_durable_installation_operation(uuid,uuid,text,text,jsonb,jsonb,integer,text,text,text,timestamp with time zone,uuid)'),
  ('claim_stale_installation_operations(text,integer,integer)'),
  ('heartbeat_installation_operation(uuid,text,bigint,integer)'),
  ('yield_installation_operation(uuid,text,bigint,integer)'),
  ('defer_installation_operation(uuid,text,bigint,integer,text,text,jsonb)'),
  ('retry_installation_operation(uuid,text,bigint,integer,text,text,jsonb)'),
  ('checkpoint_installation_operation(uuid,text,bigint,jsonb,jsonb,text,text,jsonb)'),
  ('checkpoint_installation_migration(uuid,text,bigint,text,text,integer,integer,integer,boolean)'),
  ('reconcile_installation_operation_migrations(uuid,text,bigint,jsonb)'),
  ('record_installation_migration_reconciliation_evidence(uuid,text,bigint,text,jsonb)'),
  ('read_installation_migration_reconciliation_evidence(uuid,text)'),
  ('normalize_legacy_installation_operations(integer)'),
  ('seal_installation_operation_baseline(uuid,text,bigint,text,text)'),
  ('finalize_installation_operation(uuid,text,bigint,text,text,text,jsonb,jsonb,text,text,jsonb,text,boolean,boolean)'),
  ('compare_and_set_installation_generated_secrets(uuid,timestamp with time zone,text,uuid)')
  ,('read_installation_operations_freeze()')
  ,('set_installation_operations_freeze(boolean,text,text,bigint)')
  ,('guard_installation_operations_freeze()')
  ,('promote_control_plane_release(bigint,text,text,text,text,text,text,jsonb,text)')
  ,('prepare_clean_installation_replacement_cutover(uuid,text)')
), checks AS (
  SELECT 1 AS ord, 'Master: tabelas Control-plane ativas' AS check_name,
    coalesce(string_agg(name, ', ' ORDER BY name) FILTER (WHERE to_regclass('public.' || name) IS NULL), 'todas presentes') AS observed,
    CASE WHEN bool_and(to_regclass('public.' || name) IS NOT NULL) THEN 'PASS' ELSE 'FAIL' END AS status
  FROM expected_tables
  UNION ALL
  SELECT 2, 'Master: estruturas históricas sem consumidor permanecem ausentes',
    concat_ws(', ', CASE WHEN to_regclass('public.installation_operation_effects') IS NOT NULL THEN 'installation_operation_effects presente' END,
                    CASE WHEN to_regclass('public.installation_migration_ledger') IS NOT NULL THEN 'installation_migration_ledger presente' END),
    'INFO'
  UNION ALL
  SELECT 3, 'Master: colunas durable críticas',
    coalesce(string_agg(table_name || '.' || column_name, ', ' ORDER BY table_name,column_name)
      FILTER (WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name=expected_columns.table_name AND c.column_name=expected_columns.column_name)), 'todas presentes'),
    CASE WHEN bool_and(EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name=expected_columns.table_name AND c.column_name=expected_columns.column_name)) THEN 'PASS' ELSE 'FAIL' END
  FROM expected_columns
  UNION ALL
  SELECT 4, 'Master: FKs e constraints críticas',
    count(*)::text || '/9', CASE WHEN count(*)=9 THEN 'PASS' ELSE 'FAIL' END
  FROM pg_constraint WHERE conname IN (
    'installation_operations_installation_id_fkey','installation_operation_steps_operation_id_fkey',
    'installation_operation_outbox_operation_id_fkey','installation_operation_attempts_operation_id_fkey',
    'installation_migration_reconciliation_evidence_installation_id_fkey','installation_migration_reconciliation_evidence_operation_id_fkey',
    'installation_operation_migrations_operation_id_fkey','installation_operation_steps_operation_id_step_key_key',
    'installation_operation_outbox_deduplication_key_key')
  UNION ALL
  SELECT 5, 'Master: índices durable críticos', count(*)::text || '/8', CASE WHEN count(*)=8 THEN 'PASS' ELSE 'FAIL' END
  FROM pg_indexes WHERE schemaname='public' AND indexname IN (
    'installation_operations_reconcile_idx','installation_operations_resume_idx','installation_operations_one_active',
    'installation_operation_attempts_active_idx','installation_operation_steps_state_idx',
    'installation_operation_outbox_ready_idx','installation_operation_migrations_operation_status_idx',
    'installation_migration_reconciliation_evidence_operation_idx')
  UNION ALL
  SELECT 6, 'Master: RLS nas tabelas Control-plane',
    coalesce(string_agg(e.name, ', ' ORDER BY e.name) FILTER (WHERE NOT c.relrowsecurity), 'todas protegidas'),
    CASE WHEN bool_and(c.relrowsecurity) THEN 'PASS' ELSE 'FAIL' END
  FROM expected_tables e JOIN pg_class c ON c.oid=to_regclass('public.' || e.name)
  UNION ALL
  SELECT 7, 'Master: policies Super Admin', count(*)::text || '/12', CASE WHEN count(*)=12 THEN 'PASS' ELSE 'FAIL' END
  FROM pg_policies WHERE schemaname='public' AND policyname IN (
    'installations_super_admin_all','installation_credentials_super_admin_all','installation_operations_super_admin_all',
    'installation_operation_attempts_super_admin_read','installation_operation_steps_super_admin_read',
    'installation_operation_outbox_super_admin_read','installation_operation_migrations_super_admin_read',
    'installation_migration_reconciliation_evidence_super_admin_read',
    'installation_operations_freeze_super_admin_read','installation_operations_freeze_events_super_admin_read',
    'control_plane_release_state_super_admin_read','control_plane_release_events_super_admin_read')
  UNION ALL
  SELECT 8, 'Master: grants mínimos das tabelas durable',
    CASE WHEN bool_and(CASE WHEN name IN ('installation_operations_freeze','installation_operations_freeze_events','control_plane_release_state','control_plane_release_events')
      THEN has_table_privilege('service_role','public.'||name,'SELECT')
      ELSE has_table_privilege('service_role','public.'||name,'SELECT,INSERT,UPDATE,DELETE') END) THEN 'service_role ok' ELSE 'service_role incompleto' END,
    CASE WHEN bool_and(CASE WHEN name IN ('installation_operations_freeze','installation_operations_freeze_events','control_plane_release_state','control_plane_release_events')
      THEN has_table_privilege('service_role','public.'||name,'SELECT')
      ELSE has_table_privilege('service_role','public.'||name,'SELECT,INSERT,UPDATE,DELETE') END)
           AND bool_and(NOT has_table_privilege('anon','public.'||name,'SELECT,INSERT,UPDATE,DELETE')) THEN 'PASS' ELSE 'FAIL' END
  FROM expected_tables
  UNION ALL
  SELECT 9, 'Master: triggers obrigatórios', count(*)::text || '/12', CASE WHEN count(*)=12 THEN 'PASS' ELSE 'FAIL' END
  FROM pg_trigger WHERE NOT tgisinternal AND tgname IN (
    'installations_touch_updated_at','update_installation_credentials_updated_at',
    'installation_operation_steps_touch_updated_at','installation_operation_outbox_disable_legacy',
    'installation_operations_freeze_guard')
  UNION ALL
  SELECT 10, 'Master: RPCs durable restritas', count(*)::text || '/20', CASE WHEN count(*)=20 THEN 'PASS' ELSE 'FAIL' END
  FROM expected_functions e JOIN pg_proc p ON p.oid=to_regprocedure('public.'||e.signature)
  WHERE p.prosecdef AND position('public' in pg_get_functiondef(p.oid))>0
    AND has_function_privilege('service_role',p.oid,'EXECUTE')
    AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
    AND (e.signature='read_installation_operations_freeze()'
      OR NOT has_function_privilege('authenticated',p.oid,'EXECUTE'))
  UNION ALL
  SELECT 12, 'Master: singleton do congelamento íntegro',
    count(*)::text || ' linha; geração ' || coalesce(max(generation)::text,'ausente'),
    CASE WHEN count(*)=1 AND bool_and(singleton) AND min(generation)>=0 THEN 'PASS' ELSE 'FAIL' END
  FROM public.installation_operations_freeze
  UNION ALL
  SELECT 14, 'Master: finalização UPDATE atômica e fenced',
    CASE WHEN position('pinned_release' in pg_get_functiondef('public.finalize_installation_operation(uuid,text,bigint,text,text,text,jsonb,jsonb,text,text,jsonb,text,boolean,boolean)'::regprocedure))>0
      THEN 'versão e operação fechadas na mesma RPC' ELSE 'contrato antigo' END,
    CASE WHEN position('lease_expires_at > now()' in pg_get_functiondef('public.finalize_installation_operation(uuid,text,bigint,text,text,text,jsonb,jsonb,text,text,jsonb,text,boolean,boolean)'::regprocedure))>0
      AND position('updateDatabaseReconciled' in pg_get_functiondef('public.finalize_installation_operation(uuid,text,bigint,text,text,text,jsonb,jsonb,text,text,jsonb,text,boolean,boolean)'::regprocedure))>0
      AND position('pinned_commit_sha' in pg_get_functiondef('public.finalize_installation_operation(uuid,text,bigint,text,text,text,jsonb,jsonb,text,text,jsonb,text,boolean,boolean)'::regprocedure))>0
      AND position('_minimum_position <> 1' in pg_get_functiondef('public.finalize_installation_operation(uuid,text,bigint,text,text,text,jsonb,jsonb,text,text,jsonb,text,boolean,boolean)'::regprocedure))>0
      AND position('_maximum_position <> _package_total' in pg_get_functiondef('public.finalize_installation_operation(uuid,text,bigint,text,text,text,jsonb,jsonb,text,text,jsonb,text,boolean,boolean)'::regprocedure))>0
      AND position('_distinct_positions <> _package_total' in pg_get_functiondef('public.finalize_installation_operation(uuid,text,bigint,text,text,text,jsonb,jsonb,text,text,jsonb,text,boolean,boolean)'::regprocedure))>0
      THEN 'PASS' ELSE 'FAIL' END
  UNION ALL
  SELECT 13, 'Master: triggers fail-closed nas tabelas operacionais', count(*)::text || '/8',
    CASE WHEN count(*)=8 THEN 'PASS' ELSE 'FAIL' END
  FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE NOT t.tgisinternal AND t.tgname='installation_operations_freeze_guard' AND n.nspname='public'
    AND c.relname IN ('installations','installation_credentials','installation_operations',
      'installation_operation_attempts','installation_operation_steps','installation_operation_outbox',
      'installation_operation_migrations','installation_migration_reconciliation_evidence')
  UNION ALL
  SELECT 15, 'Master: estado próprio do release do Control-plane',
    count(*)::text || ' linha; geração ' || coalesce(max(generation)::text,'ausente'),
    CASE WHEN count(*)=1 AND bool_and(singleton) AND min(generation)>=0 THEN 'PASS' ELSE 'FAIL' END
  FROM public.control_plane_release_state
  UNION ALL
  SELECT 11, 'Master: cron installation-provision-resume', coalesce((SELECT schedule FROM cron.job WHERE jobname='installation-provision-resume' LIMIT 1),'ausente'),
    CASE WHEN EXISTS (SELECT 1 FROM cron.job WHERE jobname='installation-provision-resume' AND command LIKE '%/api/public/cron/installation-resume%' AND command LIKE '%x-cron-secret%') THEN 'PASS' ELSE 'FAIL' END
)
SELECT ord, check_name, observed, status FROM checks ORDER BY ord;
