CREATE OR REPLACE FUNCTION public.reconcile_installation_operation_migrations(
  _operation_id uuid,
  _owner text,
  _fencing_token bigint,
  _migrations jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _saved integer := 0;
BEGIN
  IF jsonb_typeof(_migrations) <> 'array' THEN
    RAISE EXCEPTION 'Inventário de migrations inválido' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.installation_operations
    WHERE id = _operation_id
      AND status = 'running'
      AND lease_owner = _owner
      AND fencing_token = _fencing_token
      AND lease_expires_at > now()
    FOR UPDATE
  ) THEN
    RAISE EXCEPTION 'Lease da operação inválido' USING ERRCODE = '55000';
  END IF;

  WITH incoming AS (
    SELECT
      value->>'file' AS migration_file,
      value->>'fingerprint' AS fingerprint,
      (value->>'position')::integer AS package_position,
      greatest(0, (value->>'statementIndex')::integer) AS statement_index,
      greatest(0, (value->>'totalStatements')::integer) AS total_statements,
      coalesce((value->>'completed')::boolean, false) AS completed
    FROM jsonb_array_elements(_migrations)
    WHERE coalesce(value->>'file', '') <> ''
      AND coalesce(value->>'fingerprint', '') <> ''
      AND (value->>'position')::integer > 0
      AND (value->>'statementIndex')::integer >= 0
      AND (value->>'totalStatements')::integer >= (value->>'statementIndex')::integer
  ), saved AS (
    INSERT INTO public.installation_operation_migrations (
      operation_id, migration_file, fingerprint, package_position,
      statement_index, total_statements, status, confirmed_at
    )
    SELECT
      _operation_id, migration_file, fingerprint, package_position,
      statement_index, total_statements,
      CASE WHEN completed THEN 'completed' ELSE 'running' END,
      CASE WHEN completed THEN now() ELSE NULL END
    FROM incoming
    ON CONFLICT (operation_id, migration_file, fingerprint) DO UPDATE
    SET statement_index = greatest(public.installation_operation_migrations.statement_index, excluded.statement_index),
        status = CASE
          WHEN public.installation_operation_migrations.status = 'completed' OR excluded.status = 'completed' THEN 'completed'
          ELSE 'running'
        END,
        confirmed_at = CASE
          WHEN public.installation_operation_migrations.status = 'completed' OR excluded.status = 'completed'
            THEN coalesce(public.installation_operation_migrations.confirmed_at, now())
          ELSE NULL
        END,
        updated_at = now()
    WHERE public.installation_operation_migrations.package_position = excluded.package_position
      AND public.installation_operation_migrations.total_statements = excluded.total_statements
    RETURNING 1
  ) SELECT count(*) INTO _saved FROM saved;

  UPDATE public.installation_operations
  SET heartbeat_at = now(), last_report_at = now(),
      metrics = coalesce(metrics, '{}'::jsonb) || jsonb_build_object(
        'confirmedMigrations', (
          SELECT count(*) FROM public.installation_operation_migrations
          WHERE operation_id = _operation_id AND status = 'completed'
        ),
        'lastMigrationReconciledAt', now()
      )
  WHERE id = _operation_id
    AND status = 'running'
    AND lease_owner = _owner
    AND fencing_token = _fencing_token;

  RETURN _saved;
END;
$$;
REVOKE ALL ON FUNCTION public.reconcile_installation_operation_migrations(uuid,text,bigint,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_installation_operation_migrations(uuid,text,bigint,jsonb) TO service_role;