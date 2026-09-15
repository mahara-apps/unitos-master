-- MASTER 1.3.95: consolida no histórico distribuível as funções já corrigidas no MASTER.
CREATE OR REPLACE FUNCTION public.yield_installation_operation(
  _operation_id uuid,
  _owner text,
  _fencing_token bigint,
  _delay_seconds integer DEFAULT 5
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _saved boolean;
BEGIN
  IF _delay_seconds < 0 OR _delay_seconds > 300 THEN
    RAISE EXCEPTION 'Atraso de continuação inválido' USING ERRCODE = '22023';
  END IF;
  WITH changed AS (
    UPDATE public.installation_operations
    SET status = 'pending',
        next_attempt_at = now() + make_interval(secs => _delay_seconds),
        lease_owner = NULL,
        lease_expires_at = NULL,
        last_report_at = now(),
        attempt_count = 0,
        error_kind = NULL,
        blocked_reason = NULL,
        finished_at = NULL,
        next_command = 'execute'
    WHERE id = _operation_id
      AND status = 'running'
      AND lease_owner = _owner
      AND fencing_token = _fencing_token
    RETURNING id, fencing_token
  ), closed_attempt AS (
    UPDATE public.installation_operation_attempts a
    SET status = 'completed', retryable = false, finished_at = now(), heartbeat_at = now()
    FROM changed c
    WHERE a.operation_id = c.id
      AND a.fencing_token = c.fencing_token
      AND a.status = 'running'
  ) SELECT EXISTS(SELECT 1 FROM changed) INTO _saved;
  RETURN _saved;
END
$$;

CREATE OR REPLACE FUNCTION public.retry_installation_operation(
  _operation_id uuid,
  _owner text,
  _fencing_token bigint,
  _delay_seconds integer,
  _error_kind text,
  _summary text,
  _error_detail jsonb DEFAULT '{}'::jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _saved boolean;
BEGIN
  IF _delay_seconds < 5 OR _delay_seconds > 86400 THEN
    RAISE EXCEPTION 'Atraso de nova tentativa inválido' USING ERRCODE = '22023';
  END IF;
  WITH changed AS (
    UPDATE public.installation_operations
    SET attempt_count = attempt_count + 1,
        status = CASE WHEN attempt_count + 1 >= max_attempts THEN 'manual_review' ELSE 'retryable' END,
        next_attempt_at = CASE WHEN attempt_count + 1 >= max_attempts THEN NULL ELSE now() + make_interval(secs => _delay_seconds) END,
        lease_owner = NULL,
        lease_expires_at = NULL,
        error_kind = _error_kind,
        blocked_reason = CASE WHEN attempt_count + 1 >= max_attempts THEN 'attempts_exhausted' ELSE NULL END,
        summary = CASE WHEN attempt_count + 1 >= max_attempts THEN 'Limite de falhas automáticas consecutivas atingido. Revise o diagnóstico antes de tentar novamente.' ELSE _summary END,
        error_detail = coalesce(error_detail, '{}'::jsonb) || coalesce(_error_detail, '{}'::jsonb),
        last_report_at = now(),
        finished_at = CASE WHEN attempt_count + 1 >= max_attempts THEN now() ELSE NULL END,
        next_command = CASE WHEN attempt_count + 1 >= max_attempts THEN NULL ELSE 'execute' END
    WHERE id = _operation_id
      AND status = 'running'
      AND lease_owner = _owner
      AND fencing_token = _fencing_token
    RETURNING id, attempt_count, status, fencing_token
  ), closed_attempt AS (
    UPDATE public.installation_operation_attempts a
    SET status = CASE WHEN c.status = 'manual_review' THEN 'exhausted' ELSE 'retryable' END,
        error_kind = _error_kind,
        error_message = _summary,
        retryable = c.status <> 'manual_review',
        finished_at = now(),
        heartbeat_at = now()
    FROM changed c
    WHERE a.operation_id = c.id
      AND a.fencing_token = c.fencing_token
      AND a.status = 'running'
  ) SELECT EXISTS(SELECT 1 FROM changed) INTO _saved;
  RETURN _saved;
END
$$;

CREATE OR REPLACE FUNCTION public.defer_installation_operation(
  _operation_id uuid,
  _owner text,
  _fencing_token bigint,
  _delay_seconds integer,
  _error_kind text,
  _summary text,
  _error_detail jsonb DEFAULT '{}'::jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _saved boolean;
BEGIN
  IF _delay_seconds < 5 OR _delay_seconds > 900 THEN
    RAISE EXCEPTION 'Atraso de reagendamento inválido' USING ERRCODE = '22023';
  END IF;
  WITH changed AS (
    UPDATE public.installation_operations
    SET status = 'pending',
        next_attempt_at = now() + make_interval(secs => _delay_seconds),
        lease_owner = NULL,
        lease_expires_at = NULL,
        error_kind = _error_kind,
        blocked_reason = NULL,
        summary = _summary,
        error_detail = coalesce(error_detail, '{}'::jsonb) || coalesce(_error_detail, '{}'::jsonb),
        last_report_at = now(),
        finished_at = NULL,
        next_command = 'execute'
    WHERE id = _operation_id
      AND status = 'running'
      AND lease_owner = _owner
      AND fencing_token = _fencing_token
    RETURNING id, fencing_token
  ), closed_attempt AS (
    UPDATE public.installation_operation_attempts a
    SET status = 'deferred', error_kind = _error_kind, error_message = _summary,
        retryable = true, finished_at = now(), heartbeat_at = now()
    FROM changed c
    WHERE a.operation_id = c.id
      AND a.fencing_token = c.fencing_token
      AND a.status = 'running'
  ) SELECT EXISTS(SELECT 1 FROM changed) INTO _saved;
  RETURN _saved;
END
$$;

CREATE OR REPLACE FUNCTION public.checkpoint_installation_migration(
  _operation_id uuid,
  _owner text,
  _fencing_token bigint,
  _migration_file text,
  _fingerprint text,
  _package_position integer,
  _statement_index integer,
  _total_statements integer,
  _completed boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _saved_count integer := 0;
BEGIN
  IF coalesce(_migration_file, '') = '' OR coalesce(_fingerprint, '') = ''
     OR _package_position < 1 OR _statement_index < 0 OR _total_statements < 0
     OR _statement_index > _total_statements THEN
    RAISE EXCEPTION 'Checkpoint de migration inválido' USING ERRCODE = '22023';
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
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.installation_operation_migrations
    WHERE operation_id = _operation_id
      AND package_position = _package_position
      AND (migration_file <> _migration_file OR fingerprint <> _fingerprint)
  ) OR EXISTS (
    SELECT 1 FROM public.installation_operation_migrations
    WHERE operation_id = _operation_id
      AND migration_file = _migration_file
      AND fingerprint = _fingerprint
      AND (package_position <> _package_position OR total_statements <> _total_statements)
  ) THEN
    RAISE EXCEPTION 'Checkpoint divergiu do pacote fixado' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.installation_operation_migrations (
    operation_id, migration_file, fingerprint, package_position,
    statement_index, total_statements, status, confirmed_at
  ) VALUES (
    _operation_id, _migration_file, _fingerprint, _package_position,
    _statement_index, _total_statements,
    CASE WHEN _completed THEN 'completed' ELSE 'running' END,
    CASE WHEN _completed THEN now() ELSE NULL END
  )
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
      updated_at = now();

  GET DIAGNOSTICS _saved_count = ROW_COUNT;
  IF _saved_count <> 1 THEN
    RAISE EXCEPTION 'Checkpoint de migration não foi persistido' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.installation_operations
  SET heartbeat_at = now(),
      last_report_at = now(),
      metrics = coalesce(metrics, '{}'::jsonb) || jsonb_build_object(
        'confirmedMigrations', (
          SELECT count(*) FROM public.installation_operation_migrations
          WHERE operation_id = _operation_id AND status = 'completed'
        ),
        'lastMigrationCheckpointAt', now()
      )
  WHERE id = _operation_id
    AND status = 'running'
    AND lease_owner = _owner
    AND fencing_token = _fencing_token;

  UPDATE public.installation_operation_attempts
  SET heartbeat_at = now(), updated_at = now()
  WHERE operation_id = _operation_id
    AND fencing_token = _fencing_token
    AND status = 'running';

  RETURN true;
END
$$;

REVOKE ALL ON FUNCTION public.yield_installation_operation(uuid,text,bigint,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.retry_installation_operation(uuid,text,bigint,integer,text,text,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.defer_installation_operation(uuid,text,bigint,integer,text,text,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.checkpoint_installation_migration(uuid,text,bigint,text,text,integer,integer,integer,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.yield_installation_operation(uuid,text,bigint,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.retry_installation_operation(uuid,text,bigint,integer,text,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.defer_installation_operation(uuid,text,bigint,integer,text,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.checkpoint_installation_migration(uuid,text,bigint,text,text,integer,integer,integer,boolean) TO service_role;