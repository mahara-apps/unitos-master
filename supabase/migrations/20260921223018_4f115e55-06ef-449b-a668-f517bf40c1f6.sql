-- MASTER 1.4.14: recuperação auditável da estrutura ausente da antiga 1.4.10.
-- Repairs migration: 20260917184500_legacy_migration_reconciliation.sql
-- Repaired source SHA-256: 7a9dd018e24796b71b62a9bb8abf36da9c7acd358e8d8b1bb16066d141556627
-- Recovery-only: nunca incluir no pacote Client nem reaplicar a migration 1.4.11.

BEGIN;

SELECT pg_advisory_xact_lock(hashtextextended('unitos:master:control-plane-promotion', 0));
SELECT pg_advisory_xact_lock(hashtextextended('unitos:master:installation-operations-freeze', 0));

CREATE TEMP TABLE unitos_recovery_operations_snapshot ON COMMIT DROP AS
SELECT * FROM public.installation_operations;
CREATE TEMP TABLE unitos_recovery_attempts_snapshot ON COMMIT DROP AS
SELECT * FROM public.installation_operation_attempts;

DO $unitos_recovery_precondition$
DECLARE
  _missing_objects text[];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260917190721') THEN
    RAISE EXCEPTION 'Recuperação bloqueada: migration 1.4.11 não está registrada' USING ERRCODE = '55000';
  END IF;
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260917184500') THEN
    RAISE EXCEPTION 'Recuperação bloqueada: migration histórica 1.4.10 já está registrada' USING ERRCODE = '55000';
  END IF;
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260919143000') THEN
    RAISE EXCEPTION 'Recuperação bloqueada: migration de recuperação já está registrada' USING ERRCODE = '55000';
  END IF;
  IF to_regclass('public.installation_operations_freeze') IS NULL
     OR to_regprocedure('public.read_installation_operations_freeze()') IS NULL
     OR NOT coalesce((SELECT frozen FROM public.installation_operations_freeze WHERE singleton IS TRUE), false) THEN
    RAISE EXCEPTION 'Recuperação bloqueada: congelamento global não está ativo' USING ERRCODE = '55000';
  END IF;

  SELECT array_remove(ARRAY[
    CASE WHEN to_regclass('public.installations') IS NULL THEN 'public.installations' END,
    CASE WHEN to_regclass('public.installation_operations') IS NULL THEN 'public.installation_operations' END,
    CASE WHEN to_regprocedure('public.is_super_admin(uuid)') IS NULL THEN 'public.is_super_admin(uuid)' END,
    CASE WHEN to_regprocedure('public.reconcile_installation_operation_migrations(uuid,text,bigint,jsonb)') IS NULL THEN '1.4.11 reconcile RPC' END,
    CASE WHEN to_regprocedure('public.normalize_legacy_installation_operations(integer)') IS NULL THEN '1.4.11 normalize RPC' END
  ], NULL) INTO _missing_objects;
  IF cardinality(_missing_objects) > 0 THEN
    RAISE EXCEPTION 'Recuperação bloqueada: dependências ausentes: %', array_to_string(_missing_objects, ', ') USING ERRCODE = '55000';
  END IF;

  IF to_regclass('public.installation_migration_reconciliation_evidence') IS NOT NULL
     OR EXISTS (
       SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname IN (
         'record_installation_migration_reconciliation_evidence',
         'read_installation_migration_reconciliation_evidence'
       )
     )
     OR EXISTS (
       SELECT 1 FROM pg_policies WHERE schemaname = 'public'
         AND policyname = 'installation_migration_reconciliation_evidence_super_admin_read'
     )
     OR to_regclass('public.installation_migration_reconciliation_evidence_operation_idx') IS NOT NULL THEN
    RAISE EXCEPTION 'Recuperação bloqueada: estrutura 1.4.10 parcial ou divergente' USING ERRCODE = '55000';
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
    RAISE EXCEPTION 'Recuperação bloqueada: existe atividade, lease ou ambiguidade incompatível' USING ERRCODE = '55000';
  END IF;
END
$unitos_recovery_precondition$;

CREATE TABLE public.installation_migration_reconciliation_evidence (
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
CREATE POLICY installation_migration_reconciliation_evidence_super_admin_read
  ON public.installation_migration_reconciliation_evidence
  FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()));
