CREATE TABLE IF NOT EXISTS public.installation_migration_reconciliation_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  installation_id uuid NOT NULL REFERENCES public.installations(id) ON DELETE CASCADE,
  operation_id uuid NOT NULL REFERENCES public.installation_operations(id) ON DELETE CASCADE,
  package_hash text NOT NULL,
  migration_file text NOT NULL,
  fingerprint text NOT NULL,
  package_position integer NOT NULL CHECK (package_position > 0),
  classification text NOT NULL CHECK (classification IN ('canonical_state', 'partial_compatibility', 'external_checkpoint_required')),
  evidence_key text NOT NULL,
  evidence_status text NOT NULL CHECK (evidence_status IN ('compatible', 'divergent', 'insufficient')),
  observed text NOT NULL,
  verified_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (installation_id, package_hash, package_position),
  UNIQUE (installation_id, package_hash, evidence_key)
);
REVOKE ALL ON public.installation_migration_reconciliation_evidence FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.installation_migration_reconciliation_evidence TO authenticated;
GRANT ALL ON public.installation_migration_reconciliation_evidence TO service_role;
ALTER TABLE public.installation_migration_reconciliation_evidence ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS installation_migration_reconciliation_evidence_super_admin_read ON public.installation_migration_reconciliation_evidence;
CREATE POLICY installation_migration_reconciliation_evidence_super_admin_read ON public.installation_migration_reconciliation_evidence
  FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()));
CREATE INDEX IF NOT EXISTS installation_migration_reconciliation_evidence_operation_idx
  ON public.installation_migration_reconciliation_evidence(operation_id, package_position);

CREATE OR REPLACE FUNCTION public.record_installation_migration_reconciliation_evidence(
  _operation_id uuid, _owner text, _fencing_token bigint, _package_hash text, _evidence jsonb
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _installation_id uuid; _saved integer := 0;
BEGIN
  IF jsonb_typeof(_evidence)<>'array' OR coalesce(_package_hash,'')='' THEN RAISE EXCEPTION 'Contrato de evidências inválido' USING ERRCODE='22023'; END IF;
  SELECT installation_id INTO _installation_id FROM public.installation_operations
   WHERE id=_operation_id AND status='running' AND lease_owner=_owner AND fencing_token=_fencing_token AND lease_expires_at>now() FOR UPDATE;
  IF _installation_id IS NULL THEN RAISE EXCEPTION 'Lease da operação inválido' USING ERRCODE='55000'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(_evidence) a JOIN jsonb_array_elements(_evidence) b ON a->>'evidence_key'=b->>'evidence_key' AND (a->>'position')::integer<>(b->>'position')::integer)
    THEN RAISE EXCEPTION 'Evidência reutilizada entre migrations' USING ERRCODE='22023'; END IF;
  WITH incoming AS (
    SELECT value->>'migration_file' migration_file,value->>'fingerprint' fingerprint,(value->>'position')::integer package_position,
      value->>'classification' classification,value->>'evidence_key' evidence_key,value->>'status' evidence_status,coalesce(value->>'observed','') observed
    FROM jsonb_array_elements(_evidence)
    WHERE value->>'classification' IN ('canonical_state','partial_compatibility','external_checkpoint_required')
      AND value->>'status' IN ('compatible','divergent','insufficient') AND coalesce(value->>'evidence_key','')<>''
      AND coalesce(value->>'migration_file','')<>'' AND coalesce(value->>'fingerprint','')<>'' AND (value->>'position')::integer>0
  ), saved AS (
    INSERT INTO public.installation_migration_reconciliation_evidence
      (installation_id,operation_id,package_hash,migration_file,fingerprint,package_position,classification,evidence_key,evidence_status,observed,verified_at)
    SELECT _installation_id,_operation_id,_package_hash,migration_file,fingerprint,package_position,classification,evidence_key,evidence_status,observed,now() FROM incoming
    ON CONFLICT (installation_id,package_hash,package_position) DO UPDATE SET operation_id=excluded.operation_id,classification=excluded.classification,
      evidence_key=excluded.evidence_key,evidence_status=CASE WHEN public.installation_migration_reconciliation_evidence.classification='external_checkpoint_required' AND public.installation_migration_reconciliation_evidence.evidence_status='compatible' THEN 'compatible' ELSE excluded.evidence_status END,
      observed=CASE WHEN public.installation_migration_reconciliation_evidence.classification='external_checkpoint_required' AND public.installation_migration_reconciliation_evidence.evidence_status='compatible' THEN public.installation_migration_reconciliation_evidence.observed ELSE excluded.observed END,
      verified_at=now(),updated_at=now()
    WHERE public.installation_migration_reconciliation_evidence.migration_file=excluded.migration_file AND public.installation_migration_reconciliation_evidence.fingerprint=excluded.fingerprint
    RETURNING 1
  ) SELECT count(*) INTO _saved FROM saved;
  RETURN _saved;
END $$;
REVOKE ALL ON FUNCTION public.record_installation_migration_reconciliation_evidence(uuid,text,bigint,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_installation_migration_reconciliation_evidence(uuid,text,bigint,text,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.read_installation_migration_reconciliation_evidence(_installation_id uuid,_package_hash text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('position',package_position,'migration_file',migration_file,'fingerprint',fingerprint,'classification',classification,'evidence_key',evidence_key,'status',evidence_status,'observed',observed) ORDER BY package_position),'[]'::jsonb)
  FROM public.installation_migration_reconciliation_evidence WHERE installation_id=_installation_id AND package_hash=_package_hash
$$;
REVOKE ALL ON FUNCTION public.read_installation_migration_reconciliation_evidence(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_installation_migration_reconciliation_evidence(uuid,text) TO service_role;