-- MASTER 1.4.15: congelamento global fail-closed do Installation Manager.
-- Control-plane only. Nunca incluir no pacote Client.

CREATE TABLE public.installation_operations_freeze (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  frozen boolean NOT NULL DEFAULT false,
  generation bigint NOT NULL DEFAULT 0 CHECK (generation >= 0),
  reason text,
  changed_by text,
  changed_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((frozen AND nullif(btrim(reason), '') IS NOT NULL) OR NOT frozen)
);
GRANT SELECT ON public.installation_operations_freeze TO authenticated;
GRANT SELECT ON public.installation_operations_freeze TO service_role;
ALTER TABLE public.installation_operations_freeze ENABLE ROW LEVEL SECURITY;
CREATE POLICY installation_operations_freeze_super_admin_read
  ON public.installation_operations_freeze FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE TABLE public.installation_operations_freeze_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  generation bigint NOT NULL CHECK (generation > 0),
  frozen boolean NOT NULL,
  reason text NOT NULL CHECK (nullif(btrim(reason), '') IS NOT NULL),
  changed_by text NOT NULL CHECK (nullif(btrim(changed_by), '') IS NOT NULL),
  changed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (generation)
);
GRANT SELECT ON public.installation_operations_freeze_events TO authenticated;
GRANT SELECT ON public.installation_operations_freeze_events TO service_role;
ALTER TABLE public.installation_operations_freeze_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY installation_operations_freeze_events_super_admin_read
  ON public.installation_operations_freeze_events FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

INSERT INTO public.installation_operations_freeze(singleton, frozen, generation)
VALUES (true, false, 0);

CREATE FUNCTION public.read_installation_operations_freeze()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE _row public.installation_operations_freeze%ROWTYPE;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado ao estado do congelamento global' USING ERRCODE='42501';
  END IF;
  SELECT * INTO STRICT _row FROM public.installation_operations_freeze WHERE singleton IS TRUE;
  RETURN jsonb_build_object('frozen',_row.frozen,'generation',_row.generation,
    'reason',_row.reason,'changedBy',_row.changed_by,'changedAt',_row.changed_at);
EXCEPTION WHEN NO_DATA_FOUND OR TOO_MANY_ROWS THEN
  RAISE EXCEPTION 'Estado do congelamento global ausente ou inválido' USING ERRCODE='55000';
END $$;
REVOKE ALL ON FUNCTION public.read_installation_operations_freeze() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_installation_operations_freeze() TO authenticated,service_role;

CREATE FUNCTION public.set_installation_operations_freeze(
  _frozen boolean, _reason text, _changed_by text, _expected_generation bigint
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _current public.installation_operations_freeze%ROWTYPE; _next_generation bigint;
BEGIN
  IF _frozen IS NULL OR nullif(btrim(_reason),'') IS NULL
     OR nullif(btrim(_changed_by),'') IS NULL OR _expected_generation IS NULL THEN
    RAISE EXCEPTION 'Contrato de congelamento inválido' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('unitos:master:installation-operations-freeze',0));
  SELECT * INTO STRICT _current FROM public.installation_operations_freeze
    WHERE singleton IS TRUE FOR UPDATE;
  IF _current.generation <> _expected_generation THEN
    RAISE EXCEPTION 'Geração do congelamento divergiu; releia o estado' USING ERRCODE='40001';
  END IF;
  IF _current.frozen = _frozen THEN
    RAISE EXCEPTION 'Congelamento já está no estado solicitado' USING ERRCODE='55000';
  END IF;
  IF _frozen AND (
    EXISTS (SELECT 1 FROM public.installation_operations WHERE status IN ('pending','running','retryable'))
    OR EXISTS (SELECT 1 FROM public.installation_operation_attempts WHERE status IN ('running','retryable'))
  ) THEN
    RAISE EXCEPTION 'Congelamento bloqueado: existem operações ou tentativas ativas' USING ERRCODE='55000';
  END IF;
  _next_generation := _current.generation + 1;
  UPDATE public.installation_operations_freeze SET frozen=_frozen,generation=_next_generation,
    reason=btrim(_reason),changed_by=btrim(_changed_by),changed_at=now() WHERE singleton IS TRUE;
  INSERT INTO public.installation_operations_freeze_events(generation,frozen,reason,changed_by)
    VALUES (_next_generation,_frozen,btrim(_reason),btrim(_changed_by));
  RETURN public.read_installation_operations_freeze();
EXCEPTION WHEN NO_DATA_FOUND OR TOO_MANY_ROWS THEN
  RAISE EXCEPTION 'Estado do congelamento global ausente ou inválido' USING ERRCODE='55000';
END $$;
REVOKE ALL ON FUNCTION public.set_installation_operations_freeze(boolean,text,text,bigint)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.set_installation_operations_freeze(boolean,text,text,bigint) TO service_role;

CREATE FUNCTION public.guard_installation_operations_freeze()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _frozen boolean;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('unitos:master:installation-operations-freeze',0));
  SELECT frozen INTO STRICT _frozen FROM public.installation_operations_freeze WHERE singleton IS TRUE;
  IF _frozen IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Installation Manager congelado: mutação operacional bloqueada' USING ERRCODE='55000';
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
EXCEPTION WHEN NO_DATA_FOUND OR TOO_MANY_ROWS THEN
  RAISE EXCEPTION 'Estado do congelamento ausente ou inválido; mutação bloqueada' USING ERRCODE='55000';
END $$;
REVOKE ALL ON FUNCTION public.guard_installation_operations_freeze() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.guard_installation_operations_freeze() TO service_role;

DO $unitos_freeze_triggers$
DECLARE _table text;
BEGIN
  FOREACH _table IN ARRAY ARRAY['installations','installation_credentials','installation_operations',
    'installation_operation_attempts','installation_operation_steps','installation_operation_outbox',
    'installation_operation_migrations','installation_migration_reconciliation_evidence'] LOOP
    IF to_regclass('public.' || _table) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS installation_operations_freeze_guard ON public.%I',_table);
      EXECUTE format('CREATE TRIGGER installation_operations_freeze_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.guard_installation_operations_freeze()',_table);
    END IF;
  END LOOP;
END $unitos_freeze_triggers$;
DO $unitos_freeze_postcondition$
DECLARE _guarded integer; _singleton integer;
BEGIN
  SELECT count(*) INTO _guarded
  FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE NOT t.tgisinternal AND t.tgname='installation_operations_freeze_guard' AND n.nspname='public'
    AND c.relname IN ('installations','installation_credentials','installation_operations',
      'installation_operation_attempts','installation_operation_steps','installation_operation_outbox',
      'installation_operation_migrations','installation_migration_reconciliation_evidence');
  SELECT count(*) INTO _singleton FROM public.installation_operations_freeze WHERE singleton IS TRUE;
  IF _guarded <> (7 + CASE WHEN to_regclass('public.installation_migration_reconciliation_evidence') IS NULL THEN 0 ELSE 1 END)
     OR _singleton <> 1 THEN
    RAISE EXCEPTION 'Pós-condição do freeze global falhou' USING ERRCODE='55000';
  END IF;
END $unitos_freeze_postcondition$;
