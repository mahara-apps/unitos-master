ALTER TABLE public.installation_operations
  ADD COLUMN IF NOT EXISTS workflow_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS baseline_id text,
  ADD COLUMN IF NOT EXISTS baseline_hash text,
  ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz,
  ADD COLUMN IF NOT EXISTS blocked_reason text,
  ADD COLUMN IF NOT EXISTS reconciled_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_command text;

CREATE TABLE public.installation_operation_attempts (
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
CREATE POLICY installation_operation_attempts_super_admin_read
  ON public.installation_operation_attempts FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE TABLE public.installation_operation_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL REFERENCES public.installation_operations(id) ON DELETE CASCADE,
  step_key text NOT NULL,
  position integer NOT NULL,
  label text NOT NULL,
  state text NOT NULL DEFAULT 'pending',
  progress integer NOT NULL DEFAULT 0,
  detail text,
  input_fingerprint text,
  started_at timestamptz,
  finished_at timestamptz,
  last_error_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operation_id, step_key),
  UNIQUE (operation_id, position)
);
GRANT SELECT ON public.installation_operation_steps TO authenticated;
GRANT ALL ON public.installation_operation_steps TO service_role;
ALTER TABLE public.installation_operation_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY installation_operation_steps_super_admin_read
  ON public.installation_operation_steps FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE TABLE public.installation_operation_effects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL REFERENCES public.installation_operations(id) ON DELETE CASCADE,
  step_key text NOT NULL,
  provider text NOT NULL,
  effect_key text NOT NULL,
  input_fingerprint text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  external_resource_id text,
  result_fingerprint text,
  error_kind text,
  error_code text,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, effect_key)
);
GRANT SELECT ON public.installation_operation_effects TO authenticated;
GRANT ALL ON public.installation_operation_effects TO service_role;
ALTER TABLE public.installation_operation_effects ENABLE ROW LEVEL SECURITY;
CREATE POLICY installation_operation_effects_super_admin_read
  ON public.installation_operation_effects FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE TABLE public.installation_operation_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL REFERENCES public.installation_operations(id) ON DELETE CASCADE,
  command text NOT NULL,
  deduplication_key text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  available_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  delivered_at timestamptz,
  delivery_attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (deduplication_key)
);
GRANT SELECT ON public.installation_operation_outbox TO authenticated;
GRANT ALL ON public.installation_operation_outbox TO service_role;
ALTER TABLE public.installation_operation_outbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY installation_operation_outbox_super_admin_read
  ON public.installation_operation_outbox FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE TABLE public.installation_migration_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  installation_id uuid NOT NULL REFERENCES public.installations(id) ON DELETE CASCADE,
  operation_id uuid REFERENCES public.installation_operations(id) ON DELETE SET NULL,
  migration_id text NOT NULL,
  content_hash text NOT NULL,
  predecessor_id text,
  release_version text NOT NULL,
  sequence_number integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  duration_ms bigint,
  sqlstate text,
  error_message text,
  applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (installation_id, migration_id),
  UNIQUE (installation_id, sequence_number)
);
GRANT SELECT ON public.installation_migration_ledger TO authenticated;
GRANT ALL ON public.installation_migration_ledger TO service_role;
ALTER TABLE public.installation_migration_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY installation_migration_ledger_super_admin_read
  ON public.installation_migration_ledger FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE INDEX installation_operation_attempts_active_idx
  ON public.installation_operation_attempts (operation_id, heartbeat_at)
  WHERE status = 'running';
CREATE INDEX installation_operation_steps_state_idx
  ON public.installation_operation_steps (operation_id, state, position);
CREATE INDEX installation_operation_effects_operation_idx
  ON public.installation_operation_effects (operation_id, step_key, status);
CREATE INDEX installation_operation_outbox_ready_idx
  ON public.installation_operation_outbox (available_at, created_at)
  WHERE status IN ('pending', 'retryable');
CREATE INDEX installation_migration_ledger_release_idx
  ON public.installation_migration_ledger (installation_id, release_version, sequence_number);
CREATE INDEX installation_operations_reconcile_idx
  ON public.installation_operations (lease_expires_at, heartbeat_at, next_attempt_at)
  WHERE status IN ('pending', 'running', 'retryable');