CREATE INDEX installation_migration_reconciliation_evidence_operation_idx
  ON public.installation_migration_reconciliation_evidence(operation_id, package_position);
CREATE TRIGGER installation_operations_freeze_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.installation_migration_reconciliation_evidence
  FOR EACH STATEMENT EXECUTE FUNCTION public.guard_installation_operations_freeze();

CREATE FUNCTION public.record_installation_migration_reconciliation_evidence(
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

CREATE FUNCTION public.read_installation_migration_reconciliation_evidence(_installation_id uuid,_package_hash text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('position',package_position,'migration_file',migration_file,'fingerprint',fingerprint,'classification',classification,'evidence_key',evidence_key,'status',evidence_status,'observed',observed) ORDER BY package_position),'[]'::jsonb)
  FROM public.installation_migration_reconciliation_evidence WHERE installation_id=_installation_id AND package_hash=_package_hash
$$;
REVOKE ALL ON FUNCTION public.read_installation_migration_reconciliation_evidence(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_installation_migration_reconciliation_evidence(uuid,text) TO service_role;

DO $unitos_recovery_postcondition$
DECLARE _table_oid regclass := to_regclass('public.installation_migration_reconciliation_evidence');
BEGIN
  IF _table_oid IS NULL OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = _table_oid)
     OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='installation_migration_reconciliation_evidence' AND policyname='installation_migration_reconciliation_evidence_super_admin_read')
     OR to_regclass('public.installation_migration_reconciliation_evidence_operation_idx') IS NULL THEN
    RAISE EXCEPTION 'Recuperação inválida: tabela, RLS, policy ou índice ausente' USING ERRCODE='55000';
  END IF;
  IF (SELECT count(*) FROM pg_constraint WHERE conrelid = _table_oid AND contype IN ('p','f','u','c')) <> 8 THEN
    RAISE EXCEPTION 'Recuperação inválida: constraints divergentes' USING ERRCODE='55000';
  END IF;
  IF NOT has_table_privilege('service_role', _table_oid, 'SELECT,INSERT,UPDATE,DELETE')
     OR has_table_privilege('anon', _table_oid, 'SELECT,INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION 'Recuperação inválida: ACL da tabela divergente' USING ERRCODE='55000';
  END IF;
  IF EXISTS (
    SELECT 1 FROM (VALUES
      ('record_installation_migration_reconciliation_evidence(uuid,text,bigint,text,jsonb)'),
      ('read_installation_migration_reconciliation_evidence(uuid,text)')
    ) expected(signature)
    LEFT JOIN pg_proc p ON p.oid=to_regprocedure('public.'||expected.signature)
    WHERE p.oid IS NULL OR NOT p.prosecdef OR NOT ('search_path=public'=ANY(coalesce(p.proconfig, ARRAY[]::text[])))
      OR NOT has_function_privilege('service_role',p.oid,'EXECUTE')
      OR has_function_privilege('anon',p.oid,'EXECUTE')
      OR has_function_privilege('authenticated',p.oid,'EXECUTE')
  ) THEN
    RAISE EXCEPTION 'Recuperação inválida: assinatura, segurança ou ACL das RPCs divergente' USING ERRCODE='55000';
  END IF;
END
$unitos_recovery_postcondition$;

DO $unitos_recovery_preservation$
BEGIN
  IF EXISTS ((SELECT * FROM public.installation_operations EXCEPT SELECT * FROM unitos_recovery_operations_snapshot)
             UNION ALL
             (SELECT * FROM unitos_recovery_operations_snapshot EXCEPT SELECT * FROM public.installation_operations))
     OR EXISTS ((SELECT * FROM public.installation_operation_attempts EXCEPT SELECT * FROM unitos_recovery_attempts_snapshot)
             UNION ALL
             (SELECT * FROM unitos_recovery_attempts_snapshot EXCEPT SELECT * FROM public.installation_operation_attempts)) THEN
    RAISE EXCEPTION 'Recuperação alterou operações ou tentativas preservadas' USING ERRCODE='55000';
  END IF;
END $unitos_recovery_preservation$;

-- O executor oficial de migrations registra 20260919143000 somente após este COMMIT.
-- Este artefato nunca escreve diretamente em supabase_migrations.schema_migrations.
COMMIT;