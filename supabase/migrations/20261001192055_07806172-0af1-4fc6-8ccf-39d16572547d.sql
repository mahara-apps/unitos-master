UPDATE public.brand_connections AS bc
SET text_fallback_provider = CASE
  WHEN coalesce(bc.providers -> 'groq' ->> 'connected', 'false') = 'true'
   AND EXISTS (
     SELECT 1
     FROM public.brand_api_credentials AS credential
     WHERE credential.brand_id = bc.brand_id
       AND credential.provider = 'groq'
   )
  THEN 'groq'
  ELSE NULL
END;

UPDATE public.brand_connections AS bc
SET text_provider = coalesce(
  (
    SELECT candidate.provider
    FROM unnest(ARRAY['openai', 'anthropic', 'gemini']) WITH ORDINALITY AS candidate(provider, ord)
    WHERE coalesce(bc.providers -> candidate.provider ->> 'connected', 'false') = 'true'
      AND EXISTS (
        SELECT 1
        FROM public.brand_api_credentials AS credential
        WHERE credential.brand_id = bc.brand_id
          AND credential.provider = candidate.provider
      )
    ORDER BY candidate.ord
    LIMIT 1
  ),
  'openai'
)
WHERE bc.text_provider NOT IN ('openai', 'anthropic', 'gemini');

ALTER TABLE public.brand_connections
  DROP CONSTRAINT IF EXISTS brand_connections_text_provider_check,
  DROP CONSTRAINT IF EXISTS brand_connections_text_fallback_provider_check;

ALTER TABLE public.brand_connections
  ADD CONSTRAINT brand_connections_text_provider_check
    CHECK (text_provider IN ('openai', 'anthropic', 'gemini')),
  ADD CONSTRAINT brand_connections_text_fallback_provider_check
    CHECK (text_fallback_provider IS NULL OR text_fallback_provider = 'groq');