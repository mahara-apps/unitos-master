CREATE TABLE IF NOT EXISTS public.installation_operation_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL REFERENCES public.installation_operations(id) ON DELETE CASCADE,
  attempt_number integer NOT NULL,
  owner text NOT NULL,
  fencing_token bigint NOT NULL,
  status text NOT NULL DEFAULT 'running',
  error_kind text,
  error_code text,
  error_message text,
  retryable boolean,
  started_at timestamptz NOT NULL DEFAULT now(),
  heartbeat_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operation_id, attempt_number),
  UNIQUE (operation_id, fencing_token)
);
GRANT SELECT ON public.installation_operation_attempts TO authenticated;
GRANT ALL ON public.installation_operation_attempts TO service_role;
ALTER TABLE public.installation_operation_attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS installation_operation_attempts_super_admin_read ON public.installation_operation_attempts;
CREATE POLICY installation_operation_attempts_super_admin_read
ON public.installation_operation_attempts FOR SELECT TO authenticated
USING (public.is_super_admin(auth.uid()));
CREATE INDEX IF NOT EXISTS installation_operation_attempts_active_idx
ON public.installation_operation_attempts(operation_id, heartbeat_at)
WHERE status = 'running';

UPDATE public.installation_operation_attempts a
SET status = 'orphaned',
    error_kind = coalesce(a.error_kind, 'orphaned_attempt'),
    error_message = coalesce(a.error_message, 'Tentativa antiga encerrada pela reconciliação 1.3.93; histórico preservado.'),
    retryable = false,
    finished_at = coalesce(a.finished_at, now()),
    heartbeat_at = now(),
    updated_at = now()
FROM public.installation_operations o
WHERE a.operation_id = o.id
  AND a.status = 'running'
  AND (
    o.status NOT IN ('pending', 'running', 'retryable')
    OR o.fencing_token <> a.fencing_token
    OR (o.lease_expires_at IS NULL AND o.lease_owner IS NULL)
    OR o.lease_expires_at <= now()
  );

CREATE OR REPLACE FUNCTION public.reconcile_orphan_installation_attempts(_max_idle_seconds integer DEFAULT 240)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _count integer;
BEGIN
  IF _max_idle_seconds < 30 OR _max_idle_seconds > 86400 THEN
    RAISE EXCEPTION 'Janela de reconciliação inválida' USING ERRCODE = '22023';
  END IF;
  WITH closed AS (
    UPDATE public.installation_operation_attempts a
    SET status = 'orphaned',
        error_kind = coalesce(a.error_kind, 'orphaned_attempt'),
        error_message = coalesce(a.error_message, 'Tentativa sem lease ativo encerrada por reconciliação.'),
        retryable = false,
        finished_at = coalesce(a.finished_at, now()),
        heartbeat_at = now(),
        updated_at = now()
    FROM public.installation_operations o
    WHERE a.operation_id = o.id
      AND a.status = 'running'
      AND a.heartbeat_at <= now() - make_interval(secs => _max_idle_seconds)
      AND (
        o.status NOT IN ('pending', 'running', 'retryable')
        OR o.fencing_token <> a.fencing_token
        OR o.lease_expires_at IS NULL
        OR o.lease_expires_at <= now()
      )
    RETURNING a.id
  ) SELECT count(*) INTO _count FROM closed;
  RETURN _count;
