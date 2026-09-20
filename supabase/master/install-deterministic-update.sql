-- Instala exclusivamente o executor determinístico sob freeze ativo.
\set ON_ERROR_STOP on
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('unitos:master:installation-operations-freeze',0));
DO $preflight$
BEGIN
  IF (SELECT count(*) FROM public.installation_operations_freeze WHERE singleton IS TRUE AND frozen IS TRUE) <> 1 THEN
    RAISE EXCEPTION 'Freeze global ausente, inválido ou inativo' USING ERRCODE='55000';
  END IF;
  IF EXISTS (SELECT 1 FROM public.installation_operations WHERE status IN ('pending','running','retryable'))
     OR EXISTS (SELECT 1 FROM public.installation_operation_attempts WHERE status IN ('running','retryable')) THEN
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