CREATE TRIGGER installation_operation_attempts_touch_updated_at
  BEFORE UPDATE ON public.installation_operation_attempts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER installation_operation_steps_touch_updated_at
  BEFORE UPDATE ON public.installation_operation_steps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER installation_operation_effects_touch_updated_at
  BEFORE UPDATE ON public.installation_operation_effects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER installation_operation_outbox_touch_updated_at
  BEFORE UPDATE ON public.installation_operation_outbox
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER installation_migration_ledger_touch_updated_at
  BEFORE UPDATE ON public.installation_migration_ledger
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.start_durable_installation_operation(
  _actor_id uuid,
  _installation_id uuid,
  _kind text,
  _summary text,
  _steps jsonb,
  _detail jsonb,
  _workflow_version integer,
  _baseline_id text DEFAULT NULL,
  _baseline_hash text DEFAULT NULL,
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
  _step jsonb;
  _position integer := 0;
BEGIN
  IF NOT public.is_super_admin(_actor_id) THEN
    RAISE EXCEPTION 'Apenas Super Admin pode iniciar operações de instalação' USING ERRCODE = '42501';
  END IF;
  IF _kind NOT IN ('provision', 'update', 'validate') OR _workflow_version < 1 THEN
    RAISE EXCEPTION 'Parâmetros da operação inválidos' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO _installation FROM public.installations WHERE id = _installation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Instalação não encontrada' USING ERRCODE = 'P0002';
  END IF;
  IF _installation.active_operation_id IS NOT NULL OR EXISTS (
    SELECT 1 FROM public.installation_operations
    WHERE installation_id = _installation_id AND status IN ('pending', 'running', 'retryable')
  ) THEN
    RAISE EXCEPTION 'Já existe uma operação pendente ou em andamento nesta instalação' USING ERRCODE = '55P03';
  END IF;

  INSERT INTO public.installation_operations (
    installation_id, kind, status, summary, steps, detail, actor_id,
    run_token_hash, run_token_expires_at, started_at, last_report_at,
    workflow_version, baseline_id, baseline_hash, next_command
  ) VALUES (
    _installation_id, _kind, 'pending', _summary, coalesce(_steps, '[]'::jsonb), coalesce(_detail, '{}'::jsonb), _actor_id,
    _run_token_hash, _run_token_expires_at, now(), now(),
    _workflow_version, _baseline_id, _baseline_hash, 'execute'
  ) RETURNING * INTO _operation;

  FOR _step IN SELECT value FROM jsonb_array_elements(coalesce(_steps, '[]'::jsonb)) LOOP
    INSERT INTO public.installation_operation_steps (
      operation_id, step_key, position, label, state, progress, detail
    ) VALUES (
      _operation.id,
      coalesce(_step->>'id', 'step-' || _position::text),
      _position,
      coalesce(_step->>'label', _step->>'id', 'Etapa'),
      CASE WHEN _step->>'state' IN ('pending','running','done','error','blocked','cancelled') THEN _step->>'state' ELSE 'pending' END,
      CASE WHEN (_step->>'percent') ~ '^[0-9]+$' THEN least(100, greatest(0, (_step->>'percent')::integer)) ELSE 0 END,
      _step->>'detail'
    );
    _position := _position + 1;
  END LOOP;

  INSERT INTO public.installation_operation_outbox (
    operation_id, command, deduplication_key, payload
  ) VALUES (
    _operation.id,
    'execute',
    _operation.id::text || ':execute:0',
    jsonb_build_object('operationId', _operation.id, 'workflowVersion', _workflow_version)
  );

  _target_status := CASE _kind WHEN 'provision' THEN 'provisioning' WHEN 'update' THEN 'updating' ELSE 'validating' END;
  UPDATE public.installations
  SET status = _target_status, active_operation_id = _operation.id, last_error = NULL, updated_at = now()
  WHERE id = _installation_id;
  RETURN _operation;
END;
$$;
REVOKE ALL ON FUNCTION public.start_durable_installation_operation(uuid, uuid, text, text, jsonb, jsonb, integer, text, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_durable_installation_operation(uuid, uuid, text, text, jsonb, jsonb, integer, text, text, text, timestamptz) TO service_role;

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
      error_kind = 'attempts_exhausted', blocked_reason = 'attempts_exhausted',
      summary = 'Limite de tentativas automáticas atingido. Revise o diagnóstico antes de tentar novamente.',
      error_detail = coalesce(op.error_detail, '{}'::jsonb) || jsonb_build_object('exhaustedAt', now())
  WHERE op.status IN ('pending', 'running', 'retryable') AND op.detail->>'automated' = 'true'
    AND op.attempt_count >= op.max_attempts
    AND coalesce(op.lease_expires_at, op.next_attempt_at, op.last_report_at, op.started_at) <= now();

  UPDATE public.installations i
  SET status = 'attention', health = 'degraded', active_operation_id = NULL,
      last_error = 'A automação atingiu o limite de tentativas e precisa de revisão manual.', updated_at = now()
  WHERE EXISTS (
    SELECT 1 FROM public.installation_operations op
    WHERE op.id = i.active_operation_id AND op.status = 'manual_review'
  );

  RETURN QUERY
  WITH candidates AS (
    SELECT id FROM public.installation_operations
    WHERE status IN ('pending', 'running', 'retryable') AND detail->>'automated' = 'true'
      AND attempt_count < max_attempts AND coalesce(next_attempt_at, now()) <= now()
      AND (lease_expires_at IS NULL OR lease_expires_at <= now())
    ORDER BY coalesce(next_attempt_at, lease_expires_at, last_report_at, started_at), created_at
    FOR UPDATE SKIP LOCKED LIMIT _limit
  ), claimed AS (
    UPDATE public.installation_operations op
    SET lease_owner = _owner,
        lease_expires_at = now() + make_interval(secs => _lease_seconds),
        heartbeat_at = now(), last_report_at = now(), status = 'running', next_attempt_at = NULL,
        attempt_count = op.attempt_count + 1,
        fencing_token = op.fencing_token + 1,
        blocked_reason = NULL,
        summary = CASE WHEN op.attempt_count = 0 THEN 'Operação automática iniciada pelo executor do MASTER.' ELSE 'Operação automática retomada pelo executor do MASTER.' END,
        metrics = coalesce(op.metrics, '{}'::jsonb) || jsonb_build_object('lastClaimedAt', now(), 'lastOwner', _owner)
    FROM candidates WHERE op.id = candidates.id
    RETURNING op.*
  ), attempts AS (
    INSERT INTO public.installation_operation_attempts (
      operation_id, attempt_number, owner, fencing_token, status, started_at, heartbeat_at
    )
    SELECT id, attempt_count, lease_owner, fencing_token, 'running', now(), now() FROM claimed
    ON CONFLICT (operation_id, attempt_number) DO UPDATE
      SET owner = EXCLUDED.owner, fencing_token = EXCLUDED.fencing_token,
          status = 'running', heartbeat_at = now(), finished_at = NULL
    RETURNING operation_id
  )
  SELECT claimed.* FROM claimed LEFT JOIN attempts ON attempts.operation_id = claimed.id;
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
    SET lease_expires_at = now() + make_interval(secs => _lease_seconds), heartbeat_at = now(), last_report_at = now()
    WHERE id = _operation_id AND status = 'running' AND lease_owner = _owner
      AND fencing_token = _fencing_token AND lease_expires_at > now()
    RETURNING id, attempt_count
  ), touched AS (
    UPDATE public.installation_operation_attempts a SET heartbeat_at = now()
    FROM renewed r WHERE a.operation_id = r.id AND a.attempt_number = r.attempt_count AND a.status = 'running'
  )
  SELECT EXISTS (SELECT 1 FROM renewed)
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
        lease_owner = NULL, lease_expires_at = NULL, error_kind = _error_kind,
        blocked_reason = CASE WHEN attempt_count >= max_attempts THEN 'attempts_exhausted' ELSE NULL END,
        summary = _summary,
        error_detail = coalesce(error_detail, '{}'::jsonb) || coalesce(_error_detail, '{}'::jsonb),
        last_report_at = now(), finished_at = CASE WHEN attempt_count >= max_attempts THEN now() ELSE NULL END,
        next_command = CASE WHEN attempt_count >= max_attempts THEN NULL ELSE 'execute' END
    WHERE id = _operation_id AND status = 'running' AND lease_owner = _owner AND fencing_token = _fencing_token
    RETURNING id, attempt_count, status, next_attempt_at
  ), closed_attempt AS (
    UPDATE public.installation_operation_attempts a
    SET status = CASE WHEN c.status = 'manual_review' THEN 'exhausted' ELSE 'retryable' END,
        error_kind = _error_kind, error_message = _summary, retryable = c.status <> 'manual_review', finished_at = now()
    FROM changed c WHERE a.operation_id = c.id AND a.attempt_number = c.attempt_count AND a.status = 'running'
  ), queued AS (
    INSERT INTO public.installation_operation_outbox (operation_id, command, deduplication_key, payload, status, available_at)
    SELECT id, 'execute', id::text || ':execute:' || attempt_count::text,
           jsonb_build_object('operationId', id, 'attempt', attempt_count), 'pending', next_attempt_at
    FROM changed WHERE status = 'retryable'
    ON CONFLICT (deduplication_key) DO UPDATE
      SET status = 'pending', available_at = EXCLUDED.available_at, last_error = NULL
  )
  SELECT EXISTS(SELECT 1 FROM changed) INTO _saved;
  RETURN _saved;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_stale_installation_operations(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.heartbeat_installation_operation(uuid, text, bigint, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.retry_installation_operation(uuid, text, bigint, integer, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_stale_installation_operations(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.heartbeat_installation_operation(uuid, text, bigint, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.retry_installation_operation(uuid, text, bigint, integer, text, text, jsonb) TO service_role;