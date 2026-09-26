-- Instala exclusivamente o executor determinístico sob freeze ativo.
\set ON_ERROR_STOP on
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('unitos:master:installation-operations-freeze',0));
DO $preflight$
BEGIN
  IF (SELECT count(*) FROM public.installation_operations_freeze WHERE singleton IS TRUE AND frozen IS TRUE) <> 1 THEN
    RAISE EXCEPTION 'Freeze global ausente, inválido ou inativo' USING ERRCODE='55000';
  END IF;
   IF EXISTS (
       SELECT 1 FROM public.installation_operations
        WHERE status IN ('running','retryable')
          OR status='pending' AND (lease_owner IS NOT NULL OR lease_expires_at IS NOT NULL)
          OR status IN ('blocked','manual_review','success','failed') AND (
            (lease_owner IS NULL) <> (lease_expires_at IS NULL) OR lease_expires_at > now() OR fencing_token IS NULL
            OR EXISTS (SELECT 1 FROM public.installation_operation_attempts a WHERE a.operation_id=installation_operations.id
              AND (a.status='running' OR a.fencing_token IS NULL OR a.fencing_token>installation_operations.fencing_token))
          )
         OR status IS NULL
         OR status NOT IN ('pending','running','retryable','blocked','manual_review','success','failed')
     ) OR EXISTS (
       SELECT 1 FROM public.installation_operation_attempts a
       LEFT JOIN public.installation_operations o ON o.id = a.operation_id
        WHERE o.id IS NULL OR a.status = 'running'
         OR a.status IS NULL
          OR a.status NOT IN ('running','retryable','completed','failed','exhausted','orphaned','deferred','interrupted')
          OR a.status IN ('retryable','deferred','interrupted') AND NOT (
            o.status IN ('blocked','manual_review','success','failed') AND a.finished_at IS NOT NULL
            AND a.fencing_token IS NOT NULL AND o.fencing_token IS NOT NULL AND a.fencing_token<=o.fencing_token
          )
     ) THEN
    RAISE EXCEPTION 'Operações ou tentativas ativas impedem a instalação' USING ERRCODE='55000';
  END IF;
END $preflight$;
\ir 003_control_plane_deterministic_update.sql
DO $postcondition$
DECLARE _definition text;
BEGIN
  SELECT pg_get_functiondef('public.finalize_installation_operation(uuid,text,bigint,text,text,text,jsonb,jsonb,text,text,jsonb,text,boolean,boolean)'::regprocedure) INTO STRICT _definition;
  IF position('lease_expires_at > now()' in _definition)=0
     OR position('_minimum_position <> 1' in _definition)=0
     OR position('_maximum_position <> _package_total' in _definition)=0
     OR position('_distinct_positions <> _package_total' in _definition)=0
      OR position("fingerprint !~ '^[0-9a-z]+-[0-9a-z]+-[0-9a-z]+$'" in _definition)=0
      OR position("fingerprint !~ '^[0-9a-f]{64}$'" in _definition)>0
     OR position('pinned_release = CASE' in _definition)=0
     OR position('pinned_commit_sha = CASE' in _definition)=0 THEN
    RAISE EXCEPTION 'Pós-condição do executor determinístico falhou' USING ERRCODE='55000';
  END IF;
  IF EXISTS (
    SELECT 1 FROM aclexplode(coalesce((SELECT proacl FROM pg_proc WHERE oid='public.finalize_installation_operation(uuid,text,bigint,text,text,text,jsonb,jsonb,text,text,jsonb,text,boolean,boolean)'::regprocedure), acldefault('f', 10))) acl
    WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE'
  ) THEN RAISE EXCEPTION 'PUBLIC não pode executar a finalização' USING ERRCODE='55000'; END IF;
END $postcondition$;
COMMIT;
