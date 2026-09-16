-- unitos-destination: control-plane
-- Canonical, idempotent convergence for the MASTER installation manager.
-- This migration is never part of the Client package.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END
$$;

CREATE TABLE IF NOT EXISTS public.installations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, slug text NOT NULL UNIQUE,
  domain text, supabase_project_ref text, supabase_url text, git_repo_url text, deploy_project text,
  notes text, status text NOT NULL DEFAULT 'preparing', health text NOT NULL DEFAULT 'unknown',
  current_version text, available_version text, last_provisioned_at timestamptz, last_validated_at timestamptz,
  last_error text, created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  health_checks jsonb NOT NULL DEFAULT '{}'::jsonb, health_checked_at timestamptz, active_operation_id uuid,
  pinned_commit_sha text, pinned_release text, pinned_at timestamptz, pinned_by uuid,
  requires_own_supabase_token boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.installation_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), installation_id uuid NOT NULL REFERENCES public.installations(id) ON DELETE CASCADE,
  kind text NOT NULL, status text NOT NULL DEFAULT 'pending', summary text, detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id uuid, started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
  steps jsonb NOT NULL DEFAULT '[]'::jsonb, error_kind text, run_token_hash text, run_token_expires_at timestamptz,
  last_report_at timestamptz, lease_owner text, lease_expires_at timestamptz, attempt_count integer NOT NULL DEFAULT 0,
  current_step text, next_attempt_at timestamptz, max_attempts integer NOT NULL DEFAULT 8, fencing_token bigint NOT NULL DEFAULT 0,
  error_detail jsonb NOT NULL DEFAULT '{}'::jsonb, metrics jsonb NOT NULL DEFAULT '{}'::jsonb, idempotency_key text,
  workflow_version integer NOT NULL DEFAULT 1, baseline_id text, baseline_hash text, heartbeat_at timestamptz,
  blocked_reason text, reconciled_at timestamptz, next_command text, retry_of_operation_id uuid REFERENCES public.installation_operations(id)
);

CREATE TABLE IF NOT EXISTS public.installation_credentials (
  installation_id uuid PRIMARY KEY REFERENCES public.installations(id) ON DELETE CASCADE,
  supabase_management_token_ciphertext text, vercel_token_ciphertext text, vercel_team_id text,
  github_token_ciphertext text, updated_by uuid, created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(), generated_secrets_ciphertext text,
  supabase_publishable_key_ciphertext text, supabase_service_role_key_ciphertext text
);

CREATE TABLE IF NOT EXISTS public.installation_operation_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), operation_id uuid NOT NULL REFERENCES public.installation_operations(id) ON DELETE CASCADE,
  step_key text NOT NULL, position integer NOT NULL, label text NOT NULL, state text NOT NULL DEFAULT 'pending', progress integer NOT NULL DEFAULT 0,
  detail text, input_fingerprint text, started_at timestamptz, finished_at timestamptz, last_error_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(operation_id,step_key), UNIQUE(operation_id,position)
);
CREATE TABLE IF NOT EXISTS public.installation_operation_effects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), operation_id uuid NOT NULL REFERENCES public.installation_operations(id) ON DELETE CASCADE,
  step_key text NOT NULL, provider text NOT NULL, effect_key text NOT NULL, input_fingerprint text NOT NULL,
  status text NOT NULL DEFAULT 'pending', external_resource_id text, result_fingerprint text, error_kind text, error_code text, error_message text,
  started_at timestamptz, completed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider,effect_key)
);
CREATE TABLE IF NOT EXISTS public.installation_operation_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), operation_id uuid NOT NULL REFERENCES public.installation_operations(id) ON DELETE CASCADE,
  command text NOT NULL, deduplication_key text NOT NULL UNIQUE, payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending', available_at timestamptz NOT NULL DEFAULT now(), claimed_at timestamptz, delivered_at timestamptz,
  delivery_attempts integer NOT NULL DEFAULT 0, last_error text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.installation_migration_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), installation_id uuid NOT NULL REFERENCES public.installations(id) ON DELETE CASCADE,
  operation_id uuid REFERENCES public.installation_operations(id) ON DELETE SET NULL, migration_id text NOT NULL, content_hash text NOT NULL,
  predecessor_id text, release_version text NOT NULL, sequence_number integer NOT NULL, status text NOT NULL DEFAULT 'pending', duration_ms bigint,
  sqlstate text, error_message text, applied_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(installation_id,migration_id), UNIQUE(installation_id,sequence_number)
);
CREATE TABLE IF NOT EXISTS public.installation_operation_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), operation_id uuid NOT NULL REFERENCES public.installation_operations(id) ON DELETE CASCADE,
  attempt_number integer NOT NULL, owner text NOT NULL, fencing_token bigint NOT NULL, status text NOT NULL DEFAULT 'running', error_kind text,
  error_code text, error_message text, retryable boolean, started_at timestamptz NOT NULL DEFAULT now(), heartbeat_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz, metrics jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(operation_id,attempt_number), UNIQUE(operation_id,fencing_token)
);
CREATE TABLE IF NOT EXISTS public.installation_operation_migrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), operation_id uuid NOT NULL REFERENCES public.installation_operations(id) ON DELETE CASCADE,
  migration_file text NOT NULL, fingerprint text NOT NULL, package_position integer NOT NULL CHECK(package_position>0),
  statement_index integer NOT NULL DEFAULT 0, total_statements integer NOT NULL, status text NOT NULL DEFAULT 'running', confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT installation_operation_migrations_statement_bounds CHECK(statement_index>=0 AND total_statements>=0 AND statement_index<=total_statements),
  CONSTRAINT installation_operation_migrations_status_valid CHECK(status IN ('running','completed')),
  UNIQUE(operation_id,migration_file,fingerprint), UNIQUE(operation_id,package_position)
);

