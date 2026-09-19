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
    to_regclass('public.installation_operation_migrations') IS NOT NULL AS has_operation_migrations,
    to_regclass('public.installation_operation_attempts') IS NOT NULL AS has_attempts,
    to_regprocedure('public.is_super_admin(uuid)') IS NOT NULL AS has_super_admin,
    NOT EXISTS (SELECT 1 FROM public.installation_operations WHERE status IN ('pending','running','retryable') AND (lease_expires_at IS NULL OR lease_expires_at > now())) AS no_active_operations
), fn_811(fn, expected_signature, expected_identity_args, expected_result) AS (VALUES
  ('reconcile', 'reconcile_installation_operation_migrations(uuid,text,bigint,jsonb)', 'uuid, text, bigint, jsonb', 'integer'),
  ('normalize', 'normalize_legacy_installation_operations(integer)', 'integer', 'jsonb')
), fn_detail AS (
  SELECT s.fn, s.expected_signature, s.expected_identity_args, s.expected_result,
    p.oid, p.prolang, p.provolatile, p.prosecdef, p.proconfig, p.proowner, p.proacl,
    (SELECT count(*) FROM pg_proc pp JOIN pg_namespace nn ON nn.oid = pp.pronamespace
       WHERE nn.nspname = 'public' AND pp.proname = split_part(s.expected_signature, '(', 1)) AS overload_count,
    pg_get_function_identity_arguments(p.oid) AS actual_identity_args,
    pg_get_function_result(p.oid) AS actual_result,
    pg_get_functiondef(p.oid) AS functiondef,
    l.lanname, pg_get_userbyid(p.proowner) AS owner_name
  FROM fn_811 s
  LEFT JOIN pg_proc p ON p.oid = to_regprocedure('public.' || s.expected_signature)
  LEFT JOIN pg_language l ON l.oid = p.prolang
), overloads AS (
  SELECT
    max(overload_count) FILTER (WHERE fn = 'reconcile') AS reconcile_overloads,
    max(overload_count) FILTER (WHERE fn = 'normalize') AS normalize_overloads
  FROM fn_detail
), checks AS (
  SELECT 1 ord, 'ledger: 1.4.10 ausente, 1.4.11 presente, recuperação ausente' check_name, CASE WHEN has_1411 AND NOT has_1410 AND NOT has_recovery THEN 'PASS' ELSE 'FAIL' END status FROM facts
  UNION ALL SELECT 2, 'objetos 1.4.10 integralmente ausentes', CASE WHEN NOT has_table AND NOT has_any_reconciliation_rpc THEN 'PASS' ELSE 'FAIL' END FROM facts
  UNION ALL SELECT 3, 'dependências anteriores e 1.4.11 presentes', CASE WHEN has_installations AND has_operations AND has_super_admin AND has_1411_reconcile AND has_1411_normalize THEN 'PASS' ELSE 'FAIL' END FROM facts
  UNION ALL SELECT 4, 'nenhuma operação ativa ou retomável', CASE WHEN no_active_operations THEN 'PASS' ELSE 'FAIL' END FROM facts

  -- 1.4.11: assinatura exata, sem overloads (reconcile_overloads=1 AND normalize_overloads=1)
  UNION ALL SELECT 5, '1.4.11: assinaturas exatas sem overload',
    CASE WHEN (SELECT reconcile_overloads FROM overloads) = 1 AND (SELECT normalize_overloads FROM overloads) = 1 THEN 'PASS' ELSE 'FAIL' END

  -- 1.4.11: pg_get_functiondef íntegro com cláusulas críticas de segurança preservadas
  UNION ALL SELECT 6, '1.4.11 ' || fn || ': pg_get_functiondef íntegro e cláusulas críticas',
    CASE
      WHEN functiondef IS NULL OR length(functiondef) < 200 THEN 'FAIL'
      WHEN fn = 'reconcile' AND (
        position('FOR UPDATE' in functiondef) = 0
        OR position('fencing_token = _fencing_token' in functiondef) = 0
        OR position('lease_expires_at > now()' in functiondef) = 0
        OR position('ON CONFLICT (operation_id, migration_file, fingerprint)' in functiondef) = 0
        OR position('Lease perdido durante a reconciliação' in functiondef) = 0
      ) THEN 'FAIL'
      WHEN fn = 'normalize' AND (
        position('make_interval(secs => _max_idle_seconds)' in functiondef) = 0
        OR position('''manual_review''' in functiondef) = 0
        OR position('''orphaned''' in functiondef) = 0
        OR position('_max_idle_seconds < 30 OR _max_idle_seconds > 86400' in functiondef) = 0
      ) THEN 'FAIL'
      ELSE 'PASS'
    END
  FROM fn_detail

  -- 1.4.11: linguagem, retorno (pg_get_function_result) e argumentos (pg_get_function_identity_arguments) exatos
  UNION ALL SELECT 7, '1.4.11 ' || fn || ': linguagem, retorno e argumentos exatos',
    CASE WHEN lanname = 'plpgsql' AND actual_result = expected_result
      AND actual_identity_args = expected_identity_args THEN 'PASS' ELSE 'FAIL' END
  FROM fn_detail

  -- 1.4.11: p.prosecdef ativo e search_path=public exato, sem entradas extras em proconfig
  UNION ALL SELECT 8, '1.4.11 ' || fn || ': p.prosecdef ativo e search_path=public exato',
    CASE WHEN prosecdef IS TRUE AND proconfig IS NOT NULL
      AND array_length(proconfig, 1) = 1 AND proconfig[1] = 'search_path=public' THEN 'PASS' ELSE 'FAIL' END
  FROM fn_detail

  -- 1.4.11: owner obrigatoriamente pg_get_userbyid(p.proowner) = 'postgres'
  UNION ALL SELECT 9, '1.4.11 ' || fn || ': owner é postgres',
    CASE WHEN owner_name = 'postgres' THEN 'PASS' ELSE 'FAIL' END
  FROM fn_detail

  -- 1.4.11: ACL expandida via aclexplode: apenas service_role com EXECUTE
  UNION ALL SELECT 10, '1.4.11 ' || fn || ': ACL restrita ao service_role via aclexplode',
    CASE WHEN oid IS NOT NULL
      AND has_function_privilege('service_role', oid, 'EXECUTE')
      AND NOT has_function_privilege('anon', oid, 'EXECUTE')
      AND NOT has_function_privilege('authenticated', oid, 'EXECUTE')
      AND NOT has_function_privilege('public', oid, 'EXECUTE')
      AND (
        SELECT count(*) FROM aclexplode(coalesce(proacl, acldefault('f', proowner))) g
        WHERE g.privilege_type = 'EXECUTE' AND g.grantee <> proowner
      ) = 1
      AND EXISTS (
        SELECT 1 FROM aclexplode(coalesce(proacl, acldefault('f', proowner))) g
        WHERE g.privilege_type = 'EXECUTE' AND g.grantee = 'service_role'::regrole::oid
      )
    THEN 'PASS' ELSE 'FAIL' END
  FROM fn_detail

  -- 1.4.11: dependências estruturais da 1.4.11 presentes (tabelas consumidas por reconcile e normalize)
  UNION ALL SELECT 11, 'dependências estruturais da 1.4.11 presentes',
    CASE WHEN has_installations AND has_operations AND has_operation_migrations AND has_attempts THEN 'PASS' ELSE 'FAIL' END
  FROM facts
)
SELECT ord, check_name, status FROM checks ORDER BY ord;
