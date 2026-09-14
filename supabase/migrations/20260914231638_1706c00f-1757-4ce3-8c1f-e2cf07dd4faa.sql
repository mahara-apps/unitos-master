CREATE TABLE public.installation_operation_migrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL REFERENCES public.installation_operations(id) ON DELETE CASCADE,
  migration_file text NOT NULL,
  fingerprint text NOT NULL,
  package_position integer NOT NULL,
  statement_index integer NOT NULL DEFAULT 0,
  total_statements integer NOT NULL,
  status text NOT NULL DEFAULT 'running',
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT installation_operation_migrations_position_positive CHECK (package_position > 0),
  CONSTRAINT installation_operation_migrations_statement_bounds CHECK (statement_index >= 0 AND total_statements >= 0 AND statement_index <= total_statements),
  CONSTRAINT installation_operation_migrations_status_valid CHECK (status IN ('running', 'completed')),
  UNIQUE (operation_id, migration_file, fingerprint),
  UNIQUE (operation_id, package_position)
);
GRANT SELECT ON public.installation_operation_migrations TO authenticated;
GRANT ALL ON public.installation_operation_migrations TO service_role;
ALTER TABLE public.installation_operation_migrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY installation_operation_migrations_super_admin_read
ON public.installation_operation_migrations
FOR SELECT TO authenticated
USING (public.is_super_admin(auth.uid()));
CREATE INDEX installation_operation_migrations_operation_status_idx
ON public.installation_operation_migrations(operation_id, status, package_position);

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