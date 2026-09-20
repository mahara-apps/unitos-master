-- MASTER 1.4.17: finalização atômica e determinística de UPDATE.
-- Control-plane only. Nunca incluir no pacote Client.

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
  _operation public.installation_operations%ROWTYPE;
  _target_release text;
  _target_commit text;
  _package_hash text;
  _package_total integer;
  _completed_migrations integer;
  _minimum_position integer;
  _maximum_position integer;
  _distinct_positions integer;
BEGIN
  IF _operation_status NOT IN ('success', 'failed', 'blocked', 'manual_review') THEN
    RAISE EXCEPTION 'Estado final inválido' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _operation
  FROM public.installation_operations
  WHERE id = _operation_id
    AND status = 'running'
    AND lease_owner = _owner
    AND fencing_token = _fencing_token
    AND lease_expires_at > now()
  FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;

  IF _operation.kind = 'update' AND _operation_status = 'success' THEN
    _target_release := nullif(split_part(coalesce(_operation.baseline_id, ''), ':', 1), '');
    _target_commit := nullif(split_part(coalesce(_operation.baseline_id, ''), ':', 2), '');
    _package_hash := nullif(btrim(_operation.baseline_hash), '');
    _package_total := CASE WHEN split_part(coalesce(_operation.baseline_id, ''), ':', 3) ~ '^[1-9][0-9]*$'
      THEN split_part(_operation.baseline_id, ':', 3)::integer ELSE NULL END;

    IF _target_release IS NULL OR _target_commit IS NULL OR _package_hash !~ '^[0-9a-f]{64}$'
       OR _package_total IS NULL
       OR _current_version IS DISTINCT FROM _target_release
       OR _detail->'stageProgress'->>'updateRelease' IS DISTINCT FROM _target_release
       OR lower(coalesce(_detail->'stageProgress'->>'codeSourceSha', '')) <> lower(_target_commit)
       OR coalesce((_detail->'stageProgress'->>'codeDone')::boolean, false) IS NOT TRUE
       OR coalesce((_detail->'stageProgress'->>'updateDatabaseReconciled')::boolean, false) IS NOT TRUE
       OR coalesce((_detail->'stageProgress'->>'updateValidationPassed')::boolean, false) IS NOT TRUE
       OR jsonb_typeof(_steps) <> 'array'
       OR jsonb_array_length(_steps) = 0
       OR EXISTS (SELECT 1 FROM jsonb_array_elements(_steps) step WHERE step->>'state' <> 'done') THEN
      RAISE EXCEPTION 'Evidência canônica do UPDATE incompleta ou divergente' USING ERRCODE = '55000';
    END IF;

    SELECT count(*), min(package_position), max(package_position), count(DISTINCT package_position)
    INTO _completed_migrations, _minimum_position, _maximum_position, _distinct_positions
    FROM public.installation_operation_migrations
    WHERE operation_id = _operation_id
      AND status = 'completed'
      AND statement_index = total_statements;
    IF _completed_migrations <> _package_total
       OR _minimum_position <> 1
       OR _maximum_position <> _package_total
       OR _distinct_positions <> _package_total
       OR EXISTS (
         SELECT 1 FROM public.installation_operation_migrations
         WHERE operation_id = _operation_id
           AND (status <> 'completed'
             OR statement_index <> total_statements
             OR total_statements < 0
             OR migration_file !~ '^[0-9]{14}_[A-Za-z0-9_-]+\.sql$'
             OR fingerprint !~ '^[0-9a-f]{64}$')
       ) THEN
      RAISE EXCEPTION 'Ledger canônico do UPDATE incompleto ou inconsistente' USING ERRCODE = '55000';
    END IF;
    _detail := coalesce(_detail, '{}'::jsonb) || jsonb_build_object(
      'reconciliationState', 'reconciled',
      'appliedRelease', _target_release,
      'appliedCommitSha', _target_commit,
      'appliedPackageSha256', _package_hash,
      'reconciledAt', now()
    );
  END IF;

  UPDATE public.installation_operations
  SET status = _operation_status, summary = _summary, error_kind = _error_kind,
      detail = _detail, steps = _steps, current_step = NULL, next_attempt_at = NULL,
      next_command = NULL, lease_owner = NULL, lease_expires_at = NULL,
      run_token_hash = NULL, finished_at = now(), heartbeat_at = now(), last_report_at = now(),
      reconciled_at = CASE WHEN kind = 'update' AND _operation_status = 'success' THEN now() ELSE reconciled_at END
  WHERE id = _operation_id AND status = 'running' AND lease_owner = _owner
    AND fencing_token = _fencing_token;
  IF NOT FOUND THEN RETURN false; END IF;

  UPDATE public.installation_operation_attempts
  SET status = CASE WHEN _operation_status = 'success' THEN 'completed' ELSE _operation_status END,
      error_kind = _error_kind,
      error_message = CASE WHEN _operation_status = 'success' THEN NULL ELSE _summary END,
      retryable = false, finished_at = now(), heartbeat_at = now(), updated_at = now()
  WHERE operation_id = _operation_id AND fencing_token = _fencing_token AND status = 'running';

  UPDATE public.installations
  SET status = _installation_status, health = _health, health_checks = _health_checks,
      health_checked_at = now(), active_operation_id = NULL,
      last_error = CASE WHEN _operation_status = 'success' THEN NULL ELSE _summary END,
      current_version = coalesce(_current_version, current_version),
      pinned_release = CASE WHEN _operation.kind = 'update' AND _operation_status = 'success' THEN _target_release ELSE pinned_release END,
      pinned_commit_sha = CASE WHEN _operation.kind = 'update' AND _operation_status = 'success' THEN _target_commit ELSE pinned_commit_sha END,
      pinned_at = CASE WHEN _operation.kind = 'update' AND _operation_status = 'success' THEN now() ELSE pinned_at END,
      last_provisioned_at = CASE WHEN _touch_provisioned THEN now() ELSE last_provisioned_at END,
      last_validated_at = CASE WHEN _touch_validated THEN now() ELSE last_validated_at END,
      updated_at = now()
  WHERE id = _operation.installation_id AND active_operation_id = _operation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Instalação não aponta para a operação finalizada' USING ERRCODE = '55000'; END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.finalize_installation_operation(uuid,text,bigint,text,text,text,jsonb,jsonb,text,text,jsonb,text,boolean,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_installation_operation(uuid,text,bigint,text,text,text,jsonb,jsonb,text,text,jsonb,text,boolean,boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.normalize_legacy_installation_operations(_max_idle_seconds integer DEFAULT 240)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _leases integer := 0; _attempts integer := 0; _manual integer := 0; _inconsistent integer := 0;
