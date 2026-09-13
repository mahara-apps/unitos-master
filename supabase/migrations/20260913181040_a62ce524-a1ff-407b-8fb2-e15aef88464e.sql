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
DECLARE _operation public.installation_operations%ROWTYPE;
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
      fencing_token = fencing_token + 1,
      metrics = coalesce(metrics, '{}'::jsonb) || jsonb_build_object('lastClaimedAt', now(), 'lastOwner', _owner)
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
  IF coalesce(trim(_owner), '') = '' OR _limit < 1 OR _limit > 20 OR _lease_seconds < 30 OR _lease_seconds > 900 THEN
    RAISE EXCEPTION 'Parâmetros de lease inválidos' USING ERRCODE = '22023';
  END IF;
  UPDATE public.installation_operations op
  SET status = 'manual_review', finished_at = now(), lease_owner = NULL, lease_expires_at = NULL,
      error_kind = 'attempts_exhausted',
      summary = 'Limite de tentativas automáticas atingido. Revise o diagnóstico antes de tentar novamente.',
      error_detail = coalesce(op.error_detail, '{}'::jsonb) || jsonb_build_object('exhaustedAt', now())
  WHERE op.status IN ('pending', 'running', 'retryable') AND op.detail->>'automated' = 'true'
    AND op.attempt_count >= op.max_attempts
    AND coalesce(op.lease_expires_at, op.next_attempt_at, op.last_report_at, op.started_at) <= now();
  UPDATE public.installations i
  SET status = 'attention', health = 'degraded', active_operation_id = NULL,
      last_error = 'A automação atingiu o limite de tentativas e precisa de revisão manual.', updated_at = now()
  WHERE EXISTS (SELECT 1 FROM public.installation_operations op WHERE op.id = i.active_operation_id AND op.status = 'manual_review');
  RETURN QUERY
  WITH candidates AS (
    SELECT id FROM public.installation_operations
    WHERE status IN ('pending', 'running', 'retryable') AND detail->>'automated' = 'true'
      AND attempt_count < max_attempts AND coalesce(next_attempt_at, now()) <= now()
      AND (lease_expires_at IS NULL OR lease_expires_at <= now())
    ORDER BY coalesce(next_attempt_at, lease_expires_at, last_report_at, started_at), created_at
    FOR UPDATE SKIP LOCKED LIMIT _limit
  )
  UPDATE public.installation_operations op
  SET lease_owner = _owner, lease_expires_at = now() + make_interval(secs => _lease_seconds),
      last_report_at = now(), status = 'running', next_attempt_at = NULL,
      fencing_token = op.fencing_token + 1,
      summary = CASE WHEN op.attempt_count = 0 THEN 'Operação automática iniciada pelo executor do MASTER.' ELSE 'Operação automática retomada pelo executor do MASTER.' END,
      metrics = coalesce(op.metrics, '{}'::jsonb) || jsonb_build_object('lastClaimedAt', now(), 'lastOwner', _owner)
  FROM candidates WHERE op.id = candidates.id RETURNING op.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.yield_installation_operation(
  _operation_id uuid, _owner text, _fencing_token bigint, _delay_seconds integer DEFAULT 5
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _saved boolean;
BEGIN
  IF _delay_seconds < 0 OR _delay_seconds > 300 THEN
    RAISE EXCEPTION 'Atraso de continuação inválido' USING ERRCODE = '22023';
  END IF;
  WITH changed AS (
    UPDATE public.installation_operations
    SET status = 'pending', next_attempt_at = now() + make_interval(secs => _delay_seconds),
        lease_owner = NULL, lease_expires_at = NULL, last_report_at = now()
    WHERE id = _operation_id AND status = 'running' AND lease_owner = _owner AND fencing_token = _fencing_token
    RETURNING 1
  ) SELECT EXISTS(SELECT 1 FROM changed) INTO _saved;
  RETURN _saved;
END;
$$;

CREATE OR REPLACE FUNCTION public.retry_installation_operation(
  _operation_id uuid, _owner text, _fencing_token bigint, _delay_seconds integer,
  _error_kind text, _summary text, _error_detail jsonb DEFAULT '{}'::jsonb
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
        lease_owner = NULL, lease_expires_at = NULL, error_kind = _error_kind, summary = _summary,
        error_detail = coalesce(error_detail, '{}'::jsonb) || coalesce(_error_detail, '{}'::jsonb),
        last_report_at = now(), finished_at = CASE WHEN attempt_count + 1 >= max_attempts THEN now() ELSE NULL END
    WHERE id = _operation_id AND status = 'running' AND lease_owner = _owner AND fencing_token = _fencing_token
    RETURNING 1
  ) SELECT EXISTS(SELECT 1 FROM changed) INTO _saved;
  RETURN _saved;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_installation_operation(uuid, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_stale_installation_operations(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.yield_installation_operation(uuid, text, bigint, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.retry_installation_operation(uuid, text, bigint, integer, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_installation_operation(uuid, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_stale_installation_operations(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.yield_installation_operation(uuid, text, bigint, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.retry_installation_operation(uuid, text, bigint, integer, text, text, jsonb) TO service_role;