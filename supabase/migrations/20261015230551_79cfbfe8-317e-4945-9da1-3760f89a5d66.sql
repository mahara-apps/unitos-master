CREATE TABLE IF NOT EXISTS public.ai_credential_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL,
  provider text NOT NULL,
  target text NOT NULL,
  op text NOT NULL,
  masked_last4 text,
  connected_before boolean,
  connected_after boolean,
  actor_id uuid,
  source text NOT NULL DEFAULT 'unknown',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_credential_audit_brand_idx ON public.ai_credential_audit (brand_id, created_at DESC);
GRANT SELECT ON public.ai_credential_audit TO authenticated;
GRANT ALL ON public.ai_credential_audit TO service_role;
REVOKE ALL ON public.ai_credential_audit FROM anon;
ALTER TABLE public.ai_credential_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ai_credential_audit admin read" ON public.ai_credential_audit;
CREATE POLICY "ai_credential_audit admin read" ON public.ai_credential_audit FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR (public.is_brand_member(brand_id, auth.uid()) AND public.app_access_role(auth.uid(), brand_id) IN ('admin','super_admin')));

CREATE OR REPLACE FUNCTION public.ai_credential_source() RETURNS text LANGUAGE sql STABLE SET search_path=public AS $$
  SELECT COALESCE(NULLIF(current_setting('app.credential_source', true), ''),
                  CASE WHEN auth.uid() IS NULL THEN 'system' ELSE 'app' END)
$$;

CREATE OR REPLACE FUNCTION public.ai_credential_audit_keys() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r record; v_op text;
BEGIN
  IF TG_OP = 'DELETE' THEN r := OLD; v_op := 'removed';
  ELSIF TG_OP = 'INSERT' THEN r := NEW; v_op := 'added';
  ELSE r := NEW; IF NEW.ciphertext IS NOT DISTINCT FROM OLD.ciphertext THEN RETURN NEW; END IF; v_op := 'replaced';
  END IF;
  INSERT INTO public.ai_credential_audit (brand_id, provider, target, op, masked_last4, actor_id, source)
  VALUES (r.brand_id, r.provider, 'key', v_op, right(COALESCE(r.masked,''), 4), auth.uid(), public.ai_credential_source());
  RETURN COALESCE(NEW, OLD);
END $$;
REVOKE ALL ON FUNCTION public.ai_credential_audit_keys() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS ai_credential_audit_keys ON public.brand_api_credentials;
CREATE TRIGGER ai_credential_audit_keys AFTER INSERT OR UPDATE OR DELETE ON public.brand_api_credentials
  FOR EACH ROW EXECUTE FUNCTION public.ai_credential_audit_keys();

CREATE OR REPLACE FUNCTION public.ai_credential_audit_panel() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p text; o jsonb; n jsonb; v_op text;
BEGIN
  FOR p IN SELECT DISTINCT k FROM (
      SELECT jsonb_object_keys(COALESCE(CASE WHEN TG_OP='UPDATE' THEN OLD.providers END, '{}'::jsonb)) k
      UNION SELECT jsonb_object_keys(COALESCE(NEW.providers, '{}'::jsonb))) s
  LOOP
    o := CASE WHEN TG_OP='UPDATE' THEN OLD.providers -> p END;
    n := NEW.providers -> p;
    IF o IS NULL AND n IS NOT NULL THEN v_op := 'panel_added';
    ELSIF o IS NOT NULL AND n IS NULL THEN v_op := 'panel_removed';
    ELSIF (o->>'connected') IS DISTINCT FROM (n->>'connected') OR (o->>'masked') IS DISTINCT FROM (n->>'masked') THEN v_op := 'panel_changed';
    ELSE CONTINUE;
    END IF;
    INSERT INTO public.ai_credential_audit (brand_id, provider, target, op, masked_last4, connected_before, connected_after, actor_id, source)
    VALUES (NEW.brand_id, p, 'panel', v_op, right(COALESCE(n->>'masked', o->>'masked', ''), 4),
            (o->>'connected')::boolean, (n->>'connected')::boolean, auth.uid(), public.ai_credential_source());
  END LOOP;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.ai_credential_audit_panel() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS ai_credential_audit_panel ON public.brand_connections;
CREATE TRIGGER ai_credential_audit_panel AFTER INSERT OR UPDATE OF providers ON public.brand_connections
  FOR EACH ROW EXECUTE FUNCTION public.ai_credential_audit_panel();

-- Escrita atômica por provedor (sem regravar a lista inteira).
CREATE OR REPLACE FUNCTION public.set_provider_connection(_brand_id uuid, _provider text, _patch jsonb, _source text DEFAULT 'app', _fallback text DEFAULT NULL, _set_fallback boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE result jsonb;
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
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.remove_provider_connection(_brand_id uuid, _provider text, _source text DEFAULT 'app')
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
  IF _provider NOT IN ('openai','anthropic','gemini','groq') THEN RAISE EXCEPTION 'invalid_provider'; END IF;
  PERFORM set_config('app.credential_source', COALESCE(_source,'app'), true);
  DELETE FROM public.brand_api_credentials WHERE brand_id = _brand_id AND provider = _provider;
  UPDATE public.brand_connections
     SET providers = COALESCE(providers, '{}'::jsonb) - _provider,
         text_fallback_provider = CASE WHEN _provider = 'groq' THEN NULL ELSE text_fallback_provider END
   WHERE brand_id = _brand_id;
END $$;
REVOKE ALL ON FUNCTION public.set_provider_connection(uuid,text,jsonb,text,text,boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.remove_provider_connection(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_provider_connection(uuid,text,jsonb,text,text,boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.remove_provider_connection(uuid,text,text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.ai_credential_source() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_credential_source() TO authenticated, service_role;