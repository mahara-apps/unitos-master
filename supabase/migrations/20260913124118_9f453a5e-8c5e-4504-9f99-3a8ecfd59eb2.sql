ALTER TABLE public.installation_operations
  ADD COLUMN IF NOT EXISTS lease_owner text,
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS installation_operations_resume_idx
  ON public.installation_operations (lease_expires_at, last_report_at)
  WHERE status IN ('pending', 'running');

CREATE OR REPLACE FUNCTION public.start_installation_operation(
  _actor_id uuid,
  _installation_id uuid,
  _kind text,
  _summary text,
  _steps jsonb,
  _run_token_hash text DEFAULT NULL,
  _run_token_expires_at timestamptz DEFAULT NULL
)
RETURNS public.installation_operations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _installation public.installations%ROWTYPE;
  _operation public.installation_operations%ROWTYPE;
  _target_status text;
BEGIN
  IF NOT public.is_super_admin(_actor_id) THEN
    RAISE EXCEPTION 'Apenas Super Admin pode iniciar operações de instalação' USING ERRCODE = '42501';
  END IF;

  IF _kind NOT IN ('provision', 'update', 'validate') THEN
    RAISE EXCEPTION 'Tipo de operação inválido' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _installation
  FROM public.installations
  WHERE id = _installation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Instalação não encontrada' USING ERRCODE = 'P0002';
  END IF;

  IF _installation.active_operation_id IS NOT NULL OR EXISTS (
    SELECT 1 FROM public.installation_operations
    WHERE installation_id = _installation_id
      AND status IN ('pending', 'running')
  ) THEN
    RAISE EXCEPTION 'Já existe uma operação pendente ou em andamento nesta instalação' USING ERRCODE = '55P03';
  END IF;

  INSERT INTO public.installation_operations (
    installation_id, kind, status, summary, steps,
    run_token_hash, run_token_expires_at, started_at, last_report_at
  ) VALUES (
    _installation_id, _kind, 'pending', _summary, _steps,
    _run_token_hash, _run_token_expires_at, now(), now()
  ) RETURNING * INTO _operation;

  _target_status := CASE _kind
    WHEN 'provision' THEN 'provisioning'
    WHEN 'update' THEN 'updating'
    ELSE 'validating'
  END;

  UPDATE public.installations
  SET status = _target_status,
      active_operation_id = _operation.id,
      last_error = NULL,
      updated_at = now()
  WHERE id = _installation_id;

  RETURN _operation;
END;
$$;

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
      attempt_count = attempt_count + CASE WHEN lease_owner IS DISTINCT FROM _owner THEN 1 ELSE 0 END
  WHERE id = _operation_id
    AND status IN ('pending', 'running')
    AND (lease_owner = _owner OR lease_expires_at IS NULL OR lease_expires_at <= now())
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

  RETURN QUERY
  WITH candidates AS (
    SELECT id
    FROM public.installation_operations
    WHERE status IN ('pending', 'running')
      AND detail->>'automated' = 'true'
      AND coalesce(lease_expires_at, last_report_at, started_at) <= now()
    ORDER BY coalesce(lease_expires_at, last_report_at, started_at), created_at
    FOR UPDATE SKIP LOCKED
    LIMIT _limit
  )
  UPDATE public.installation_operations op
  SET lease_owner = _owner,
      lease_expires_at = now() + make_interval(secs => _lease_seconds),
      last_report_at = now(),
      status = 'running',
      summary = 'Operação automática retomada pelo cron do MASTER.',
      attempt_count = op.attempt_count + 1
  FROM candidates
  WHERE op.id = candidates.id
  RETURNING op.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.heartbeat_installation_operation(
  _operation_id uuid,
  _owner text,
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
      AND status IN ('pending', 'running')
      AND lease_owner = _owner
      AND lease_expires_at > now()
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM renewed)
$$;

REVOKE ALL ON FUNCTION public.claim_installation_operation(uuid, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_stale_installation_operations(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.heartbeat_installation_operation(uuid, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_installation_operation(uuid, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_stale_installation_operations(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.heartbeat_installation_operation(uuid, text, integer) TO service_role;