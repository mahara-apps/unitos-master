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
), expected_functions(signature, identity_args, return_type, body_md5) AS (
  VALUES
    ('reconcile_installation_operation_migrations(uuid,text,bigint,jsonb)', 'uuid, text, bigint, jsonb', 'integer', 'abd43a4ec03634e6c9552eced6b7efe4'),
    ('normalize_legacy_installation_operations(integer)', 'integer', 'jsonb', '29f2435ed1a84f4a6f34cff166d4cd7d')
), function_contract AS (
  SELECT e.signature,
    p.oid IS NOT NULL
      AND p.pronargs = 4 - CASE WHEN e.signature LIKE 'normalize_%' THEN 3 ELSE 0 END
      AND pg_get_function_identity_arguments(p.oid) = e.identity_args
      AND pg_get_function_result(p.oid) = e.return_type
      AND l.lanname = 'plpgsql'
      AND p.provolatile = 'v' AND NOT p.proisstrict AND p.proparallel = 'u'
      AND p.prosecdef
      AND coalesce(p.proconfig, ARRAY[]::text[]) = ARRAY['search_path=public']
      AND pg_get_userbyid(p.proowner) = 'postgres'
      AND pg_get_functiondef(p.oid) IS NOT NULL
      AND md5(regexp_replace(p.prosrc, '\s+', ' ', 'g')) = e.body_md5
      AND NOT EXISTS (
        SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
        WHERE acl.privilege_type = 'EXECUTE'
          AND acl.grantee NOT IN (p.proowner, (SELECT oid FROM pg_roles WHERE rolname='service_role'))
      )
      AND EXISTS (
        SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
        JOIN pg_roles role ON role.oid=acl.grantee
        WHERE acl.privilege_type='EXECUTE' AND role.rolname='service_role'
      ) AS valid
  FROM expected_functions e
  LEFT JOIN pg_proc p ON p.oid=to_regprocedure('public.'||e.signature)
  LEFT JOIN pg_language l ON l.oid=p.prolang
), function_inventory AS (
  SELECT count(*) FILTER (WHERE p.proname='reconcile_installation_operation_migrations') AS reconcile_overloads,
         count(*) FILTER (WHERE p.proname='normalize_legacy_installation_operations') AS normalize_overloads
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname IN ('reconcile_installation_operation_migrations','normalize_legacy_installation_operations')
), dependencies AS (
  SELECT
    to_regclass('public.installation_operation_migrations') IS NOT NULL
      AND to_regclass('public.installation_operation_attempts') IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM (VALUES
          ('installation_operations','id'),('installation_operations','status'),('installation_operations','lease_owner'),
          ('installation_operations','fencing_token'),('installation_operations','lease_expires_at'),('installation_operations','metrics'),
          ('installation_operation_migrations','operation_id'),('installation_operation_migrations','migration_file'),
          ('installation_operation_migrations','fingerprint'),('installation_operation_migrations','package_position'),
          ('installation_operation_migrations','statement_index'),('installation_operation_migrations','total_statements'),
          ('installation_operation_attempts','operation_id'),('installation_operation_attempts','status'),
          ('installations','active_operation_id'),('installations','status'),('installations','health')
        ) required(table_name,column_name)
        LEFT JOIN information_schema.columns c ON c.table_schema='public' AND c.table_name=required.table_name AND c.column_name=required.column_name
        WHERE c.column_name IS NULL
      ) AS valid
), checks AS (
  SELECT 1 ord, 'ledger: 1.4.10 ausente, 1.4.11 presente, recuperação ausente' check_name, CASE WHEN has_1411 AND NOT has_1410 AND NOT has_recovery THEN 'PASS' ELSE 'FAIL' END status FROM facts
  UNION ALL SELECT 2, 'objetos 1.4.10 integralmente ausentes', CASE WHEN NOT has_table AND NOT has_any_reconciliation_rpc THEN 'PASS' ELSE 'FAIL' END FROM facts
  UNION ALL SELECT 3, 'dependências anteriores e 1.4.11 presentes', CASE WHEN has_installations AND has_operations AND has_super_admin AND has_1411_reconcile AND has_1411_normalize THEN 'PASS' ELSE 'FAIL' END FROM facts
  UNION ALL SELECT 4, 'nenhuma operação ativa ou retomável', CASE WHEN no_active_operations THEN 'PASS' ELSE 'FAIL' END FROM facts
  UNION ALL SELECT 5, '1.4.11 sem overloads e com assinaturas exatas', CASE WHEN reconcile_overloads=1 AND normalize_overloads=1 THEN 'PASS' ELSE 'FAIL' END FROM function_inventory
  UNION ALL SELECT 6, '1.4.11 definição, corpo, linguagem, retorno, argumentos e propriedades íntegros', CASE WHEN count(*)=2 AND bool_and(valid) THEN 'PASS' ELSE 'FAIL' END FROM function_contract
  UNION ALL SELECT 7, '1.4.11 owner, SECURITY DEFINER, search_path e ACL íntegros', CASE WHEN count(*)=2 AND bool_and(valid) THEN 'PASS' ELSE 'FAIL' END FROM function_contract
  UNION ALL SELECT 8, 'dependências estruturais da 1.4.11 presentes', CASE WHEN valid THEN 'PASS' ELSE 'FAIL' END FROM dependencies
)
SELECT ord, check_name, status FROM checks ORDER BY ord;