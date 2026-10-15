CREATE OR REPLACE FUNCTION public.production_pipeline_flag_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE trusted boolean;
BEGIN
 trusted:=current_user='service_role' OR current_user=pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='public.content_pipelines'::regclass));
 IF TG_OP='INSERT' THEN
  IF NEW.follows_brand_default AND NOT trusted THEN RAISE EXCEPTION 'production_preview_required'; END IF;
 ELSIF NEW.follows_brand_default IS DISTINCT FROM OLD.follows_brand_default AND NOT trusted THEN RAISE EXCEPTION 'production_preview_required';
 END IF;
 RETURN NEW;
END; $$;