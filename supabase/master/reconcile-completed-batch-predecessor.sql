-- Reconcilia somente uma operação UPDATE já encerrada com sucesso pelo
-- contrato antigo, após comprovar integralmente identidade e efeitos.
-- Executar apenas sob autorização explícita, com todas as variáveis psql.
\set ON_ERROR_STOP on
\if :{?operation_id}
\else
  \echo 'operation_id obrigatório'
  \quit 3
\endif
\if :{?batch_id}
\else
  \echo 'batch_id obrigatório'
  \quit 3
\endif
\if :{?expected_release}
\else
  \echo 'expected_release obrigatório'
  \quit 3
\endif
\if :{?expected_commit}
\else
  \echo 'expected_commit obrigatório'
  \quit 3
\endif
\if :{?expected_hash}
\else
  \echo 'expected_hash obrigatório'
  \quit 3
\endif
\if :{?expected_total}
\else
  \echo 'expected_total obrigatório'
  \quit 3
\endif
\if :{?operator}
\else
  \echo 'operator obrigatório'
  \quit 3
\endif

BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('unitos:master:installation-operations-freeze',0));

CREATE TEMP TABLE _unitos_batch_reconciliation_authorization ON COMMIT DROP AS
SELECT :'operation_id'::uuid AS operation_id,
       :'batch_id'::uuid AS batch_id,
       :'expected_release'::text AS expected_release,
       :'expected_commit'::text AS expected_commit,
       :'expected_hash'::text AS expected_hash,
       :'expected_total'::integer AS expected_total,
       :'operator'::text AS operator;

DO $reconcile$
DECLARE
  _authorization record;
  _operation public.installation_operations%ROWTYPE;
  _installation public.installations%ROWTYPE;
  _freeze_generation bigint;
  _completed_migrations integer;
  _minimum_position integer;
  _maximum_position integer;
  _distinct_positions integer;
BEGIN
  SELECT * INTO STRICT _authorization FROM _unitos_batch_reconciliation_authorization;
  IF _authorization.expected_release !~ '^\d+\.\d+\.\d+$'
     OR _authorization.expected_commit !~ '^[0-9a-f]{7,64}$'
     OR _authorization.expected_hash !~ '^[0-9a-f]{64}$'
     OR _authorization.expected_total < 1
     OR nullif(btrim(_authorization.operator),'') IS NULL THEN
    RAISE EXCEPTION 'Autorização de reconciliação inválida' USING ERRCODE='22023';
  END IF;

  SELECT generation INTO STRICT _freeze_generation
  FROM public.installation_operations_freeze
  WHERE singleton IS TRUE AND frozen IS TRUE
  FOR UPDATE;

  SELECT * INTO STRICT _operation
  FROM public.installation_operations
  WHERE id = _authorization.operation_id
  FOR UPDATE;
  SELECT * INTO STRICT _installation
  FROM public.installations
  WHERE id = _operation.installation_id
  FOR UPDATE;

  IF _operation.kind IS DISTINCT FROM 'update'
     OR _operation.status IS DISTINCT FROM 'success'
     OR _operation.reconciled_at IS NOT NULL
     OR _operation.lease_owner IS NOT NULL
     OR _operation.lease_expires_at IS NOT NULL
     OR _operation.baseline_id IS DISTINCT FROM concat(_authorization.expected_release,':',_authorization.expected_commit,':',_authorization.expected_total)
     OR _operation.baseline_hash IS DISTINCT FROM _authorization.expected_hash
     OR _operation.detail->>'batchId' IS DISTINCT FROM _authorization.batch_id::text
     OR _operation.detail->>'batchPosition' IS DISTINCT FROM '1'
     OR _operation.detail->'stageProgress'->>'updateRelease' IS DISTINCT FROM _authorization.expected_release
     OR lower(coalesce(_operation.detail->'stageProgress'->>'codeSourceSha','')) <> lower(_authorization.expected_commit)
     OR coalesce((_operation.detail->'stageProgress'->>'codeDone')::boolean,false) IS NOT TRUE
     OR coalesce((_operation.detail->'stageProgress'->>'updateDatabaseReconciled')::boolean,false) IS NOT TRUE
     OR coalesce((_operation.detail->'stageProgress'->>'updateValidationPassed')::boolean,false) IS NOT TRUE
     OR jsonb_typeof(_operation.steps) <> 'array'
     OR jsonb_array_length(_operation.steps) <> 5
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(_operation.steps) step WHERE step->>'state' <> 'done')
     OR _installation.current_version IS DISTINCT FROM _authorization.expected_release
     OR _installation.active_operation_id IS NOT NULL
     OR EXISTS (SELECT 1 FROM public.installation_operation_attempts a WHERE a.operation_id=_operation.id AND a.status = 'running') THEN
    RAISE EXCEPTION 'Operação concluída não possui evidência integral e exclusiva' USING ERRCODE='55000';
  END IF;

  SELECT count(*),min(package_position),max(package_position),count(DISTINCT package_position)
  INTO _completed_migrations,_minimum_position,_maximum_position,_distinct_positions
  FROM public.installation_operation_migrations
  WHERE operation_id=_operation.id AND status='completed' AND statement_index=total_statements;
  IF _completed_migrations <> _authorization.expected_total
     OR _minimum_position <> 1
     OR _maximum_position <> _authorization.expected_total
     OR _distinct_positions <> _authorization.expected_total
     OR EXISTS (
       SELECT 1 FROM public.installation_operation_migrations
       WHERE operation_id=_operation.id
         AND (status<>'completed' OR statement_index<>total_statements OR total_statements<0
           OR migration_file !~ '^[0-9]{14}_[A-Za-z0-9_-]+\.sql$'
           OR fingerprint !~ '^[0-9a-z]+-[0-9a-z]+-[0-9a-z]+$')
     ) THEN
    RAISE EXCEPTION 'Ledger da operação concluída está incompleto ou divergente' USING ERRCODE='55000';
  END IF;

  PERFORM public.set_installation_operations_freeze(false,'janela transacional para reconciliar predecessor comprovado',_authorization.operator,_freeze_generation);
  UPDATE public.installation_operations
  SET reconciled_at=now(),
      detail=coalesce(detail,'{}'::jsonb)||jsonb_build_object(
        'reconciliationState','reconciled','appliedRelease',_authorization.expected_release,
        'appliedCommitSha',_authorization.expected_commit,'appliedPackageSha256',_authorization.expected_hash,
        'reconciledAt',now(),'reconciledBy',_authorization.operator)
  WHERE id=_operation.id AND status='success' AND reconciled_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operação mudou durante a reconciliação' USING ERRCODE='40001'; END IF;

  UPDATE public.installations
  SET pinned_release=_authorization.expected_release,
      pinned_commit_sha=_authorization.expected_commit,pinned_at=now(),updated_at=now()
  WHERE id=_operation.installation_id AND current_version=_authorization.expected_release AND active_operation_id IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Instalação mudou durante a reconciliação' USING ERRCODE='40001'; END IF;

  PERFORM public.set_installation_operations_freeze(true,'reparo concluído; aguarda verificação e retomada autorizada',_authorization.operator,_freeze_generation+1);
END $reconcile$;
COMMIT;