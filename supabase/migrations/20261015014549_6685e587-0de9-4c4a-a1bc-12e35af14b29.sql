ALTER FUNCTION public.production_stages_preview(uuid,jsonb,boolean,jsonb) RENAME TO production_stages_preview_state;
REVOKE ALL ON FUNCTION public.production_stages_preview_state(uuid,jsonb,boolean,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.production_stages_preview_state(uuid,jsonb,boolean,jsonb) TO service_role;
CREATE FUNCTION public.production_stages_preview(_brand uuid,_stages jsonb,_keep_exceptions boolean DEFAULT true,_mapping jsonb DEFAULT '{}'::jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 IF auth.uid() IS NULL OR coalesce(public.app_access_role(auth.uid(),_brand),'') NOT IN ('super_admin','admin') THEN RAISE EXCEPTION 'production_stages_forbidden'; END IF;
 result:=public.production_stages_preview_state(_brand,_stages,_keep_exceptions,_mapping);
 RETURN jsonb_set(result,'{fingerprint}',to_jsonb(md5((result->>'fingerprint')||_stages::text||_keep_exceptions::text)));
END; $$;
REVOKE ALL ON FUNCTION public.production_stages_preview(uuid,jsonb,boolean,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.production_stages_preview(uuid,jsonb,boolean,jsonb) TO authenticated,service_role;
COMMENT ON FUNCTION public.production_stages_preview(uuid,jsonb,boolean,jsonb) IS 'Intentional authenticated administrative RPC: explicit auth.uid/workspace role guard; fingerprint binds state, proposed stages and exception option. PUBLIC/anon denied.';