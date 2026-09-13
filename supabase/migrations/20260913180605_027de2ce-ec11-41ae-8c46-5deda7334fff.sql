ALTER TABLE public.installation_operations
  ADD COLUMN IF NOT EXISTS current_step text,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS fencing_token bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS error_detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS installation_operations_idempotency_uidx
  ON public.installation_operations (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

DROP INDEX IF EXISTS public.installation_operations_resume_idx;
CREATE INDEX installation_operations_resume_idx
  ON public.installation_operations (next_attempt_at, lease_expires_at, created_at)
  WHERE status IN ('pending', 'running', 'retryable');

CREATE OR REPLACE FUNCTION public.claim_installation_operation(
  _operation_id uuid,
  _owner text,
  _lease_seconds integer DEFAULT 180
)
RETURNS public.installation_operations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _operation public.installation_operations%ROWTYPE;
BEGIN
  IF coalesce(trim(_owner), '') = '' OR _lease_seconds < 30 OR _lease_seconds > 900 THEN
    RAISE EXCEPTION 'Parâmetros de lease inválidos' USING ERRCODE = '22023';
  END IF;

  UPDATE public.installation_operations
  SET lease_owner = _owner,
      lease_expires_at = now() + make_interval(secs => _lease_seconds),
      last_report_at = now(),
      status = 'running',
      next_attempt_at = NULL,
      attempt_count = attempt_count + 1,
      fencing_token = fencing_token + 1,
      metrics = coalesce(metrics, '{}'::jsonb) || jsonb_build_object(
        'lastClaimedAt', now(),
        'lastOwner', _owner
      )
  WHERE id = _operation_id
    AND status IN ('pending', 'running', 'retryable')
    AND coalesce(next_attempt_at, now()) <= now()
    AND (lease_owner = _owner OR lease_expires_at IS NULL OR lease_expires_at <= now())
    AND attempt_count < max_attempts
  RETURNING * INTO _operation;

  RETURN _operation;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_stale_installation_operations(
  _owner text,
  _limit integer DEFAULT 3,
  _lease_seconds integer DEFAULT 180
)
RETURNS SETOF public.installation_operations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(trim(_owner), '') = '' OR _limit < 1 OR _limit > 20
     OR _lease_seconds < 30 OR _lease_seconds > 900 THEN
    RAISE EXCEPTION 'Parâmetros de lease inválidos' USING ERRCODE = '22023';
  END IF;

  UPDATE public.installation_operations op
  SET status = 'manual_review',
      finished_at = now(),
      lease_owner = NULL,
      lease_expires_at = NULL,
      error_kind = 'attempts_exhausted',
      summary = 'Limite de tentativas automáticas atingido. Revise o diagnóstico antes de tentar novamente.',
      error_detail = coalesce(op.error_detail, '{}'::jsonb) || jsonb_build_object('exhaustedAt', now())
  WHERE op.status IN ('pending', 'running', 'retryable')
    AND op.detail->>'automated' = 'true'
    AND op.attempt_count >= op.max_attempts
    AND coalesce(op.lease_expires_at, op.next_attempt_at, op.last_report_at, op.started_at) <= now();

  UPDATE public.installations i
  SET status = 'attention',
      health = 'degraded',
      active_operation_id = NULL,
      last_error = 'A automação atingiu o limite de tentativas e precisa de revisão manual.',
      updated_at = now()
  WHERE EXISTS (
    SELECT 1 FROM public.installation_operations op
    WHERE op.id = i.active_operation_id AND op.status = 'manual_review'
  );

  RETURN QUERY
  WITH candidates AS (
    SELECT id
    FROM public.installation_operations
    WHERE status IN ('pending', 'running', 'retryable')
      AND detail->>'automated' = 'true'
      AND attempt_count < max_attempts
      AND coalesce(next_attempt_at, now()) <= now()
      AND (lease_expires_at IS NULL OR lease_expires_at <= now())
    ORDER BY coalesce(next_attempt_at, lease_expires_at, last_report_at, started_at), created_at
    FOR UPDATE SKIP LOCKED
    LIMIT _limit
  )
  UPDATE public.installation_operations op
  SET lease_owner = _owner,
      lease_expires_at = now() + make_interval(secs => _lease_seconds),
      last_report_at = now(),
      status = 'running',
      next_attempt_at = NULL,
      attempt_count = op.attempt_count + 1,
      fencing_token = op.fencing_token + 1,
      summary = CASE WHEN op.attempt_count = 0
        THEN 'Operação automática iniciada pelo executor do MASTER.'
        ELSE 'Operação automática retomada pelo executor do MASTER.' END,
      metrics = coalesce(op.metrics, '{}'::jsonb) || jsonb_build_object(
        'lastClaimedAt', now(),
        'lastOwner', _owner
      )
  FROM candidates
  WHERE op.id = candidates.id
  RETURNING op.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.heartbeat_installation_operation(
  _operation_id uuid,
  _owner text,
  _fencing_token bigint,
  _lease_seconds integer DEFAULT 180
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH renewed AS (
    UPDATE public.installation_operations
    SET lease_expires_at = now() + make_interval(secs => _lease_seconds),
        last_report_at = now()
    WHERE id = _operation_id
      AND status = 'running'
      AND lease_owner = _owner
      AND fencing_token = _fencing_token
      AND lease_expires_at > now()
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM renewed)
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
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH saved AS (
    UPDATE public.installation_operations
    SET steps = _steps,
        detail = _detail,
        current_step = _current_step,
        summary = coalesce(_summary, summary),
        metrics = coalesce(metrics, '{}'::jsonb) || coalesce(_metrics, '{}'::jsonb),
        last_report_at = now()
    WHERE id = _operation_id
      AND status = 'running'
      AND lease_owner = _owner
      AND fencing_token = _fencing_token
      AND lease_expires_at > now()
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM saved)
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
    SET status = CASE WHEN attempt_count >= max_attempts THEN 'manual_review' ELSE 'retryable' END,
        next_attempt_at = CASE WHEN attempt_count >= max_attempts THEN NULL ELSE now() + make_interval(secs => _delay_seconds) END,
        lease_owner = NULL,
        lease_expires_at = NULL,
        error_kind = _error_kind,
        summary = _summary,
        error_detail = coalesce(error_detail, '{}'::jsonb) || coalesce(_error_detail, '{}'::jsonb),
        last_report_at = now(),
        finished_at = CASE WHEN attempt_count >= max_attempts THEN now() ELSE NULL END
    WHERE id = _operation_id
      AND status = 'running'
      AND lease_owner = _owner
      AND fencing_token = _fencing_token
    RETURNING 1
  ) SELECT EXISTS(SELECT 1 FROM changed) INTO _saved;
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
DECLARE
  _installation_id uuid;
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
      lease_owner = NULL,
      lease_expires_at = NULL,
      run_token_hash = NULL,
      finished_at = now(),
      last_report_at = now()
  WHERE id = _operation_id
    AND status = 'running'
    AND lease_owner = _owner
    AND fencing_token = _fencing_token
  RETURNING installation_id INTO _installation_id;

  IF _installation_id IS NULL THEN RETURN false; END IF;

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

REVOKE ALL ON FUNCTION public.claim_installation_operation(uuid, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_stale_installation_operations(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.heartbeat_installation_operation(uuid, text, bigint, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.checkpoint_installation_operation(uuid, text, bigint, jsonb, jsonb, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.retry_installation_operation(uuid, text, bigint, integer, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_installation_operation(uuid, text, bigint, text, text, text, jsonb, jsonb, text, text, jsonb, text, boolean, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_installation_operation(uuid, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_stale_installation_operations(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.heartbeat_installation_operation(uuid, text, bigint, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.checkpoint_installation_operation(uuid, text, bigint, jsonb, jsonb, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.retry_installation_operation(uuid, text, bigint, integer, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_installation_operation(uuid, text, bigint, text, text, text, jsonb, jsonb, text, text, jsonb, text, boolean, boolean) TO service_role;