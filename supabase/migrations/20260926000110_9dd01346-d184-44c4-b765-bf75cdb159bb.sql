CREATE OR REPLACE FUNCTION public.claim_stale_installation_operations(_owner text, _limit integer DEFAULT 3, _lease_seconds integer DEFAULT 180)
RETURNS SETOF public.installation_operations LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF coalesce(trim(_owner), '') = '' OR _limit < 1 OR _limit > 20 OR _lease_seconds < 30 OR _lease_seconds > 900 THEN RAISE EXCEPTION 'Parâmetros de lease inválidos' USING ERRCODE = '22023'; END IF;
  UPDATE public.installation_operations op SET status='manual_review',finished_at=now(),lease_owner=NULL,lease_expires_at=NULL,error_kind='attempts_exhausted',blocked_reason='attempts_exhausted',summary='Limite de falhas automáticas consecutivas atingido. Revise o diagnóstico antes de tentar novamente.',error_detail=coalesce(op.error_detail,'{}'::jsonb)||jsonb_build_object('exhaustedAt',now()) WHERE op.status IN ('pending','running','retryable') AND op.detail->>'automated'='true' AND op.attempt_count>=op.max_attempts AND coalesce(op.lease_expires_at,op.next_attempt_at,op.last_report_at,op.started_at)<=now();
  UPDATE public.installations i SET status='attention',health='degraded',active_operation_id=NULL,last_error='A automação atingiu o limite de falhas consecutivas e precisa de revisão manual.',updated_at=now() WHERE EXISTS (SELECT 1 FROM public.installation_operations op WHERE op.id=i.active_operation_id AND op.status='manual_review');
  RETURN QUERY WITH candidates AS (
    SELECT op.id FROM public.installation_operations op WHERE op.status IN ('pending','running','retryable') AND op.detail->>'automated'='true' AND op.attempt_count<op.max_attempts AND coalesce(op.next_attempt_at,now())<=now() AND (op.lease_expires_at IS NULL OR op.lease_expires_at<=now())
      AND (op.detail->>'batchId' IS NULL OR (
        op.kind='update' AND (op.detail->>'batchPosition') ~ '^[1-9][0-9]*$' AND (op.detail->>'batchTotal') ~ '^[1-9][0-9]*$'
        AND (SELECT count(*) FROM public.installation_operations member WHERE member.kind='update' AND member.detail->>'batchId'=op.detail->>'batchId') = (op.detail->>'batchTotal')::integer
        AND NOT EXISTS (
          SELECT 1 FROM public.installation_operations predecessor
          LEFT JOIN public.installations target ON target.id=predecessor.installation_id
          WHERE predecessor.detail->>'batchId'=op.detail->>'batchId'
            AND (predecessor.detail->>'batchPosition') ~ '^[1-9][0-9]*$'
            AND (predecessor.detail->>'batchPosition')::integer < (op.detail->>'batchPosition')::integer
            AND (predecessor.status <> 'success' OR predecessor.reconciled_at IS NULL
              OR target.pinned_release IS DISTINCT FROM split_part(predecessor.baseline_id,':',1)
              OR target.pinned_commit_sha IS DISTINCT FROM split_part(predecessor.baseline_id,':',2))
        )
      ))
    ORDER BY coalesce(op.next_attempt_at,op.lease_expires_at,op.last_report_at,op.started_at),op.created_at FOR UPDATE OF op SKIP LOCKED LIMIT _limit
  ), claimed AS (
    UPDATE public.installation_operations op SET lease_owner=_owner,lease_expires_at=now()+make_interval(secs=>_lease_seconds),heartbeat_at=now(),last_report_at=now(),status='running',next_attempt_at=NULL,fencing_token=op.fencing_token+1,blocked_reason=NULL,summary=CASE WHEN op.fencing_token=0 THEN 'Operação automática iniciada pelo executor do MASTER.' ELSE 'Operação automática retomada pelo executor do MASTER.' END,metrics=coalesce(op.metrics,'{}'::jsonb)||jsonb_build_object('lastClaimedAt',now(),'lastOwner',_owner) FROM candidates WHERE op.id=candidates.id RETURNING op.*
  ), attempts AS (
    INSERT INTO public.installation_operation_attempts(operation_id,attempt_number,owner,fencing_token,status,started_at,heartbeat_at) SELECT id,fencing_token::integer,lease_owner,fencing_token,'running',now(),now() FROM claimed ON CONFLICT(operation_id,attempt_number) DO UPDATE SET owner=EXCLUDED.owner,fencing_token=EXCLUDED.fencing_token,status='running',error_kind=NULL,error_code=NULL,error_message=NULL,retryable=NULL,started_at=now(),heartbeat_at=now(),finished_at=NULL RETURNING operation_id
  ) SELECT claimed.* FROM claimed LEFT JOIN attempts ON attempts.operation_id=claimed.id;
END $$;
REVOKE ALL ON FUNCTION public.claim_stale_installation_operations(text,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_stale_installation_operations(text,integer,integer) TO service_role;