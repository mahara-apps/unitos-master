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

DO $$ DECLARE v_app_url text; BEGIN
  SELECT rtrim(app_url,'/') INTO v_app_url FROM public.installation LIMIT 1;
  IF v_app_url IS NULL THEN RETURN; END IF;
  IF v_app_url !~ '^https://[a-zA-Z0-9._-]+(:[0-9]+)?$' THEN RAISE EXCEPTION 'installation.app_url inválida para installation-provision-resume (%)',v_app_url; END IF;
  PERFORM cron.unschedule('installation-provision-resume') WHERE EXISTS(SELECT 1 FROM cron.job WHERE jobname='installation-provision-resume');
  PERFORM cron.schedule('installation-provision-resume','* * * * *',format($fmt$select net.http_post(url := %L,headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',public.cron_secret()),body := '{}'::jsonb,timeout_milliseconds := 60000);$fmt$,v_app_url||'/api/public/cron/installation-resume'));
END $$;