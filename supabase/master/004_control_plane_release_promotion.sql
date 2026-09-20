-- MASTER 1.4.18: estado e promoção atômica do próprio Control-plane.
-- Não reutiliza instalações ou operações de clientes.

CREATE TABLE IF NOT EXISTS public.control_plane_release_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  current_version text,
  pinned_release text,
  pinned_commit_sha text,
  contract_sha256 text,
  generation bigint NOT NULL DEFAULT 0 CHECK (generation >= 0),
  promoted_by text,
  promoted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (contract_sha256 IS NULL OR contract_sha256 ~ '^[0-9a-f]{64}$')
);
GRANT SELECT ON public.control_plane_release_state TO authenticated;
GRANT SELECT ON public.control_plane_release_state TO service_role;
ALTER TABLE public.control_plane_release_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS control_plane_release_state_super_admin_read ON public.control_plane_release_state;
CREATE POLICY control_plane_release_state_super_admin_read ON public.control_plane_release_state
  FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.control_plane_release_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  generation bigint NOT NULL UNIQUE CHECK (generation > 0),
  previous_current_version text,
  previous_pinned_release text,
  previous_pinned_commit_sha text,
  target_version text NOT NULL,
  target_commit_sha text NOT NULL,
  contract_sha256 text NOT NULL CHECK (contract_sha256 ~ '^[0-9a-f]{64}$'),
  validation_evidence jsonb NOT NULL,
  promoted_by text NOT NULL CHECK (nullif(btrim(promoted_by), '') IS NOT NULL),
  promoted_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.control_plane_release_events TO authenticated;
GRANT SELECT ON public.control_plane_release_events TO service_role;
ALTER TABLE public.control_plane_release_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS control_plane_release_events_super_admin_read ON public.control_plane_release_events;
CREATE POLICY control_plane_release_events_super_admin_read ON public.control_plane_release_events
  FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.promote_control_plane_release(
  _expected_generation bigint,
  _expected_current_version text,
  _expected_pinned_release text,
  _expected_pinned_commit_sha text,
  _target_version text,
  _target_commit_sha text,
  _contract_sha256 text,
  _validation_evidence jsonb,
  _promoted_by text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  _state public.control_plane_release_state%ROWTYPE;
  _next_generation bigint;
BEGIN
  IF _expected_generation IS NULL OR nullif(btrim(_target_version),'') IS NULL
     OR nullif(btrim(_target_commit_sha),'') IS NULL
     OR coalesce(_contract_sha256,'') !~ '^[0-9a-f]{64}$'
     OR nullif(btrim(_promoted_by),'') IS NULL
     OR jsonb_typeof(_validation_evidence) <> 'object'
     OR coalesce((_validation_evidence->>'contractValidated')::boolean,false) IS NOT TRUE
     OR coalesce((_validation_evidence->>'freezeValidated')::boolean,false) IS NOT TRUE
     OR coalesce((_validation_evidence->>'executorValidated')::boolean,false) IS NOT TRUE
     OR coalesce((_validation_evidence->>'recoveryValidated')::boolean,false) IS NOT TRUE
     OR coalesce((_validation_evidence->>'ledgerValidated')::boolean,false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Evidência de promoção do Control-plane incompleta' USING ERRCODE='22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('unitos:master:control-plane-promotion',0));
  PERFORM pg_advisory_xact_lock(hashtextextended('unitos:master:installation-operations-freeze',0));
  SELECT * INTO STRICT _state FROM public.control_plane_release_state
    WHERE singleton IS TRUE FOR UPDATE;

  IF _state.generation <> _expected_generation
     OR _state.current_version IS DISTINCT FROM _expected_current_version
     OR _state.pinned_release IS DISTINCT FROM _expected_pinned_release
     OR _state.pinned_commit_sha IS DISTINCT FROM _expected_pinned_commit_sha THEN
    RAISE EXCEPTION 'Estado do Control-plane divergiu; promoção abortada' USING ERRCODE='40001';
  END IF;
  IF (SELECT count(*) FROM public.installation_operations_freeze WHERE singleton IS TRUE AND frozen IS TRUE) <> 1 THEN
    RAISE EXCEPTION 'Freeze global deve permanecer ativo durante a promoção' USING ERRCODE='55000';
  END IF;
  IF to_regprocedure('public.finalize_installation_operation(uuid,text,bigint,text,text,text,jsonb,jsonb,text,text,jsonb,text,boolean,boolean)') IS NULL
     OR to_regclass('public.installation_migration_reconciliation_evidence') IS NULL
     OR NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20260919143000') THEN
    RAISE EXCEPTION 'Contrato, executor ou recovery do Control-plane não validados' USING ERRCODE='55000';
  END IF;

  _next_generation := _state.generation + 1;
  INSERT INTO public.control_plane_release_events(
    generation,previous_current_version,previous_pinned_release,previous_pinned_commit_sha,
    target_version,target_commit_sha,contract_sha256,validation_evidence,promoted_by
  ) VALUES (
    _next_generation,_state.current_version,_state.pinned_release,_state.pinned_commit_sha,
    btrim(_target_version),btrim(_target_commit_sha),lower(_contract_sha256),_validation_evidence,btrim(_promoted_by)
  );
  UPDATE public.control_plane_release_state SET
    current_version=btrim(_target_version), pinned_release=btrim(_target_version),
    pinned_commit_sha=btrim(_target_commit_sha), contract_sha256=lower(_contract_sha256),
    generation=_next_generation, promoted_by=btrim(_promoted_by), promoted_at=now(), updated_at=now()
  WHERE singleton IS TRUE AND generation=_expected_generation;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fencing da promoção do Control-plane perdido' USING ERRCODE='40001'; END IF;
  RETURN jsonb_build_object('currentVersion',btrim(_target_version),'pinnedRelease',btrim(_target_version),
    'pinnedCommitSha',btrim(_target_commit_sha),'contractSha256',lower(_contract_sha256),'generation',_next_generation);
EXCEPTION WHEN NO_DATA_FOUND OR TOO_MANY_ROWS THEN
  RAISE EXCEPTION 'Estado do Control-plane ausente ou inválido' USING ERRCODE='55000';
END $$;
REVOKE ALL ON FUNCTION public.promote_control_plane_release(bigint,text,text,text,text,text,text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.promote_control_plane_release(bigint,text,text,text,text,text,text,jsonb,text) TO service_role;