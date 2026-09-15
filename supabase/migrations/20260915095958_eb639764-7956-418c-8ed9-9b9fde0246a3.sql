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

  SELECT * INTO _installation
  FROM public.installations
  WHERE id = _installation_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Instalação não encontrada' USING ERRCODE = 'P0002';
  END IF;

  IF _installation.active_operation_id IS NOT NULL OR EXISTS (
    SELECT 1
    FROM public.installation_operations
    WHERE installation_id = _installation_id
      AND status IN ('pending', 'running', 'retryable')
  ) THEN
    RAISE EXCEPTION 'Já existe uma operação pendente ou em andamento nesta instalação' USING ERRCODE = '55P03';
  END IF;

  INSERT INTO public.installation_operations (
    installation_id, kind, status, summary, steps, detail, actor_id,
    run_token_hash, run_token_expires_at, started_at, last_report_at,
    workflow_version, baseline_id, baseline_hash, next_command
  ) VALUES (
    _installation_id, _kind, 'pending', _summary,
    coalesce(_steps, '[]'::jsonb), coalesce(_detail, '{}'::jsonb), _actor_id,
    _run_token_hash, _run_token_expires_at, now(), now(),
    _workflow_version, _baseline_id, _baseline_hash, 'execute'
  )
  RETURNING * INTO _operation;

  FOR _step IN
    SELECT value FROM jsonb_array_elements(coalesce(_steps, '[]'::jsonb))
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

REVOKE ALL ON FUNCTION public.start_durable_installation_operation(uuid,uuid,text,text,jsonb,jsonb,integer,text,text,text,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_durable_installation_operation(uuid,uuid,text,text,jsonb,jsonb,integer,text,text,text,timestamptz) TO service_role;