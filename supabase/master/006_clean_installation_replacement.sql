-- MASTER 1.4.25: vínculo fail-closed para substituição limpa de instalações.
-- Control-plane only. Nunca incluir no pacote Client.

ALTER TABLE public.installations
  ADD COLUMN IF NOT EXISTS clean_replacement_of uuid REFERENCES public.installations(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS pending_domain text;

CREATE UNIQUE INDEX IF NOT EXISTS installations_one_clean_replacement
  ON public.installations (clean_replacement_of)
  WHERE clean_replacement_of IS NOT NULL;

COMMENT ON COLUMN public.installations.clean_replacement_of IS
  'Instalação antiga preservada enquanto esta substituição limpa é provisionada e validada.';
COMMENT ON COLUMN public.installations.pending_domain IS
  'Domínio institucional preservado para cutover posterior; não é usado durante o provisionamento isolado.';

CREATE OR REPLACE FUNCTION public.prepare_clean_installation_replacement_cutover(
  _replacement_id uuid,
  _expected_release text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  _replacement public.installations%ROWTYPE;
  _source public.installations%ROWTYPE;
BEGIN
  SELECT * INTO _replacement FROM public.installations WHERE id=_replacement_id FOR UPDATE;
  IF NOT FOUND OR _replacement.clean_replacement_of IS NULL THEN
    RAISE EXCEPTION 'Substituição limpa não encontrada' USING ERRCODE='22023';
  END IF;
  SELECT * INTO STRICT _source FROM public.installations WHERE id=_replacement.clean_replacement_of FOR UPDATE;
  IF _replacement.active_operation_id IS NOT NULL OR _source.active_operation_id IS NOT NULL
     OR _replacement.status <> 'up_to_date' OR _replacement.health <> 'healthy'
     OR _replacement.current_version IS DISTINCT FROM _expected_release
     OR nullif(btrim(_replacement.pending_domain),'') IS NULL
     OR _replacement.domain IS NOT NULL THEN
    RAISE EXCEPTION 'Substituição ainda não possui evidência completa para o cutover' USING ERRCODE='55000';
  END IF;
  IF _source.domain IS DISTINCT FROM _replacement.pending_domain THEN
    RAISE EXCEPTION 'Domínio institucional divergiu desde a abertura da substituição' USING ERRCODE='55000';
  END IF;
  UPDATE public.installations SET clean_replacement_of=NULL,updated_at=now() WHERE id=_replacement.id;
  DELETE FROM public.installations WHERE id=_source.id;
  UPDATE public.installations SET name=_source.name,slug=_source.slug,domain=_replacement.pending_domain,
    pending_domain=NULL,notes=_source.notes,updated_at=now() WHERE id=_replacement.id;
  RETURN jsonb_build_object('replacementId',_replacement.id,'sourceId',_source.id,'domain',_replacement.pending_domain);
END $$;

REVOKE ALL ON FUNCTION public.prepare_clean_installation_replacement_cutover(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_clean_installation_replacement_cutover(uuid,text) TO service_role;