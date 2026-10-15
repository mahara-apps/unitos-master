COMMENT ON FUNCTION public.production_stages_preview(uuid,jsonb,boolean,jsonb) IS 'Intentional authenticated SECURITY DEFINER RPC: auth.uid and workspace-scoped app_access_role admin/super_admin checked before any read; anon/PUBLIC denied.';
COMMENT ON FUNCTION public.production_stages_save(uuid,jsonb) IS 'Intentional authenticated SECURITY DEFINER RPC: workspace admin/super_admin guard before writing; anon/PUBLIC denied.';
COMMENT ON FUNCTION public.production_stages_apply(uuid,jsonb,boolean,jsonb,text,uuid) IS 'Intentional authenticated SECURITY DEFINER RPC: workspace admin/super_admin guard, stale-preview check, transaction and idempotent actor-scoped operation; anon/PUBLIC denied.';
COMMENT ON FUNCTION public.production_pipeline_exception(uuid,boolean) IS 'Intentional authenticated SECURITY DEFINER RPC: workspace admin/super_admin guard; only marking an exception allowed, never bypassing preview to inherit.';
CREATE FUNCTION public.production_stage_local_exception() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE pipe uuid;
BEGIN
 pipe:=CASE WHEN TG_OP='DELETE' THEN OLD.pipeline_id ELSE NEW.pipeline_id END;
 UPDATE public.content_pipelines SET follows_brand_default=false WHERE id=pipe AND follows_brand_default;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.production_stage_local_exception() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.production_stage_local_exception() TO service_role;
CREATE TRIGGER production_stage_local_exception AFTER INSERT OR UPDATE OR DELETE ON public.content_pipeline_stages FOR EACH ROW EXECUTE FUNCTION public.production_stage_local_exception();
CREATE FUNCTION public.production_pipeline_flag_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.follows_brand_default AND current_user NOT IN ('postgres','service_role','supabase_admin') THEN RAISE EXCEPTION 'production_preview_required'; END IF;
 ELSIF NEW.follows_brand_default IS DISTINCT FROM OLD.follows_brand_default AND current_user NOT IN ('postgres','service_role','supabase_admin') THEN RAISE EXCEPTION 'production_preview_required';
 END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.production_pipeline_flag_guard() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.production_pipeline_flag_guard() TO service_role;
CREATE TRIGGER production_pipeline_flag_guard BEFORE INSERT OR UPDATE ON public.content_pipelines FOR EACH ROW EXECUTE FUNCTION public.production_pipeline_flag_guard();
-- Stage insertion marks a local exception, so restore inheritance only after the full new-client template is installed.
CREATE OR REPLACE FUNCTION public.production_new_client_pipeline() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE template jsonb; s jsonb; pipe uuid; pos int:=0;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('production-stages:'||NEW.brand_id::text,0));
 SELECT stages INTO template FROM public.production_stage_defaults WHERE brand_id=NEW.brand_id;
 IF template IS NULL THEN RETURN NEW; END IF;
 INSERT INTO public.content_pipelines(brand_id,client_id,name,slug,is_default,created_by) VALUES(NEW.brand_id,NEW.id,'Pipeline principal','main',true,auth.uid()) RETURNING id INTO pipe;
 FOR s IN SELECT * FROM jsonb_array_elements(template) LOOP
  INSERT INTO public.content_pipeline_stages(pipeline_id,key,label,color,position,is_terminal,hide_in_portal,enables_approval_link,sla_hours) VALUES(pipe,s->>'key',s->>'label',s->>'color',pos,(s->>'is_terminal')::boolean,(s->>'hide_in_portal')::boolean,(s->>'enables_approval_link')::boolean,(s->>'sla_hours')::int); pos:=pos+1024;
 END LOOP;
 UPDATE public.content_pipelines SET follows_brand_default=true WHERE id=pipe;
 RETURN NEW;
END; $$;