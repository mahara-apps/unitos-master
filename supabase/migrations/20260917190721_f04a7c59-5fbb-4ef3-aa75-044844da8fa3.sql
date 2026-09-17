-- MASTER 1.4.11: promoção legada fail-closed e normalização sem executar SQL Client.
CREATE OR REPLACE FUNCTION public.reconcile_installation_operation_migrations(
  _operation_id uuid, _owner text, _fencing_token bigint, _migrations jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _expected integer;
  _saved integer := 0;
BEGIN
  IF jsonb_typeof(_migrations) <> 'array' THEN
    RAISE EXCEPTION 'Inventário de migrations inválido' USING ERRCODE = '22023';
  END IF;
  SELECT jsonb_array_length(_migrations) INTO _expected;
  IF NOT EXISTS (
    SELECT 1 FROM public.installation_operations
    WHERE id = _operation_id AND status = 'running' AND lease_owner = _owner
      AND fencing_token = _fencing_token AND lease_expires_at > now()
    FOR UPDATE
  ) THEN
    RAISE EXCEPTION 'Lease da operação inválido' USING ERRCODE = '55000';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(_migrations) value
    WHERE coalesce(value->>'file', '') = ''
       OR coalesce(value->>'fingerprint', '') !~ '^[a-z0-9-]+$'
       OR coalesce(value->>'position', '') !~ '^[1-9][0-9]*$'
       OR coalesce(value->>'statementIndex', '') !~ '^[0-9]+$'
       OR coalesce(value->>'totalStatements', '') !~ '^[0-9]+$'
       OR (value->>'statementIndex')::integer <> (value->>'totalStatements')::integer
       OR coalesce((value->>'completed')::boolean, false) IS NOT TRUE
  ) THEN
    RAISE EXCEPTION 'Inventário contém migration incompleta ou inválida' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM (
      SELECT value->>'file' AS file, value->>'fingerprint' AS fingerprint,
             (value->>'position')::integer AS position, count(*) AS amount
      FROM jsonb_array_elements(_migrations) value GROUP BY 1,2,3
    ) duplicated WHERE duplicated.amount <> 1
  ) OR EXISTS (
    SELECT 1 FROM (
      SELECT (value->>'position')::integer AS position, count(*) AS amount
      FROM jsonb_array_elements(_migrations) value GROUP BY 1
    ) duplicated WHERE duplicated.amount <> 1
  ) THEN
    RAISE EXCEPTION 'Inventário contém migrations duplicadas' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(_migrations) value
    JOIN public.installation_operation_migrations existing
      ON existing.operation_id = _operation_id
     AND (existing.package_position = (value->>'position')::integer
       OR (existing.migration_file = value->>'file' AND existing.fingerprint = value->>'fingerprint'))
    WHERE existing.package_position <> (value->>'position')::integer
       OR existing.migration_file <> value->>'file'
       OR existing.fingerprint <> value->>'fingerprint'
       OR existing.total_statements <> (value->>'totalStatements')::integer
  ) THEN
    RAISE EXCEPTION 'Reconciliação divergiu do pacote fixado' USING ERRCODE = 'P0001';
  END IF;
  WITH incoming AS (
    SELECT value->>'file' AS migration_file, value->>'fingerprint' AS fingerprint,
           (value->>'position')::integer AS package_position,
           (value->>'totalStatements')::integer AS total_statements
    FROM jsonb_array_elements(_migrations) value
  ), saved AS (
    INSERT INTO public.installation_operation_migrations (
      operation_id, migration_file, fingerprint, package_position,
      statement_index, total_statements, status, confirmed_at
    )
    SELECT _operation_id, migration_file, fingerprint, package_position,
           total_statements, total_statements, 'completed', now()
    FROM incoming
    ON CONFLICT (operation_id, migration_file, fingerprint) DO UPDATE
    SET statement_index = excluded.total_statements, status = 'completed',
        confirmed_at = coalesce(public.installation_operation_migrations.confirmed_at, now()),
        updated_at = now()
    RETURNING 1
  ) SELECT count(*) INTO _saved FROM saved;
  IF _saved <> _expected THEN
    RAISE EXCEPTION 'Reconciliação parcial rejeitada: esperado %, persistido %', _expected, _saved USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.installation_operations
  SET heartbeat_at = now(), last_report_at = now(),
      metrics = coalesce(metrics, '{}'::jsonb) || jsonb_build_object(
        'confirmedMigrations', (SELECT count(*) FROM public.installation_operation_migrations WHERE operation_id = _operation_id AND status = 'completed'),
        'lastMigrationReconciledAt', now())
  WHERE id = _operation_id AND status = 'running' AND lease_owner = _owner
    AND fencing_token = _fencing_token AND lease_expires_at > now();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lease perdido durante a reconciliação' USING ERRCODE = '55000';
  END IF;
  RETURN _saved;
