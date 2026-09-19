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
), fn_811_specs(fn, expected_signature, expected_args, expected_result, expected_volatility, expected_body_md5) AS (VALUES
  ('reconcile', 'reconcile_installation_operation_migrations(uuid,text,bigint,jsonb)',
    '_operation_id uuid, _owner text, _fencing_token bigint, _migrations jsonb', 'integer', 'v', 'abd43a4ec03634e6c9552eced6b7efe4'),
  ('normalize', 'normalize_legacy_installation_operations(integer)',
    '_max_idle_seconds integer DEFAULT 240', 'jsonb', 'v', '29f2435ed1a84f4a6f34cff166d4cd7d')
), fn_811 AS (
  SELECT s.fn, s.expected_signature, s.expected_args, s.expected_result, s.expected_volatility, s.expected_body_md5,
    (CASE WHEN s.fn = 'reconcile' THEN (SELECT count(*) FROM fn_reconcile) ELSE (SELECT count(*) FROM fn_normalize) END) AS overload_count,
    (CASE WHEN s.fn = 'reconcile' THEN (SELECT oid FROM fn_reconcile LIMIT 1) ELSE (SELECT oid FROM fn_normalize LIMIT 1) END) AS oid,
    to_regprocedure('public.' || s.expected_signature) AS resolved_oid
  FROM fn_811_specs s
), fn_detail AS (
  SELECT f.*,
    p.prolang, p.prokind, p.provolatile, p.proisstrict, p.proleakproof, p.proparallel,
    p.pronargdefaults, p.prosecdef, p.proconfig, p.proowner, p.proacl, p.prosrc,
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

  -- 1.4.11: definição completa disponível e corpo canônico integral, normalizado apenas por whitespace
  UNION ALL SELECT 6, '1.4.11 ' || fn || ': pg_get_functiondef e corpo canônico íntegros',
    CASE WHEN functiondef IS NOT NULL AND length(functiondef) >= 200
      AND md5(btrim(regexp_replace(prosrc, '\s+', ' ', 'g'))) = expected_body_md5
      THEN 'PASS' ELSE 'FAIL' END
  FROM fn_detail

  -- 1.4.11: linguagem, retorno, volatilidade e argumentos (nomes, tipos e defaults) exatos
  UNION ALL SELECT 7, '1.4.11 ' || fn || ': linguagem/retorno/volatilidade/argumentos exatos',
    CASE WHEN lanname = 'plpgsql' AND prokind = 'f' AND actual_result = expected_result
      AND provolatile = expected_volatility AND proisstrict IS FALSE AND proleakproof IS FALSE
      AND proparallel = 'u' AND pronargdefaults = CASE WHEN fn='normalize' THEN 1 ELSE 0 END
      AND actual_args = expected_args THEN 'PASS' ELSE 'FAIL' END
  FROM fn_detail

  -- 1.4.11: SECURITY DEFINER ativo e search_path fixado exatamente em 'public', sem entradas extras
  UNION ALL SELECT 8, '1.4.11 ' || fn || ': SECURITY DEFINER e search_path=public exato',
    CASE WHEN prosecdef IS TRUE AND proconfig IS NOT NULL
      AND array_length(proconfig, 1) = 1 AND proconfig[1] = 'search_path=public' THEN 'PASS' ELSE 'FAIL' END
  FROM fn_detail

  -- 1.4.11: owner canônico criado pelo executor de migrations da Supabase
  UNION ALL SELECT 9, '1.4.11 ' || fn || ': owner canônico postgres',
    CASE WHEN pg_get_userbyid(proowner) = 'postgres' THEN 'PASS' ELSE 'FAIL' END
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
        WHERE g.privilege_type = 'EXECUTE' AND (g.grantee <> proowner OR g.grantor <> proowner)
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
