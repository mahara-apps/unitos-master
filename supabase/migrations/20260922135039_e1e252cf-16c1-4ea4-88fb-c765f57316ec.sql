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
  _inherited_detail jsonb := '{}'::jsonb;
  _source_baseline_progress jsonb;
  _source_stage_progress jsonb;
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

    IF _baseline_id IS NULL OR _baseline_hash IS NULL
       OR _retry_operation.baseline_id IS DISTINCT FROM _baseline_id
       OR _retry_operation.baseline_hash IS DISTINCT FROM _baseline_hash THEN
      RAISE EXCEPTION 'Retry exige o mesmo pacote selado da operação anterior' USING ERRCODE = '22023';
    END IF;

    _source_baseline_progress := _retry_operation.detail->'baselineProgress';
    IF _source_baseline_progress IS NOT NULL THEN
      IF jsonb_typeof(_source_baseline_progress) <> 'object'
         OR EXISTS (
           SELECT 1 FROM jsonb_each(_source_baseline_progress) e
           WHERE jsonb_typeof(e.value) <> 'number'
         ) THEN
        RAISE EXCEPTION 'Checkpoint de baseline da operação anterior é inválido' USING ERRCODE = '22023';
      END IF;
      _inherited_detail := jsonb_set(_inherited_detail, '{baselineProgress}', _source_baseline_progress, true);
    END IF;

    _source_stage_progress := _retry_operation.detail->'stageProgress';
    IF _source_stage_progress IS NOT NULL THEN
      IF jsonb_typeof(_source_stage_progress) <> 'object' THEN
        RAISE EXCEPTION 'Checkpoint de etapas da operação anterior é inválido' USING ERRCODE = '22023';
      END IF;
      _inherited_detail := jsonb_set(
        _inherited_detail,
        '{stageProgress}',
        jsonb_strip_nulls(jsonb_build_object(
          'codeDone', _source_stage_progress->'codeDone',
          'codeSha', _source_stage_progress->'codeSha',
          'codeRepo', _source_stage_progress->'codeRepo',
          'codeBlobs', _source_stage_progress->'codeBlobs',
          'codeSourceSha', _source_stage_progress->'codeSourceSha',
          'provisionRelease', _source_stage_progress->'provisionRelease'
        )),
        true
      );
    END IF;
  END IF;

  INSERT INTO public.installation_operations (
    installation_id, kind, status, summary, steps, detail, actor_id,
    run_token_hash, run_token_expires_at, started_at, last_report_at,
    workflow_version, baseline_id, baseline_hash, next_command, retry_of_operation_id
  ) VALUES (
    _installation_id, _kind, 'pending', _summary,
    coalesce(_steps, '[]'::jsonb),
    coalesce(_detail, '{}'::jsonb) || _inherited_detail || CASE WHEN _retry_of_operation_id IS NULL THEN '{}'::jsonb ELSE jsonb_build_object(
      'retryOfOperationId', _retry_of_operation_id,
      'retryReason', 'failed_provision',
      'checkpointInheritance', 'same_sealed_package'
    ) END,
    _actor_id, _run_token_hash, _run_token_expires_at, now(), now(),
    _workflow_version, _baseline_id, _baseline_hash, 'execute', _retry_of_operation_id
  )
  RETURNING * INTO _operation;

  IF _retry_of_operation_id IS NOT NULL THEN
    INSERT INTO public.installation_operation_migrations (
      operation_id, migration_file, fingerprint, package_position,
      statement_index, total_statements, status, confirmed_at
    )
    SELECT
      _operation.id, migration_file, fingerprint, package_position,
      statement_index, total_statements, status, confirmed_at
    FROM public.installation_operation_migrations
    WHERE operation_id = _retry_of_operation_id
      AND status = 'completed'
      AND statement_index = total_statements
    ORDER BY package_position;
  END IF;

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