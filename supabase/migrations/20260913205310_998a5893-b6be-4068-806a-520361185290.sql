CREATE OR REPLACE FUNCTION public.compare_and_set_installation_generated_secrets(
  _installation_id uuid,
  _expected_updated_at timestamptz,
  _ciphertext text,
  _updated_by uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _changed integer := 0;
BEGIN
  IF _ciphertext IS NULL OR btrim(_ciphertext) = '' THEN
    RAISE EXCEPTION 'ciphertext obrigatório';
  END IF;

  IF _expected_updated_at IS NULL THEN
    INSERT INTO public.installation_credentials (
      installation_id,
      generated_secrets_ciphertext,
      updated_by,
      updated_at
    )
    VALUES (
      _installation_id,
      _ciphertext,
      _updated_by,
      now()
    )
    ON CONFLICT (installation_id) DO NOTHING;
    GET DIAGNOSTICS _changed = ROW_COUNT;
  ELSE
    UPDATE public.installation_credentials
       SET generated_secrets_ciphertext = _ciphertext,
           updated_by = COALESCE(_updated_by, updated_by),
           updated_at = now()
     WHERE installation_id = _installation_id
       AND updated_at = _expected_updated_at;
    GET DIAGNOSTICS _changed = ROW_COUNT;
  END IF;

  RETURN _changed = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.compare_and_set_installation_generated_secrets(uuid, timestamptz, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.compare_and_set_installation_generated_secrets(uuid, timestamptz, text, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compare_and_set_installation_generated_secrets(uuid, timestamptz, text, uuid) TO service_role;

COMMENT ON FUNCTION public.compare_and_set_installation_generated_secrets(uuid, timestamptz, text, uuid) IS
  'CAS service-role-only para preservar secrets gerados sob concorrência.';