END;
$$;
REVOKE ALL ON FUNCTION public.reconcile_installation_operation_migrations(uuid,text,bigint,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_installation_operation_migrations(uuid,text,bigint,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.normalize_legacy_installation_operations(_max_idle_seconds integer DEFAULT 240)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _leases integer := 0;
  _attempts integer := 0;
  _manual integer := 0;
BEGIN
  IF _max_idle_seconds < 30 OR _max_idle_seconds > 86400 THEN
    RAISE EXCEPTION 'Janela de normalização inválida' USING ERRCODE = '22023';
  END IF;
  WITH normalized AS (
    UPDATE public.installation_operations op
    SET status = 'manual_review', lease_owner = NULL, lease_expires_at = NULL,
        next_attempt_at = NULL, next_command = NULL, finished_at = coalesce(finished_at, now()),
        error_kind = coalesce(error_kind, 'legacy_lease_inconsistent'),
        blocked_reason = 'legacy_lease_inconsistent',
        summary = 'Operação histórica bloqueada: lease_owner existe sem expiração verificável.',
        error_detail = coalesce(error_detail, '{}'::jsonb) || jsonb_build_object('normalizedAt', now(), 'reason', 'lease_owner_without_expiration'),
        last_report_at = now()
    WHERE op.status IN ('pending','running','retryable') AND op.lease_owner IS NOT NULL AND op.lease_expires_at IS NULL
    RETURNING op.id
  ) SELECT count(*) INTO _leases FROM normalized;
  WITH closed AS (
    UPDATE public.installation_operation_attempts a
    SET status = 'orphaned', error_kind = coalesce(a.error_kind, 'orphaned_attempt'),
        error_message = coalesce(a.error_message, 'Tentativa histórica encerrada pela normalização P0.'),
        retryable = false, finished_at = coalesce(a.finished_at, now()), heartbeat_at = now(), updated_at = now()
    FROM public.installation_operations op
    WHERE a.operation_id = op.id AND a.status = 'running'
      AND a.heartbeat_at <= now() - make_interval(secs => _max_idle_seconds)
      AND (op.status NOT IN ('pending','running','retryable') OR op.fencing_token <> a.fencing_token
        OR op.lease_expires_at IS NULL OR op.lease_expires_at <= now())
    RETURNING a.id
  ) SELECT count(*) INTO _attempts FROM closed;
  WITH detached AS (
    UPDATE public.installations i
    SET status = 'attention', health = 'degraded', active_operation_id = NULL,
        last_error = coalesce(op.summary, 'Operação histórica requer revisão manual.'), updated_at = now()
    FROM public.installation_operations op
    WHERE i.active_operation_id = op.id AND op.status = 'manual_review'
    RETURNING i.id
  ) SELECT count(*) INTO _manual FROM detached;
  RETURN jsonb_build_object('normalizedLeases', _leases, 'orphanedAttempts', _attempts,
    'detachedManualReview', _manual, 'migrationsExecuted', 0);
END;
$$;
REVOKE ALL ON FUNCTION public.normalize_legacy_installation_operations(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_legacy_installation_operations(integer) TO service_role;