-- MASTER 1.4.27: ato mínimo para ativar exclusivamente o cron 37 já existente.
\set ON_ERROR_STOP on
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('unitos:master:cron-37-activation',0));
SELECT pg_advisory_xact_lock(hashtextextended('unitos:master:installation-operations-freeze',0));
SELECT set_config('unitos.expected_commit_sha', :'expected_commit_sha', true);
SELECT set_config('unitos.expected_contract_sha256', :'expected_contract_sha256', true);
DO $precondition$
DECLARE _before record;
BEGIN
  SELECT jobid,jobname,active,schedule,command INTO STRICT _before
  FROM cron.job WHERE jobid=37 FOR UPDATE;
  IF _before.jobname <> 'installation-provision-resume'
     OR _before.command NOT LIKE '%/api/public/cron/installation-resume%'
     OR _before.command NOT LIKE '%x-cron-secret%'
     OR _before.active IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Cron 37 ausente, divergente ou já ativo' USING ERRCODE='55000';
  END IF;
  IF (SELECT count(*) FROM public.installation_operations_freeze WHERE singleton IS TRUE AND frozen IS FALSE) <> 1 THEN
    RAISE EXCEPTION 'Freeze deve estar instalado e inativo para ativar o cron' USING ERRCODE='55000';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.control_plane_release_state
    WHERE singleton IS TRUE AND current_version='1.4.27' AND pinned_release='1.4.27'
      AND pinned_commit_sha=current_setting('unitos.expected_commit_sha')
      AND contract_sha256=current_setting('unitos.expected_contract_sha256')
  ) OR NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20260919143000')
     OR to_regprocedure('public.finalize_installation_operation(uuid,text,bigint,text,text,text,jsonb,jsonb,text,text,jsonb,text,boolean,boolean)') IS NULL THEN
    RAISE EXCEPTION 'Contrato 1.4.27 ainda não está integralmente validado' USING ERRCODE='55000';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.installation_operations o
    WHERE o.status IS NULL
      OR o.status NOT IN ('pending','running','retryable','blocked','manual_review','success','failed')
      OR o.status IN ('running','retryable')
      OR o.status='pending' AND (o.lease_owner IS NOT NULL OR o.lease_expires_at IS NOT NULL)
      OR o.status IN ('blocked','manual_review','success','failed') AND (
        (o.lease_owner IS NULL) <> (o.lease_expires_at IS NULL)
        OR o.lease_expires_at > now()
        OR o.lease_owner IS NOT NULL AND o.fencing_token IS NULL
        OR EXISTS (
          SELECT 1 FROM public.installation_operation_attempts a
          WHERE a.operation_id=o.id
            AND (a.status='running' OR a.fencing_token IS NULL OR a.fencing_token>o.fencing_token)
        )
      )
  ) OR EXISTS (
    SELECT 1 FROM public.installation_operation_attempts a
    LEFT JOIN public.installation_operations o ON o.id=a.operation_id
    WHERE o.id IS NULL
      OR a.status IS NULL
      OR a.status NOT IN ('running','retryable','completed','failed','exhausted','orphaned','deferred','interrupted')
      OR a.status='running'
      OR a.status IN ('retryable','deferred','interrupted') AND NOT (
        o.status IN ('blocked','manual_review','success','failed')
        AND a.finished_at IS NOT NULL
        AND a.fencing_token IS NOT NULL
        AND o.fencing_token IS NOT NULL
        AND a.fencing_token<=o.fencing_token
      )
  ) THEN
    RAISE EXCEPTION 'Atividade ou ambiguidade impede ativação do cron' USING ERRCODE='55000';
  END IF;
END $precondition$;
SELECT cron.alter_job(job_id := 37, active := true);
DO $postcondition$
BEGIN
  IF (SELECT count(*) FROM cron.job WHERE jobid=37 AND jobname='installation-provision-resume' AND active IS TRUE) <> 1 THEN
    RAISE EXCEPTION 'Ativação exclusiva do cron 37 não foi confirmada' USING ERRCODE='55000';
  END IF;
END $postcondition$;
COMMIT;