CREATE TABLE public.installation_email_credentials (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  provider text NOT NULL DEFAULT 'resend' CHECK (provider = 'resend'),
  ciphertext text NOT NULL,
  masked text NOT NULL,
  validation_status text NOT NULL DEFAULT 'pending'
    CHECK (validation_status IN ('pending', 'ready', 'action_required')),
  validation_code text,
  verified_at timestamptz,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.installation_email_credentials TO service_role;

ALTER TABLE public.installation_email_credentials ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER installation_email_credentials_touch_updated_at
BEFORE UPDATE ON public.installation_email_credentials
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

WITH legacy AS (
  SELECT
    min(ciphertext) AS ciphertext,
    min(masked) AS masked,
    min(nullif(trim(metadata->>'handle'), '')) AS sender,
    (array_agg(updated_by ORDER BY updated_at DESC NULLS LAST))[1] AS updated_by,
    count(*) AS total
  FROM public.brand_api_credentials
  WHERE provider = 'resend'
)
INSERT INTO public.installation_email_credentials (
  id, provider, ciphertext, masked, validation_status, validation_code, updated_by
)
SELECT true, 'resend', ciphertext, masked, 'pending', 'validacao_pendente', updated_by
FROM legacy
WHERE total = 1
  AND ciphertext IS NOT NULL
  AND sender ~* '^(?:[^<>]+<)?[^[:space:]<>@]+@[^[:space:]<>@]+\.[^[:space:]<>@]+>?$'
ON CONFLICT (id) DO NOTHING;

WITH legacy AS (
  SELECT min(nullif(trim(metadata->>'handle'), '')) AS sender, count(*) AS total
  FROM public.brand_api_credentials
  WHERE provider = 'resend'
)
UPDATE public.installation
SET email_from = CASE
      WHEN legacy.sender LIKE '%<%>' THEN substring(legacy.sender FROM '<([^>]+)>')
      ELSE legacy.sender
    END,
    email_from_name = CASE
      WHEN legacy.sender LIKE '%<%>' THEN nullif(trim(split_part(legacy.sender, '<', 1)), '')
      ELSE email_from_name
    END,
    updated_at = now()
FROM legacy
WHERE installation.id = true
  AND legacy.total = 1
  AND legacy.sender ~* '^(?:[^<>]+<)?[^[:space:]<>@]+@[^[:space:]<>@]+\.[^[:space:]<>@]+>?$'
  AND nullif(trim(installation.email_from), '') IS NULL;

CREATE OR REPLACE FUNCTION public.save_installation_email_configuration(
  _ciphertext text,
  _masked text,
  _email_from text,
  _email_from_name text,
  _validation_status text,
  _validation_code text,
  _verified_at timestamptz,
  _updated_by uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _validation_status NOT IN ('pending', 'ready', 'action_required') THEN
    RAISE EXCEPTION 'Estado de validação inválido' USING ERRCODE = '22023';
  END IF;

  UPDATE public.installation
  SET email_from = _email_from,
      email_from_name = nullif(trim(_email_from_name), ''),
      updated_at = now()
  WHERE id = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Configuração da instalação não encontrada' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.installation_email_credentials (
    id, provider, ciphertext, masked, validation_status, validation_code,
    verified_at, updated_by
  ) VALUES (
    true, 'resend', _ciphertext, _masked, _validation_status, _validation_code,
    _verified_at, _updated_by
  )
  ON CONFLICT (id) DO UPDATE SET
    ciphertext = EXCLUDED.ciphertext,
    masked = EXCLUDED.masked,
    validation_status = EXCLUDED.validation_status,
    validation_code = EXCLUDED.validation_code,
    verified_at = EXCLUDED.verified_at,
    updated_by = EXCLUDED.updated_by,
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.save_installation_email_configuration(text,text,text,text,text,text,timestamptz,uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_installation_email_configuration(text,text,text,text,text,text,timestamptz,uuid)
TO service_role;

CREATE OR REPLACE FUNCTION public.remove_installation_email_configuration()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.installation_email_credentials WHERE id = true;
  UPDATE public.installation
  SET email_from = NULL, email_from_name = NULL, updated_at = now()
  WHERE id = true;
END;
$$;

REVOKE ALL ON FUNCTION public.remove_installation_email_configuration()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.remove_installation_email_configuration()
TO service_role;