CREATE OR REPLACE FUNCTION public.set_provider_connection(_brand_id uuid, _provider text, _patch jsonb, _source text DEFAULT 'app', _fallback text DEFAULT NULL, _set_fallback boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE result jsonb; old_primary text;
BEGIN
  IF _provider NOT IN ('openai','anthropic','gemini','groq') THEN RAISE EXCEPTION 'invalid_provider'; END IF;
  PERFORM set_config('app.credential_source', COALESCE(_source,'app'), true);
  INSERT INTO public.brand_connections (brand_id, providers) VALUES (_brand_id, jsonb_build_object(_provider, _patch))
  ON CONFLICT (brand_id) DO UPDATE
    SET providers = COALESCE(public.brand_connections.providers, '{}'::jsonb)
        || jsonb_build_object(_provider, COALESCE(public.brand_connections.providers -> _provider, '{}'::jsonb) || _patch)
  RETURNING providers -> _provider INTO result;
  IF _set_fallback THEN
    UPDATE public.brand_connections SET text_fallback_provider = _fallback WHERE brand_id = _brand_id;
  END IF;
  -- Principal automático: chave nova e aceita de OpenAI/Anthropic/Gemini vira o principal.
  IF _source = 'connections.save' AND _provider IN ('openai','anthropic','gemini')
     AND COALESCE((result->>'connected')::boolean, false) AND COALESCE(result->>'verified','') <> 'invalid' THEN
    SELECT text_provider INTO old_primary FROM public.brand_connections WHERE brand_id = _brand_id;
    IF old_primary IS DISTINCT FROM _provider THEN
      UPDATE public.brand_connections SET text_provider = _provider WHERE brand_id = _brand_id;
      INSERT INTO public.ai_credential_audit (brand_id, provider, target, op, actor_id, source)
      VALUES (_brand_id, _provider, 'primary', 'primary_changed', auth.uid(), COALESCE(_source,'app') || ' (antes: ' || COALESCE(old_primary,'nenhum') || ')');
    END IF;
  END IF;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.remove_provider_connection(_brand_id uuid, _provider text, _source text DEFAULT 'app')
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE cur_primary text; next_primary text;
BEGIN
  IF _provider NOT IN ('openai','anthropic','gemini','groq') THEN RAISE EXCEPTION 'invalid_provider'; END IF;
  PERFORM set_config('app.credential_source', COALESCE(_source,'app'), true);
  DELETE FROM public.brand_api_credentials WHERE brand_id = _brand_id AND provider = _provider;
  UPDATE public.brand_connections
     SET providers = COALESCE(providers, '{}'::jsonb) - _provider,
         text_fallback_provider = CASE WHEN _provider = 'groq' THEN NULL ELSE text_fallback_provider END
   WHERE brand_id = _brand_id
  RETURNING text_provider INTO cur_primary;
  IF cur_primary = _provider THEN
    SELECT p INTO next_primary FROM unnest(ARRAY['gemini','openai','anthropic']) WITH ORDINALITY AS t(p, ord)
     JOIN public.brand_connections bc ON bc.brand_id = _brand_id
     WHERE p <> _provider
       AND COALESCE((bc.providers -> p ->> 'connected')::boolean, false)
       AND COALESCE(bc.providers -> p ->> 'verified','') <> 'invalid'
       AND EXISTS (SELECT 1 FROM public.brand_api_credentials c WHERE c.brand_id = _brand_id AND c.provider = p)
     ORDER BY ord LIMIT 1;
    IF next_primary IS NOT NULL THEN
      UPDATE public.brand_connections SET text_provider = next_primary WHERE brand_id = _brand_id;
      INSERT INTO public.ai_credential_audit (brand_id, provider, target, op, actor_id, source)
      VALUES (_brand_id, next_primary, 'primary', 'primary_changed', auth.uid(), COALESCE(_source,'app') || ' (antes: ' || _provider || ')');
    END IF;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.set_provider_connection(uuid,text,jsonb,text,text,boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.remove_provider_connection(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_provider_connection(uuid,text,jsonb,text,text,boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.remove_provider_connection(uuid,text,text) TO authenticated, service_role;

-- Ajuste de instalações existentes: principal sem chave e exatamente um principal válido.
WITH cand AS (
  SELECT bc.brand_id, array_agg(p) ps
    FROM public.brand_connections bc CROSS JOIN unnest(ARRAY['openai','anthropic','gemini']) p
   WHERE COALESCE((bc.providers -> p ->> 'connected')::boolean, false)
     AND COALESCE(bc.providers -> p ->> 'verified','') <> 'invalid'
     AND EXISTS (SELECT 1 FROM public.brand_api_credentials c WHERE c.brand_id = bc.brand_id AND c.provider = p)
   GROUP BY bc.brand_id
), fix AS (
  UPDATE public.brand_connections bc SET text_provider = cand.ps[1]
    FROM cand
   WHERE bc.brand_id = cand.brand_id AND array_length(cand.ps,1) = 1
     AND NOT (bc.text_provider = ANY(cand.ps))
  RETURNING bc.brand_id, bc.text_provider
)
INSERT INTO public.ai_credential_audit (brand_id, provider, target, op, source)
SELECT brand_id, text_provider, 'primary', 'primary_changed', 'migration.auto_primary' FROM fix;