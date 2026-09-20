-- Instala exclusivamente o estado e a promoção do próprio Control-plane.
\set ON_ERROR_STOP on
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('unitos:master:control-plane-promotion',0));
SELECT pg_advisory_xact_lock(hashtextextended('unitos:master:installation-operations-freeze',0));
SELECT set_config('unitos.baseline_current_version', :'baseline_current_version', true);
SELECT set_config('unitos.baseline_pinned_release', :'baseline_pinned_release', true);
SELECT set_config('unitos.baseline_pinned_commit_sha', :'baseline_pinned_commit_sha', true);
DO $precondition$
BEGIN
  IF (SELECT count(*) FROM public.installation_operations_freeze WHERE singleton IS TRUE AND frozen IS TRUE) <> 1 THEN
    RAISE EXCEPTION 'Freeze global ausente, inválido ou inativo' USING ERRCODE='55000';
  END IF;
  IF to_regprocedure('public.finalize_installation_operation(uuid,text,bigint,text,text,text,jsonb,jsonb,text,text,jsonb,text,boolean,boolean)') IS NULL
     OR to_regclass('public.installation_migration_reconciliation_evidence') IS NULL
     OR NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20260919143000') THEN
    RAISE EXCEPTION 'Executor ou recovery ainda não validados' USING ERRCODE='55000';
  END IF;
END $precondition$;
\ir 004_control_plane_release_promotion.sql
DO $baseline$
DECLARE
  _current text := current_setting('unitos.baseline_current_version');
  _pinned text := current_setting('unitos.baseline_pinned_release');
  _commit text := current_setting('unitos.baseline_pinned_commit_sha');
BEGIN
  IF nullif(btrim(_current),'') IS NULL OR nullif(btrim(_pinned),'') IS NULL
     OR nullif(btrim(_commit),'') IS NULL THEN
    RAISE EXCEPTION 'Baseline canônico do Control-plane é obrigatório' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.control_plane_release_state(
    singleton,current_version,pinned_release,pinned_commit_sha,generation
  ) VALUES (true,btrim(_current),btrim(_pinned),btrim(_commit),0)
  ON CONFLICT (singleton) DO NOTHING;
  IF (SELECT count(*) FROM public.control_plane_release_state
      WHERE singleton IS TRUE AND current_version=btrim(_current)
        AND pinned_release=btrim(_pinned) AND pinned_commit_sha=btrim(_commit)
        AND generation=0 AND contract_sha256 IS NULL) <> 1 THEN
    RAISE EXCEPTION 'Baseline existente diverge; instalação abortada sem sobrescrita' USING ERRCODE='40001';
  END IF;
END $baseline$;
DO $postcondition$
BEGIN
  IF (SELECT count(*) FROM public.control_plane_release_state WHERE singleton IS TRUE) <> 1
     OR to_regprocedure('public.promote_control_plane_release(bigint,text,text,text,text,text,text,jsonb,text)') IS NULL THEN
    RAISE EXCEPTION 'Contrato de promoção do Control-plane não foi instalado integralmente' USING ERRCODE='55000';
  END IF;
END $postcondition$;
COMMIT;