BEGIN
  IF _max_idle_seconds < 30 OR _max_idle_seconds > 86400 THEN RAISE EXCEPTION 'Janela de normalização inválida' USING ERRCODE='22023'; END IF;
  WITH normalized AS (
    UPDATE public.installation_operations op SET status='manual_review',lease_owner=NULL,lease_expires_at=NULL,
      next_attempt_at=NULL,next_command=NULL,finished_at=coalesce(finished_at,now()),
      error_kind=coalesce(error_kind,'legacy_lease_inconsistent'),blocked_reason='legacy_lease_inconsistent',
      summary='Operação histórica bloqueada: lease inconsistente.',last_report_at=now()
    WHERE op.status IN ('pending','running','retryable') AND op.lease_owner IS NOT NULL AND op.lease_expires_at IS NULL RETURNING id
  ) SELECT count(*) INTO _leases FROM normalized;
  WITH closed AS (
    UPDATE public.installation_operation_attempts a SET status='orphaned',error_kind=coalesce(a.error_kind,'orphaned_attempt'),
      error_message=coalesce(a.error_message,'Tentativa sem lease ativo encerrada por reconciliação.'),retryable=false,
      finished_at=coalesce(a.finished_at,now()),heartbeat_at=now(),updated_at=now()
    FROM public.installation_operations op WHERE a.operation_id=op.id AND a.status='running'
      AND a.heartbeat_at<=now()-make_interval(secs=>_max_idle_seconds)
      AND (op.status NOT IN ('pending','running','retryable') OR op.fencing_token<>a.fencing_token OR op.lease_expires_at IS NULL OR op.lease_expires_at<=now()) RETURNING a.id
  ) SELECT count(*) INTO _attempts FROM closed;
  WITH detached AS (
    UPDATE public.installations i SET status='attention',health='degraded',active_operation_id=NULL,
      last_error=coalesce(op.summary,'Operação requer revisão manual.'),updated_at=now()
    FROM public.installation_operations op WHERE i.active_operation_id=op.id AND op.status IN ('blocked','manual_review','failed') RETURNING i.id
  ) SELECT count(*) INTO _manual FROM detached;
  WITH marked AS (
    UPDATE public.installations i SET status='attention',health='degraded',
      last_error='Estado updating sem operação executável; revisão manual obrigatória.',updated_at=now()
    WHERE i.status='updating' AND (i.active_operation_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.installation_operations op WHERE op.id=i.active_operation_id
        AND op.installation_id=i.id AND op.status IN ('pending','running','retryable') AND op.detail->>'automated'='true')) RETURNING i.id
  ) SELECT count(*) INTO _inconsistent FROM marked;
  RETURN jsonb_build_object('normalizedLeases',_leases,'orphanedAttempts',_attempts,
    'detachedManualReview',_manual,'inconsistentUpdating',_inconsistent,'migrationsExecuted',0);
END $$;
REVOKE ALL ON FUNCTION public.normalize_legacy_installation_operations(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_legacy_installation_operations(integer) TO service_role;