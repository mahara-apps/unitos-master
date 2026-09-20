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
    to_regclass('public.installation_operations_freeze') IS NOT NULL AS has_freeze_table,
    to_regprocedure('public.read_installation_operations_freeze()') IS NOT NULL AS has_freeze_rpc,
    coalesce((SELECT frozen FROM public.installation_operations_freeze WHERE singleton IS TRUE), false) AS freeze_active,
    NOT EXISTS (
      SELECT 1 FROM public.installation_operations
      WHERE status = 'running' OR status = 'retryable'
        OR lease_owner IS NOT NULL OR lease_expires_at IS NOT NULL
        OR status IS NULL
        OR status NOT IN ('pending','running','retryable','blocked','manual_review','success','failed')
    ) AND NOT EXISTS (
      SELECT 1 FROM public.installation_operation_attempts a
      LEFT JOIN public.installation_operations o ON o.id = a.operation_id
      WHERE o.id IS NULL OR a.status = 'running'
        OR a.status IS NULL
        OR a.status NOT IN ('running','retryable','completed','failed','exhausted','orphaned')
        OR (a.status = 'retryable' AND o.status IN ('pending','running','retryable'))
    ) AS no_unsafe_activity,
    count(*) FILTER (WHERE status = 'pending' AND lease_owner IS NULL AND lease_expires_at IS NULL) AS queued_preserved
    FROM public.installation_operations
), fn_811(fn, expected_signature, expected_arg_names, expected_arg_types, expected_result, expected_body_md5) AS (VALUES
  ('reconcile', 'reconcile_installation_operation_migrations(uuid,text,bigint,jsonb)', ARRAY['_operation_id','_owner','_fencing_token','_migrations']::text[], ARRAY['uuid','text','bigint','jsonb']::text[], 'integer', 'abd43a4ec03634e6c9552eced6b7efe4'),
  ('normalize', 'normalize_legacy_installation_operations(integer)', ARRAY['_max_idle_seconds']::text[], ARRAY['integer']::text[], 'jsonb', '29f2435ed1a84f4a6f34cff166d4cd7d')
), fn_detail AS (
  SELECT s.fn, s.expected_signature, s.expected_arg_names, s.expected_arg_types, s.expected_result, s.expected_body_md5,
    p.oid, p.prolang, p.prokind, p.provolatile, p.proisstrict, p.proleakproof,
    p.proparallel, p.pronargs, p.pronargdefaults, p.prosecdef, p.proconfig, p.proowner, p.proacl, p.prosrc,
    (SELECT count(*) FROM pg_proc pp JOIN pg_namespace nn ON nn.oid = pp.pronamespace
       WHERE nn.nspname = 'public' AND pp.proname = split_part(s.expected_signature, '(', 1)) AS overload_count,
    ARRAY(
      SELECT p.proargnames[i]
      FROM generate_series(1, p.pronargs::integer) AS i
      ORDER BY i
    ) AS actual_arg_names,
    ARRAY(
      SELECT format_type(p.proargtypes[i], NULL)
      FROM generate_series(0, p.pronargs::integer - 1) AS i
      ORDER BY i
    ) AS actual_arg_types,
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
  UNION ALL SELECT 4, 'pending sem lease preservadas; nenhuma atividade incompatível (' || queued_preserved::text || ' preservadas)', CASE WHEN no_unsafe_activity THEN 'PASS' ELSE 'FAIL' END FROM facts

  -- 1.4.11: assinatura exata, sem overloads (reconcile_overloads=1 AND normalize_overloads=1)
  UNION ALL SELECT 5, '1.4.11: assinaturas exatas sem overload',
    CASE WHEN (SELECT reconcile_overloads FROM overloads) = 1 AND (SELECT normalize_overloads FROM overloads) = 1 THEN 'PASS' ELSE 'FAIL' END

  -- 1.4.11: definição completa disponível e corpo canônico integral, normalizado apenas por whitespace
  UNION ALL SELECT 6, '1.4.11 ' || fn || ': pg_get_functiondef e corpo canônico íntegros',
    CASE WHEN functiondef IS NOT NULL AND length(functiondef) >= 200
      AND md5(btrim(regexp_replace(prosrc, '\s+', ' ', 'g'))) = expected_body_md5
      THEN 'PASS' ELSE 'FAIL' END
  FROM fn_detail

  -- 1.4.11: nomes, tipos, ordem e quantidade dos argumentos são comparados
  -- separadamente no catálogo; não dependem da representação textual (nomeada
  -- ou sem nomes) produzida por pg_get_function_identity_arguments.
  UNION ALL SELECT 7, '1.4.11 ' || fn || ': linguagem, retorno, argumentos e propriedades exatos',
    CASE WHEN lanname = 'plpgsql' AND prokind = 'f' AND actual_result = expected_result
      AND pronargs = cardinality(expected_arg_types)
      AND actual_arg_names = expected_arg_names AND actual_arg_types = expected_arg_types
      AND provolatile = 'v'
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

  -- 1.4.11: ACL expandida via aclexplode: grantee=0 é PUBLIC; apenas service_role recebe EXECUTE
  UNION ALL SELECT 10, '1.4.11 ' || fn || ': ACL restrita ao service_role via aclexplode',
    CASE WHEN oid IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM aclexplode(coalesce(proacl, acldefault('f', proowner))) g
        WHERE g.privilege_type = 'EXECUTE' AND g.grantee = 'service_role'::regrole::oid
      )
      AND NOT EXISTS (
        SELECT 1 FROM aclexplode(coalesce(proacl, acldefault('f', proowner))) g
        WHERE g.privilege_type = 'EXECUTE' AND g.grantee = 0
      )
      AND NOT EXISTS (
        SELECT 1 FROM aclexplode(coalesce(proacl, acldefault('f', proowner))) g
        WHERE g.privilege_type = 'EXECUTE'
          AND g.grantee IN ('anon'::regrole::oid, 'authenticated'::regrole::oid)
      )
      AND (
        SELECT count(*) FROM aclexplode(coalesce(proacl, acldefault('f', proowner))) g
        WHERE g.privilege_type = 'EXECUTE' AND g.grantee <> proowner
      ) = 1
    THEN 'PASS' ELSE 'FAIL' END
  FROM fn_detail

  -- 1.4.11: dependências estruturais da 1.4.11 presentes (tabelas consumidas por reconcile e normalize)
  UNION ALL SELECT 11, 'dependências estruturais da 1.4.11 presentes',
    CASE WHEN has_installations AND has_operations AND has_operation_migrations AND has_attempts THEN 'PASS' ELSE 'FAIL' END
  FROM facts
  UNION ALL SELECT 12, 'congelamento global instalado e ativo',
    CASE WHEN has_freeze_table AND has_freeze_rpc AND freeze_active THEN 'PASS' ELSE 'FAIL' END
  FROM facts
)
SELECT ord, check_name, status FROM checks ORDER BY ord;
