DO $test$
DECLARE
  _installation_id uuid;
  _operation_id uuid := gen_random_uuid();
  _owner text := 'master-1.3.95-final-integration';
  _outbox_before bigint;
  _outbox_after bigint;
  _saved boolean;
  _index integer;
  _status text;
  _divergence_blocked boolean := false;
BEGIN
  SELECT id INTO _installation_id FROM public.installations ORDER BY created_at LIMIT 1;
  IF _installation_id IS NULL THEN RAISE EXCEPTION 'Ensaio final requer uma instalação de controle'; END IF;
  SELECT count(*) INTO _outbox_before FROM public.installation_operation_outbox;
  INSERT INTO public.installation_operations(id,installation_id,kind,status,detail,steps,lease_owner,lease_expires_at,fencing_token,max_attempts,workflow_version)
  VALUES (_operation_id,_installation_id,'validate','running',jsonb_build_object('automated',true,'test','master-1.3.95-final'),'[]'::jsonb,_owner,now()+interval '5 minutes',1,8,1);
  _saved := public.checkpoint_installation_migration(_operation_id,_owner,1,'integration.sql','sha-integration',1,25,34,false);
  IF _saved IS DISTINCT FROM true THEN RAISE EXCEPTION 'Checkpoint 25/34 não foi salvo'; END IF;
  _saved := public.checkpoint_installation_migration(_operation_id,_owner,1,'integration.sql','sha-integration',1,20,34,false);
  SELECT statement_index INTO _index FROM public.installation_operation_migrations WHERE operation_id=_operation_id AND package_position=1;
  IF _saved IS DISTINCT FROM true OR _index<>25 THEN RAISE EXCEPTION 'Checkpoint regrediu de 25 para %',_index; END IF;
  _saved := public.checkpoint_installation_migration(_operation_id,_owner,0,'integration.sql','sha-integration',1,26,34,false);
  IF _saved IS DISTINCT FROM false THEN RAISE EXCEPTION 'Fencing divergente foi aceito'; END IF;
  BEGIN
    PERFORM public.checkpoint_installation_migration(_operation_id,_owner,1,'other.sql','sha-other',1,1,1,true);
  EXCEPTION WHEN SQLSTATE 'P0001' THEN _divergence_blocked := true;
  END;
  IF NOT _divergence_blocked THEN RAISE EXCEPTION 'Pacote divergente foi aceito'; END IF;
  _saved := public.checkpoint_installation_migration(_operation_id,_owner,1,'integration.sql','sha-integration',1,34,34,true);
  SELECT statement_index,status INTO _index,_status FROM public.installation_operation_migrations WHERE operation_id=_operation_id AND package_position=1;
  IF _saved IS DISTINCT FROM true OR _index<>34 OR _status<>'completed' THEN RAISE EXCEPTION 'Conclusão 34/34 não foi confirmada'; END IF;
  _saved := public.yield_installation_operation(_operation_id,_owner,1,5);
  IF _saved IS DISTINCT FROM true THEN RAISE EXCEPTION 'Yield não foi salvo'; END IF;
  SELECT count(*) INTO _outbox_after FROM public.installation_operation_outbox;
  IF _outbox_after<>_outbox_before THEN RAISE EXCEPTION 'Fila antiga voltou a crescer'; END IF;
  DELETE FROM public.installation_operations WHERE id=_operation_id;
  IF EXISTS(SELECT 1 FROM public.installation_operation_migrations WHERE operation_id=_operation_id) THEN RAISE EXCEPTION 'Limpeza incompleta'; END IF;
END
$test$;