END;
$$;
REVOKE ALL ON FUNCTION public.reconcile_orphan_installation_attempts(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_orphan_installation_attempts(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.heartbeat_installation_operation(
  _operation_id uuid,
  _owner text,
  _fencing_token bigint,
  _lease_seconds integer DEFAULT 180
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _saved boolean;
BEGIN
  WITH renewed AS (
    UPDATE public.installation_operations
    SET lease_expires_at = now() + make_interval(secs => _lease_seconds),
        heartbeat_at = now(),
        last_report_at = now()
    WHERE id = _operation_id
      AND status = 'running'
      AND lease_owner = _owner
      AND fencing_token = _fencing_token
      AND lease_expires_at > now()
    RETURNING id, fencing_token
  ), touched_attempt AS (
    UPDATE public.installation_operation_attempts a
    SET heartbeat_at = now(), updated_at = now()
    FROM renewed r
    WHERE a.operation_id = r.id
      AND a.fencing_token = r.fencing_token
      AND a.status = 'running'
    RETURNING a.id
  ) SELECT EXISTS (SELECT 1 FROM renewed) INTO _saved;
  RETURN _saved;
END;
$$;

CREATE OR REPLACE FUNCTION public.checkpoint_installation_operation(
  _operation_id uuid,
  _owner text,
  _fencing_token bigint,
  _steps jsonb,
  _detail jsonb,
  _current_step text,
  _summary text DEFAULT NULL,
  _metrics jsonb DEFAULT '{}'::jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _saved boolean;
BEGIN
  WITH saved AS (
    UPDATE public.installation_operations
    SET steps = _steps,
        detail = _detail,
        current_step = _current_step,
        summary = coalesce(_summary, summary),
        metrics = coalesce(metrics, '{}'::jsonb) || coalesce(_metrics, '{}'::jsonb),
        heartbeat_at = now(),
        last_report_at = now()
    WHERE id = _operation_id
      AND status = 'running'
      AND lease_owner = _owner
      AND fencing_token = _fencing_token
      AND lease_expires_at > now()
    RETURNING id, fencing_token
  ), touched_attempt AS (
    UPDATE public.installation_operation_attempts a
    SET heartbeat_at = now(),
        metrics = coalesce(a.metrics, '{}'::jsonb) || coalesce(_metrics, '{}'::jsonb),
        updated_at = now()
    FROM saved s
    WHERE a.operation_id = s.id
      AND a.fencing_token = s.fencing_token
      AND a.status = 'running'
    RETURNING a.id
  ) SELECT EXISTS (SELECT 1 FROM saved) INTO _saved;
  RETURN _saved;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_installation_operation(
  _operation_id uuid,
  _owner text,
  _fencing_token bigint,
  _operation_status text,
  _summary text,
  _error_kind text,
  _detail jsonb,
  _steps jsonb,
  _installation_status text,
  _health text,
  _health_checks jsonb,
  _current_version text DEFAULT NULL,
  _touch_provisioned boolean DEFAULT false,
  _touch_validated boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _installation_id uuid;
BEGIN
  IF _operation_status NOT IN ('success', 'failed', 'blocked', 'manual_review') THEN
    RAISE EXCEPTION 'Estado final inválido' USING ERRCODE = '22023';
  END IF;
  UPDATE public.installation_operations
  SET status = _operation_status,
      summary = _summary,
      error_kind = _error_kind,
      detail = _detail,
      steps = _steps,
      current_step = NULL,
      next_attempt_at = NULL,
      next_command = NULL,
      lease_owner = NULL,
      lease_expires_at = NULL,
      run_token_hash = NULL,
      finished_at = now(),
      heartbeat_at = now(),
      last_report_at = now()
  WHERE id = _operation_id
    AND status = 'running'
    AND lease_owner = _owner
    AND fencing_token = _fencing_token
  RETURNING installation_id INTO _installation_id;
  IF _installation_id IS NULL THEN RETURN false; END IF;

  UPDATE public.installation_operation_attempts
  SET status = CASE WHEN _operation_status = 'success' THEN 'completed' ELSE _operation_status END,
      error_kind = _error_kind,
      error_message = CASE WHEN _operation_status = 'success' THEN NULL ELSE _summary END,
      retryable = false,
      finished_at = now(),
      heartbeat_at = now(),
      updated_at = now()
  WHERE operation_id = _operation_id
    AND fencing_token = _fencing_token
    AND status = 'running';

  UPDATE public.installations
  SET status = _installation_status,
      health = _health,
      health_checks = _health_checks,
      health_checked_at = now(),
      active_operation_id = NULL,
      last_error = CASE WHEN _operation_status = 'success' THEN NULL ELSE _summary END,
      current_version = coalesce(_current_version, current_version),
      last_provisioned_at = CASE WHEN _touch_provisioned THEN now() ELSE last_provisioned_at END,
      last_validated_at = CASE WHEN _touch_validated THEN now() ELSE last_validated_at END,
      updated_at = now()
  WHERE id = _installation_id AND active_operation_id = _operation_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.heartbeat_installation_operation(uuid,text,bigint,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.checkpoint_installation_operation(uuid,text,bigint,jsonb,jsonb,text,text,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_installation_operation(uuid,text,bigint,text,text,text,jsonb,jsonb,text,text,jsonb,text,boolean,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.heartbeat_installation_operation(uuid,text,bigint,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.checkpoint_installation_operation(uuid,text,bigint,jsonb,jsonb,text,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_installation_operation(uuid,text,bigint,text,text,text,jsonb,jsonb,text,text,jsonb,text,boolean,boolean) TO service_role;