CREATE INDEX IF NOT EXISTS installation_operations_installation_idx ON public.installation_operations(installation_id,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS installation_operations_one_active ON public.installation_operations(installation_id) WHERE status IN ('pending','running','retryable');
CREATE INDEX IF NOT EXISTS installation_operations_run_token_hash_idx ON public.installation_operations(run_token_hash) WHERE run_token_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS installation_operations_idempotency_uidx ON public.installation_operations(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS installation_operations_resume_idx ON public.installation_operations(next_attempt_at,lease_expires_at,created_at) WHERE status IN ('pending','running','retryable');
CREATE INDEX IF NOT EXISTS installation_operations_reconcile_idx ON public.installation_operations(lease_expires_at,heartbeat_at,next_attempt_at) WHERE status IN ('pending','running','retryable');
CREATE INDEX IF NOT EXISTS installation_operations_retry_origin_idx ON public.installation_operations(retry_of_operation_id) WHERE retry_of_operation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS installation_operation_attempts_active_idx ON public.installation_operation_attempts(operation_id,heartbeat_at) WHERE status='running';
CREATE INDEX IF NOT EXISTS installation_operation_steps_state_idx ON public.installation_operation_steps(operation_id,state,position);
CREATE INDEX IF NOT EXISTS installation_operation_effects_operation_idx ON public.installation_operation_effects(operation_id,step_key,status);
CREATE INDEX IF NOT EXISTS installation_operation_outbox_ready_idx ON public.installation_operation_outbox(available_at,created_at) WHERE status IN ('pending','retryable');
CREATE INDEX IF NOT EXISTS installation_migration_ledger_release_idx ON public.installation_migration_ledger(installation_id,release_version,sequence_number);
CREATE INDEX IF NOT EXISTS installation_operation_migrations_operation_status_idx ON public.installation_operation_migrations(operation_id,status,package_position);

CREATE OR REPLACE FUNCTION public.compare_and_set_installation_generated_secrets(
  _installation_id uuid,
  _expected_updated_at timestamptz,
  _ciphertext text,
  _updated_by uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _changed integer := 0;
BEGIN
  IF _ciphertext IS NULL OR btrim(_ciphertext) = '' THEN
    RAISE EXCEPTION 'ciphertext obrigatório';
  END IF;

  IF _expected_updated_at IS NULL THEN
    INSERT INTO public.installation_credentials (
      installation_id,
      generated_secrets_ciphertext,
      updated_by,
      updated_at
    )
    VALUES (
      _installation_id,
      _ciphertext,
      _updated_by,
      now()
    )
    ON CONFLICT (installation_id) DO NOTHING;
    GET DIAGNOSTICS _changed = ROW_COUNT;
  ELSE
    UPDATE public.installation_credentials
       SET generated_secrets_ciphertext = _ciphertext,
           updated_by = COALESCE(_updated_by, updated_by),
           updated_at = now()
     WHERE installation_id = _installation_id
       AND updated_at = _expected_updated_at;
    GET DIAGNOSTICS _changed = ROW_COUNT;
  END IF;

  RETURN _changed = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.compare_and_set_installation_generated_secrets(uuid, timestamptz, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.compare_and_set_installation_generated_secrets(uuid, timestamptz, text, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compare_and_set_installation_generated_secrets(uuid, timestamptz, text, uuid) TO service_role;

COMMENT ON FUNCTION public.compare_and_set_installation_generated_secrets(uuid, timestamptz, text, uuid) IS
  'CAS service-role-only para preservar secrets gerados sob concorrência.';
-- lovable-cron-fallback-reviewed: 1440 runs/day; reconciliação temporária necessária para retomar operações após interrupções enquanto o despertar por fila não substitui o polling
CREATE OR REPLACE FUNCTION public.claim_installation_operation(_operation_id uuid, _owner text, _lease_seconds integer DEFAULT 180)
RETURNS public.installation_operations LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _operation public.installation_operations%ROWTYPE;
BEGIN
  IF coalesce(trim(_owner), '') = '' OR _lease_seconds < 30 OR _lease_seconds > 900 THEN RAISE EXCEPTION 'Parâmetros de lease inválidos' USING ERRCODE = '22023'; END IF;
  UPDATE public.installation_operations SET lease_owner=_owner, lease_expires_at=now()+make_interval(secs=>_lease_seconds), heartbeat_at=now(), last_report_at=now(), status='running', next_attempt_at=NULL, fencing_token=fencing_token+1, blocked_reason=NULL, metrics=coalesce(metrics,'{}'::jsonb)||jsonb_build_object('lastClaimedAt',now(),'lastOwner',_owner)
  WHERE id=_operation_id AND status IN ('pending','running','retryable') AND coalesce(next_attempt_at,now())<=now() AND (lease_owner=_owner OR lease_expires_at IS NULL OR lease_expires_at<=now()) AND attempt_count<max_attempts RETURNING * INTO _operation;
  RETURN _operation;
END $$;

CREATE OR REPLACE FUNCTION public.claim_stale_installation_operations(_owner text, _limit integer DEFAULT 3, _lease_seconds integer DEFAULT 180)
RETURNS SETOF public.installation_operations LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF coalesce(trim(_owner), '') = '' OR _limit < 1 OR _limit > 20 OR _lease_seconds < 30 OR _lease_seconds > 900 THEN RAISE EXCEPTION 'Parâmetros de lease inválidos' USING ERRCODE = '22023'; END IF;
  UPDATE public.installation_operations op SET status='manual_review',finished_at=now(),lease_owner=NULL,lease_expires_at=NULL,error_kind='attempts_exhausted',blocked_reason='attempts_exhausted',summary='Limite de falhas automáticas consecutivas atingido. Revise o diagnóstico antes de tentar novamente.',error_detail=coalesce(op.error_detail,'{}'::jsonb)||jsonb_build_object('exhaustedAt',now()) WHERE op.status IN ('pending','running','retryable') AND op.detail->>'automated'='true' AND op.attempt_count>=op.max_attempts AND coalesce(op.lease_expires_at,op.next_attempt_at,op.last_report_at,op.started_at)<=now();
  UPDATE public.installations i SET status='attention',health='degraded',active_operation_id=NULL,last_error='A automação atingiu o limite de falhas consecutivas e precisa de revisão manual.',updated_at=now() WHERE EXISTS (SELECT 1 FROM public.installation_operations op WHERE op.id=i.active_operation_id AND op.status='manual_review');
  RETURN QUERY WITH candidates AS (
    SELECT id FROM public.installation_operations WHERE status IN ('pending','running','retryable') AND detail->>'automated'='true' AND attempt_count<max_attempts AND coalesce(next_attempt_at,now())<=now() AND (lease_expires_at IS NULL OR lease_expires_at<=now()) ORDER BY coalesce(next_attempt_at,lease_expires_at,last_report_at,started_at),created_at FOR UPDATE SKIP LOCKED LIMIT _limit
  ), claimed AS (
    UPDATE public.installation_operations op SET lease_owner=_owner,lease_expires_at=now()+make_interval(secs=>_lease_seconds),heartbeat_at=now(),last_report_at=now(),status='running',next_attempt_at=NULL,fencing_token=op.fencing_token+1,blocked_reason=NULL,summary=CASE WHEN op.fencing_token=0 THEN 'Operação automática iniciada pelo executor do MASTER.' ELSE 'Operação automática retomada pelo executor do MASTER.' END,metrics=coalesce(op.metrics,'{}'::jsonb)||jsonb_build_object('lastClaimedAt',now(),'lastOwner',_owner) FROM candidates WHERE op.id=candidates.id RETURNING op.*
  ), attempts AS (
    INSERT INTO public.installation_operation_attempts(operation_id,attempt_number,owner,fencing_token,status,started_at,heartbeat_at) SELECT id,fencing_token::integer,lease_owner,fencing_token,'running',now(),now() FROM claimed ON CONFLICT(operation_id,attempt_number) DO UPDATE SET owner=EXCLUDED.owner,fencing_token=EXCLUDED.fencing_token,status='running',error_kind=NULL,error_code=NULL,error_message=NULL,retryable=NULL,started_at=now(),heartbeat_at=now(),finished_at=NULL RETURNING operation_id
  ) SELECT claimed.* FROM claimed LEFT JOIN attempts ON attempts.operation_id=claimed.id;
END $$;

CREATE OR REPLACE FUNCTION public.yield_installation_operation(_operation_id uuid,_owner text,_fencing_token bigint,_delay_seconds integer DEFAULT 5)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _saved boolean;
BEGIN
  IF _delay_seconds<0 OR _delay_seconds>300 THEN RAISE EXCEPTION 'Atraso de continuação inválido' USING ERRCODE='22023'; END IF;
  WITH changed AS (
    UPDATE public.installation_operations SET status='pending',next_attempt_at=now()+make_interval(secs=>_delay_seconds),lease_owner=NULL,lease_expires_at=NULL,last_report_at=now(),attempt_count=0,error_kind=NULL,blocked_reason=NULL,finished_at=NULL,next_command='execute' WHERE id=_operation_id AND status='running' AND lease_owner=_owner AND fencing_token=_fencing_token RETURNING id,fencing_token
  ), closed_attempt AS (
    UPDATE public.installation_operation_attempts a SET status='completed',retryable=false,finished_at=now(),heartbeat_at=now() FROM changed c WHERE a.operation_id=c.id AND a.fencing_token=c.fencing_token AND a.status='running'
  ), queued AS (
    INSERT INTO public.installation_operation_outbox(operation_id,command,deduplication_key,payload,status,available_at) SELECT id,'execute',id::text||':execute:'||fencing_token::text,jsonb_build_object('operationId',id,'fencingToken',fencing_token),'pending',now()+make_interval(secs=>_delay_seconds) FROM changed ON CONFLICT(deduplication_key) DO UPDATE SET status='pending',available_at=EXCLUDED.available_at,last_error=NULL
  ) SELECT EXISTS(SELECT 1 FROM changed) INTO _saved;
  RETURN _saved;
END $$;

CREATE OR REPLACE FUNCTION public.retry_installation_operation(_operation_id uuid,_owner text,_fencing_token bigint,_delay_seconds integer,_error_kind text,_summary text,_error_detail jsonb DEFAULT '{}'::jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _saved boolean;
BEGIN
  IF _delay_seconds<5 OR _delay_seconds>86400 THEN RAISE EXCEPTION 'Atraso de nova tentativa inválido' USING ERRCODE='22023'; END IF;
  WITH changed AS (
    UPDATE public.installation_operations SET attempt_count=attempt_count+1,status=CASE WHEN attempt_count+1>=max_attempts THEN 'manual_review' ELSE 'retryable' END,next_attempt_at=CASE WHEN attempt_count+1>=max_attempts THEN NULL ELSE now()+make_interval(secs=>_delay_seconds) END,lease_owner=NULL,lease_expires_at=NULL,error_kind=_error_kind,blocked_reason=CASE WHEN attempt_count+1>=max_attempts THEN 'attempts_exhausted' ELSE NULL END,summary=CASE WHEN attempt_count+1>=max_attempts THEN 'Limite de falhas automáticas consecutivas atingido. Revise o diagnóstico antes de tentar novamente.' ELSE _summary END,error_detail=coalesce(error_detail,'{}'::jsonb)||coalesce(_error_detail,'{}'::jsonb),last_report_at=now(),finished_at=CASE WHEN attempt_count+1>=max_attempts THEN now() ELSE NULL END,next_command=CASE WHEN attempt_count+1>=max_attempts THEN NULL ELSE 'execute' END WHERE id=_operation_id AND status='running' AND lease_owner=_owner AND fencing_token=_fencing_token RETURNING id,attempt_count,status,next_attempt_at,fencing_token
  ), closed_attempt AS (
    UPDATE public.installation_operation_attempts a SET status=CASE WHEN c.status='manual_review' THEN 'exhausted' ELSE 'retryable' END,error_kind=_error_kind,error_message=_summary,retryable=c.status<>'manual_review',finished_at=now(),heartbeat_at=now() FROM changed c WHERE a.operation_id=c.id AND a.fencing_token=c.fencing_token AND a.status='running'
  ), queued AS (
    INSERT INTO public.installation_operation_outbox(operation_id,command,deduplication_key,payload,status,available_at) SELECT id,'execute',id::text||':retry:'||attempt_count::text||':'||fencing_token::text,jsonb_build_object('operationId',id,'failureCount',attempt_count,'fencingToken',fencing_token),'pending',next_attempt_at FROM changed WHERE status='retryable' ON CONFLICT(deduplication_key) DO UPDATE SET status='pending',available_at=EXCLUDED.available_at,last_error=NULL
  ) SELECT EXISTS(SELECT 1 FROM changed) INTO _saved;
  RETURN _saved;
END $$;

REVOKE ALL ON FUNCTION public.claim_installation_operation(uuid,text,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.claim_stale_installation_operations(text,integer,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.yield_installation_operation(uuid,text,bigint,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.retry_installation_operation(uuid,text,bigint,integer,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_installation_operation(uuid,text,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_stale_installation_operations(text,integer,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.yield_installation_operation(uuid,text,bigint,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.retry_installation_operation(uuid,text,bigint,integer,text,text,jsonb) TO service_role;

-- lovable-cron-fallback-reviewed: 1440 runs/day; reconciliação temporária necessária para retomar operações em até cerca de um minuto enquanto o despertar por fila não substitui o polling
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
DECLARE
  _saved boolean;
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
    RETURNING id, attempt_count, fencing_token, next_attempt_at
  ), closed_attempt AS (
    UPDATE public.installation_operation_attempts a
    SET status = 'deferred',
        error_kind = _error_kind,
        error_message = _summary,
        retryable = true,
        finished_at = now(),
        heartbeat_at = now()
    FROM changed c
    WHERE a.operation_id = c.id
      AND a.fencing_token = c.fencing_token
      AND a.status = 'running'
  ), queued AS (
    INSERT INTO public.installation_operation_outbox(
      operation_id, command, deduplication_key, payload, status, available_at
    )
    SELECT id,
           'execute',
           id::text || ':defer:' || fencing_token::text,
           jsonb_build_object(
             'operationId', id,
             'failureCount', attempt_count,
             'fencingToken', fencing_token,
             'source', 'master'
           ),
           'pending',
           next_attempt_at
    FROM changed
    ON CONFLICT(deduplication_key) DO UPDATE
      SET status = 'pending', available_at = EXCLUDED.available_at, last_error = NULL
  )
  SELECT EXISTS(SELECT 1 FROM changed) INTO _saved;

  RETURN _saved;
END
$$;

REVOKE ALL ON FUNCTION public.defer_installation_operation(uuid,text,bigint,integer,text,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.defer_installation_operation(uuid,text,bigint,integer,text,text,jsonb) TO service_role;

DO $$
DECLARE
  v_app_url text;
BEGIN
  SELECT rtrim(app_url, '/') INTO v_app_url FROM public.installation LIMIT 1;
  IF v_app_url IS NULL THEN RETURN; END IF;
  IF v_app_url !~ '^https://[a-zA-Z0-9._-]+(:[0-9]+)?$' THEN
    RAISE EXCEPTION 'installation.app_url inválida para installation-provision-resume (%)', v_app_url;
  END IF;

  PERFORM cron.unschedule('installation-provision-resume')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'installation-provision-resume');

  PERFORM cron.schedule(
    'installation-provision-resume',
    '* * * * *',
    format($fmt$select net.http_post(
      url := %L,
      headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',public.cron_secret()),
      body := jsonb_build_object('job','installation-provision-resume','scheduledAt',now()),

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
CREATE OR REPLACE FUNCTION public.seal_installation_operation_baseline(
  _operation_id uuid,
  _owner text,
  _fencing_token bigint,
  _baseline_id text,
  _baseline_hash text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _sealed boolean;
BEGIN
  IF nullif(btrim(_baseline_id), '') IS NULL OR _baseline_hash COLLATE "C" !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Snapshot do pacote inválido' USING ERRCODE = '22023';
  END IF;

  UPDATE public.installation_operations
  SET baseline_id = _baseline_id,
      baseline_hash = _baseline_hash,
      heartbeat_at = now(),
      last_report_at = now()
  WHERE id = _operation_id
    AND status = 'running'
    AND lease_owner = _owner
    AND fencing_token = _fencing_token
    AND lease_expires_at > now()
    AND (baseline_id IS NULL OR baseline_id = _baseline_id)
    AND (baseline_hash IS NULL OR baseline_hash = _baseline_hash)
  RETURNING true INTO _sealed;

  RETURN coalesce(_sealed, false);
END;
$$;

REVOKE ALL ON FUNCTION public.seal_installation_operation_baseline(uuid,text,bigint,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seal_installation_operation_baseline(uuid,text,bigint,text,text) TO service_role;
CREATE OR REPLACE FUNCTION public.merge_installation_operation_steps(_current jsonb, _incoming jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  WITH current_steps AS (
    SELECT value AS step, value->>'id' AS id, ordinality AS ord
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(_current) = 'array' THEN _current ELSE '[]'::jsonb END)
      WITH ORDINALITY
  ), incoming_steps AS (
    SELECT value AS step, value->>'id' AS id, ordinality AS ord
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(_incoming) = 'array' THEN _incoming ELSE '[]'::jsonb END)
      WITH ORDINALITY
  ), ids AS (
    SELECT id, min(ord) AS ord FROM (
      SELECT id, ord FROM current_steps
      UNION ALL
      SELECT id, 1000000 + ord FROM incoming_steps
    ) all_steps
    WHERE id IS NOT NULL AND id <> ''
    GROUP BY id
  ), merged AS (
    SELECT ids.ord,
      CASE
        WHEN c.step IS NULL THEN i.step
        WHEN i.step IS NULL THEN c.step
        ELSE (c.step || i.step)
          || jsonb_build_object(
            'percent', greatest(coalesce((c.step->>'percent')::numeric, 0), coalesce((i.step->>'percent')::numeric, 0)),
            'state', CASE
              WHEN c.step->>'state' = 'done' OR i.step->>'state' = 'done' THEN 'done'
              WHEN c.step->>'state' = 'error' OR i.step->>'state' = 'error' THEN 'error'
              WHEN c.step->>'state' = 'running' OR i.step->>'state' = 'running' THEN 'running'
              ELSE coalesce(i.step->>'state', c.step->>'state', 'pending')
            END
          )
      END AS step
    FROM ids
    LEFT JOIN current_steps c USING (id)
    LEFT JOIN incoming_steps i USING (id)
  )
  SELECT coalesce(jsonb_agg(step ORDER BY ord), '[]'::jsonb) FROM merged
$$;
REVOKE ALL ON FUNCTION public.merge_installation_operation_steps(jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merge_installation_operation_steps(jsonb,jsonb) TO service_role;

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
    SET steps = public.merge_installation_operation_steps(steps, _steps),
        detail = _detail,
        current_step = coalesce(_current_step, current_step),
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
REVOKE ALL ON FUNCTION public.checkpoint_installation_operation(uuid,text,bigint,jsonb,jsonb,text,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.checkpoint_installation_operation(uuid,text,bigint,jsonb,jsonb,text,text,jsonb) TO service_role;

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
DECLARE _saved boolean;
BEGIN
  IF coalesce(_migration_file, '') = '' OR coalesce(_fingerprint, '') = '' OR _package_position < 1
     OR _statement_index < 0 OR _total_statements < 0 OR _statement_index > _total_statements THEN
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
      total_statements = CASE
        WHEN public.installation_operation_migrations.total_statements = excluded.total_statements THEN excluded.total_statements
        ELSE public.installation_operation_migrations.total_statements
      END,
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
    AND public.installation_operation_migrations.total_statements = excluded.total_statements;

  GET DIAGNOSTICS _saved = ROW_COUNT;
  IF NOT _saved THEN
    RAISE EXCEPTION 'Checkpoint divergiu do pacote fixado' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.installation_operations
  SET heartbeat_at = now(), last_report_at = now(),
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
END;
$$;
REVOKE ALL ON FUNCTION public.checkpoint_installation_migration(uuid,text,bigint,text,text,integer,integer,integer,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.checkpoint_installation_migration(uuid,text,bigint,text,text,integer,integer,integer,boolean) TO service_role;
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
CREATE OR REPLACE FUNCTION public.cancel_legacy_installation_outbox()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('pending', 'claimed', 'retryable') THEN
    NEW.status := 'cancelled';
    NEW.last_error := coalesce(NEW.last_error, 'Fila legada desativada; use o registro canônico da operação.');
  END IF;
  RETURN NEW;
END
$$;

DROP FUNCTION IF EXISTS public.start_durable_installation_operation(uuid,uuid,text,text,jsonb,jsonb,integer,text,text,text,timestamptz);

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
  _run_token_expires_at timestamptz DEFAULT NULL,
  _retry_of_operation_id uuid DEFAULT NULL
)
RETURNS public.installation_operations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _installation public.installations%ROWTYPE;
  _operation public.installation_operations%ROWTYPE;
  _retry_operation public.installation_operations%ROWTYPE;
  _latest_provision_id uuid;
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
      AND status IN ('pending', 'running', 'retryable')
  ) THEN
    RAISE EXCEPTION 'Já existe uma operação pendente ou em andamento nesta instalação' USING ERRCODE = '55P03';
  END IF;

  IF _retry_of_operation_id IS NOT NULL THEN
    IF _kind <> 'provision' THEN
      RAISE EXCEPTION 'Retry terminal é permitido somente para provision' USING ERRCODE = '22023';
    END IF;
    IF _installation.status NOT IN ('error', 'update_available') THEN
      RAISE EXCEPTION 'Estado da instalação não permite retry de provision failed' USING ERRCODE = '22023';
    END IF;
    IF _installation.last_provisioned_at IS NOT NULL OR EXISTS (
      SELECT 1 FROM public.installation_operations
      WHERE installation_id = _installation_id
        AND kind = 'provision'
        AND status = 'success'
    ) THEN
      RAISE EXCEPTION 'Instalação já possui provisionamento concluído' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO _retry_operation
    FROM public.installation_operations
    WHERE id = _retry_of_operation_id
      AND installation_id = _installation_id;
    IF NOT FOUND OR _retry_operation.kind <> 'provision' OR _retry_operation.status <> 'failed' THEN
      RAISE EXCEPTION 'Operação informada não é um provision failed desta instalação' USING ERRCODE = '22023';
    END IF;

    SELECT id INTO _latest_provision_id
    FROM public.installation_operations
    WHERE installation_id = _installation_id AND kind = 'provision'
    ORDER BY created_at DESC, id DESC
    LIMIT 1;
    IF _latest_provision_id IS DISTINCT FROM _retry_of_operation_id THEN
      RAISE EXCEPTION 'Somente o provision failed mais recente pode originar retry' USING ERRCODE = '22023';
    END IF;
  END IF;

  INSERT INTO public.installation_operations (
    installation_id, kind, status, summary, steps, detail, actor_id,
    run_token_hash, run_token_expires_at, started_at, last_report_at,
    workflow_version, baseline_id, baseline_hash, next_command, retry_of_operation_id
  ) VALUES (
    _installation_id, _kind, 'pending', _summary,
    coalesce(_steps, '[]'::jsonb),
    coalesce(_detail, '{}'::jsonb) || CASE WHEN _retry_of_operation_id IS NULL THEN '{}'::jsonb ELSE jsonb_build_object(
      'retryOfOperationId', _retry_of_operation_id,
      'retryReason', 'failed_provision'
    ) END,
    _actor_id, _run_token_hash, _run_token_expires_at, now(), now(),
    _workflow_version, _baseline_id, _baseline_hash, 'execute', _retry_of_operation_id
  )
  RETURNING * INTO _operation;

  FOR _step IN SELECT value FROM jsonb_array_elements(coalesce(_steps, '[]'::jsonb))
  LOOP
    INSERT INTO public.installation_operation_steps (
      operation_id, step_key, position, label, state, progress, detail
    ) VALUES (
      _operation.id,
      coalesce(_step->>'id', 'step-' || _position::text),
      _position,
      coalesce(_step->>'label', _step->>'id', 'Etapa'),
      CASE WHEN _step->>'state' IN ('pending','running','done','error','blocked','cancelled')
        THEN _step->>'state' ELSE 'pending' END,
      CASE WHEN (_step->>'percent') ~ '^[0-9]+$'
        THEN least(100, greatest(0, (_step->>'percent')::integer)) ELSE 0 END,
      _step->>'detail'
    );
    _position := _position + 1;
  END LOOP;

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

REVOKE ALL ON FUNCTION public.start_durable_installation_operation(uuid,uuid,text,text,jsonb,jsonb,integer,text,text,text,timestamptz,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_durable_installation_operation(uuid,uuid,text,text,jsonb,jsonb,integer,text,text,text,timestamptz,uuid) TO service_role;

DO $policies$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['installations','installation_operations','installation_credentials'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['installation_operation_steps','installation_operation_effects','installation_operation_outbox','installation_migration_ledger','installation_operation_attempts','installation_operation_migrations'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  END LOOP;
END $policies$;

DROP POLICY IF EXISTS installations_super_admin_all ON public.installations;
CREATE POLICY installations_super_admin_all ON public.installations FOR ALL TO authenticated USING(public.is_super_admin(auth.uid())) WITH CHECK(public.is_super_admin(auth.uid()));
DROP POLICY IF EXISTS installation_operations_super_admin_all ON public.installation_operations;
CREATE POLICY installation_operations_super_admin_all ON public.installation_operations FOR ALL TO authenticated USING(public.is_super_admin(auth.uid())) WITH CHECK(public.is_super_admin(auth.uid()));
DROP POLICY IF EXISTS installation_credentials_super_admin_all ON public.installation_credentials;
CREATE POLICY installation_credentials_super_admin_all ON public.installation_credentials FOR ALL TO authenticated USING(public.is_super_admin(auth.uid())) WITH CHECK(public.is_super_admin(auth.uid()));

DO $policies$
DECLARE t text; policy_name text;
BEGIN
  FOREACH t IN ARRAY ARRAY['installation_operation_steps','installation_operation_effects','installation_operation_outbox','installation_migration_ledger','installation_operation_attempts','installation_operation_migrations'] LOOP
    policy_name := t || '_super_admin_read';
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',policy_name,t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING(public.is_super_admin(auth.uid()))',policy_name,t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated',t);
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated',t);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role',t);
  END LOOP;
END $policies$;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.installations, public.installation_operations, public.installation_credentials TO authenticated;
GRANT ALL ON public.installations, public.installation_operations, public.installation_credentials TO service_role;
REVOKE ALL ON public.installations, public.installation_operations, public.installation_credentials FROM anon;

DO $triggers$
DECLARE t text; trigger_name text;
BEGIN
  FOREACH t IN ARRAY ARRAY['installations','installation_credentials','installation_operation_attempts','installation_operation_steps','installation_operation_effects','installation_operation_outbox','installation_migration_ledger'] LOOP
    trigger_name := CASE t WHEN 'installations' THEN 'installations_touch_updated_at' WHEN 'installation_credentials' THEN 'update_installation_credentials_updated_at' ELSE t || '_touch_updated_at' END;
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I',trigger_name,t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()',trigger_name,t);
  END LOOP;
END $triggers$;
DROP TRIGGER IF EXISTS installation_operation_outbox_disable_legacy ON public.installation_operation_outbox;
CREATE TRIGGER installation_operation_outbox_disable_legacy BEFORE INSERT OR UPDATE OF status ON public.installation_operation_outbox FOR EACH ROW EXECUTE FUNCTION public.cancel_legacy_installation_outbox();

-- The cron is MASTER-only. It converges only when the shared singleton and extensions are available.
DO $cron$
DECLARE v_app_url text;
BEGIN
  IF to_regclass('public.installation') IS NULL OR to_regclass('cron.job') IS NULL OR to_regprocedure('public.cron_secret()') IS NULL THEN RETURN; END IF;
  SELECT rtrim(app_url,'/') INTO v_app_url FROM public.installation LIMIT 1;
  IF v_app_url IS NULL THEN RETURN; END IF;
  IF v_app_url !~ '^https://[a-zA-Z0-9._-]+(:[0-9]+)?$' THEN RAISE EXCEPTION 'installation.app_url inválida para installation-provision-resume (%)',v_app_url; END IF;
  PERFORM cron.unschedule('installation-provision-resume') WHERE EXISTS(SELECT 1 FROM cron.job WHERE jobname='installation-provision-resume');
  PERFORM cron.schedule('installation-provision-resume','* * * * *',format($fmt$select net.http_post(url := %L,headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',public.cron_secret()),body := '{}'::jsonb,timeout_milliseconds := 60000);$fmt$,v_app_url||'/api/public/cron/installation-resume'));
END $cron$;
