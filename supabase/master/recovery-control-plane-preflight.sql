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
), fn_reconcile AS (
  SELECT p.* FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'reconcile_installation_operation_migrations'
), fn_normalize AS (
  SELECT p.* FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'normalize_legacy_installation_operations'
), fn_811_specs(fn, expected_signature, expected_args, expected_result, expected_volatility) AS (VALUES
  ('reconcile', 'reconcile_installation_operation_migrations(uuid,text,bigint,jsonb)',
    '_operation_id uuid, _owner text, _fencing_token bigint, _migrations jsonb', 'integer', 'v'),
  ('normalize', 'normalize_legacy_installation_operations(integer)',
    '_max_idle_seconds integer DEFAULT 240', 'jsonb', 'v')
), fn_811 AS (
  SELECT s.fn, s.expected_signature, s.expected_args, s.expected_result, s.expected_volatility,
    (CASE WHEN s.fn = 'reconcile' THEN (SELECT count(*) FROM fn_reconcile) ELSE (SELECT count(*) FROM fn_normalize) END) AS overload_count,
    (CASE WHEN s.fn = 'reconcile' THEN (SELECT oid FROM fn_reconcile LIMIT 1) ELSE (SELECT oid FROM fn_normalize LIMIT 1) END) AS oid,
    to_regprocedure('public.' || s.expected_signature) AS resolved_oid
  FROM fn_811_specs s
), fn_detail AS (
  SELECT f.*,
    p.prolang, p.provolatile, p.prosecdef, p.proconfig, p.proowner, p.proacl,
    pg_get_function_arguments(p.oid) AS actual_args,
    pg_get_function_result(p.oid) AS actual_result,
    pg_get_functiondef(p.oid) AS functiondef,
    l.lanname
  FROM fn_811 f
  LEFT JOIN pg_proc p ON p.oid = f.oid
  LEFT JOIN pg_language l ON l.oid = p.prolang
), checks AS (
  SELECT 1 ord, 'ledger: 1.4.10 ausente, 1.4.11 presente, recuperação ausente' check_name, CASE WHEN has_1411 AND NOT has_1410 AND NOT has_recovery THEN 'PASS' ELSE 'FAIL' END status FROM facts
  UNION ALL SELECT 2, 'objetos 1.4.10 integralmente ausentes', CASE WHEN NOT has_table AND NOT has_any_reconciliation_rpc THEN 'PASS' ELSE 'FAIL' END FROM facts
  UNION ALL SELECT 3, 'dependências anteriores e 1.4.11 presentes', CASE WHEN has_installations AND has_operations AND has_super_admin AND has_1411_reconcile AND has_1411_normalize THEN 'PASS' ELSE 'FAIL' END FROM facts
  UNION ALL SELECT 4, 'nenhuma operação ativa ou retomável', CASE WHEN no_active_operations THEN 'PASS' ELSE 'FAIL' END FROM facts

  -- 1.4.11: assinatura exata, sem overloads e resolução idêntica ao catálogo
  UNION ALL SELECT 5, '1.4.11 ' || fn || ': assinatura exata sem overload',
    CASE WHEN overload_count = 1 AND oid IS NOT NULL AND resolved_oid IS NOT NULL AND resolved_oid = oid THEN 'PASS' ELSE 'FAIL' END
  FROM fn_811

  -- 1.4.11: pg_get_functiondef íntegro (não truncado) com cláusulas críticas de segurança preservadas
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

  -- 1.4.11: linguagem, retorno, volatilidade e argumentos (nomes, tipos e defaults) exatos
  UNION ALL SELECT 7, '1.4.11 ' || fn || ': linguagem/retorno/volatilidade/argumentos exatos',
    CASE WHEN lanname = 'plpgsql' AND actual_result = expected_result AND provolatile = expected_volatility
      AND actual_args = expected_args THEN 'PASS' ELSE 'FAIL' END
  FROM fn_detail

  -- 1.4.11: SECURITY DEFINER ativo e search_path fixado exatamente em 'public', sem entradas extras
  UNION ALL SELECT 8, '1.4.11 ' || fn || ': SECURITY DEFINER e search_path=public exato',
    CASE WHEN prosecdef IS TRUE AND proconfig IS NOT NULL
      AND array_length(proconfig, 1) = 1 AND proconfig[1] = 'search_path=public' THEN 'PASS' ELSE 'FAIL' END
  FROM fn_detail

  -- 1.4.11: owner igual ao das demais RPCs do control-plane (mesma origem de migration)
  UNION ALL SELECT 9, '1.4.11 ' || fn || ': owner alinhado ao control-plane',
    CASE WHEN proowner IS NOT NULL AND proowner = (SELECT proowner FROM pg_proc WHERE oid = to_regprocedure('public.is_super_admin(uuid)')) THEN 'PASS' ELSE 'FAIL' END
  FROM fn_detail

  -- 1.4.11: ACL expandida: apenas service_role com EXECUTE, PUBLIC/anon/authenticated sem acesso
  UNION ALL SELECT 10, '1.4.11 ' || fn || ': ACL restrita ao service_role',
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

  -- 1.4.11: dependências de catálogo (tabelas/RPCs consumidas) presentes e resolvíveis
  UNION ALL SELECT 11, '1.4.11 reconcile: dependências de catálogo presentes',
    CASE WHEN to_regclass('public.installation_operations') IS NOT NULL
      AND to_regclass('public.installation_operation_migrations') IS NOT NULL THEN 'PASS' ELSE 'FAIL' END
  UNION ALL SELECT 12, '1.4.11 normalize: dependências de catálogo presentes',
    CASE WHEN to_regclass('public.installation_operations') IS NOT NULL
      AND to_regclass('public.installation_operation_attempts') IS NOT NULL
      AND to_regclass('public.installations') IS NOT NULL THEN 'PASS' ELSE 'FAIL' END
)
SELECT ord, check_name, status FROM checks ORDER BY ord;
