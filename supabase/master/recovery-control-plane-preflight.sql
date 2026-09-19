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
), fn_811(fn, expected_signature, expected_identity_args, expected_result, expected_body_md5) AS (VALUES
  ('reconcile', 'reconcile_installation_operation_migrations(uuid,text,bigint,jsonb)', 'uuid, text, bigint, jsonb', 'integer', 'abd43a4ec03634e6c9552eced6b7efe4'),
  ('normalize', 'normalize_legacy_installation_operations(integer)', 'integer', 'jsonb', '29f2435ed1a84f4a6f34cff166d4cd7d')
), fn_detail AS (
  SELECT s.fn, s.expected_signature, s.expected_identity_args, s.expected_result, s.expected_body_md5,
    p.oid, p.prolang, p.prokind, p.provolatile, p.proisstrict, p.proleakproof,
    p.proparallel, p.pronargdefaults, p.prosecdef, p.proconfig, p.proowner, p.proacl, p.prosrc,
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

  -- 1.4.11: definição completa disponível e corpo canônico integral, normalizado apenas por whitespace
  UNION ALL SELECT 6, '1.4.11 ' || fn || ': pg_get_functiondef e corpo canônico íntegros',
    CASE WHEN functiondef IS NOT NULL AND length(functiondef) >= 200
      AND md5(btrim(regexp_replace(prosrc, '\s+', ' ', 'g'))) = expected_body_md5
      THEN 'PASS' ELSE 'FAIL' END
  FROM fn_detail

  -- 1.4.11: linguagem, retorno, argumentos e demais propriedades exatas
  UNION ALL SELECT 7, '1.4.11 ' || fn || ': linguagem, retorno, argumentos e propriedades exatos',
    CASE WHEN lanname = 'plpgsql' AND prokind = 'f' AND actual_result = expected_result
      AND actual_identity_args = expected_identity_args AND provolatile = 'v'
      AND proisstrict IS FALSE AND proleakproof IS FALSE AND proparallel = 'u'
      AND pronargdefaults = CASE WHEN fn='normalize' THEN 1 ELSE 0 END
      THEN 'PASS' ELSE 'FAIL' END
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
        WHERE g.privilege_type = 'EXECUTE' AND (g.grantee <> proowner OR g.grantor <> proowner)
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
