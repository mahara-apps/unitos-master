CREATE TABLE public.production_stage_post_snapshots (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 operation_id uuid NOT NULL,
 brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
 post_id uuid NOT NULL,
 pipeline_id uuid NOT NULL,
 previous_stage_key text NOT NULL,
 previous_stage_label text NOT NULL,
 new_stage_key text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX production_stage_post_snapshots_op ON public.production_stage_post_snapshots(operation_id);
REVOKE ALL ON public.production_stage_post_snapshots FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.production_stage_post_snapshots TO authenticated;
GRANT ALL ON public.production_stage_post_snapshots TO service_role;
ALTER TABLE public.production_stage_post_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY stage_post_snapshots_read ON public.production_stage_post_snapshots FOR SELECT TO authenticated USING (public.app_access_role(auth.uid(),brand_id) IN ('super_admin','admin'));
CREATE TRIGGER stage_post_snapshots_updated BEFORE UPDATE ON public.production_stage_post_snapshots FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.production_stages_preview(_brand uuid,_stages jsonb,_keep_exceptions boolean DEFAULT true,_mapping jsonb DEFAULT '{}'::jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE snap jsonb; p jsonb; s jsonb; target jsonb; changes jsonb; clients jsonb:='[]'; n int; dest text; blocked boolean:=false; skip boolean:=false;
BEGIN
 IF auth.uid() IS NULL OR coalesce(public.app_access_role(auth.uid(),_brand),'') NOT IN ('super_admin','admin') THEN RAISE EXCEPTION 'production_stages_forbidden'; END IF;
 PERFORM public.production_stages_validate(_stages);
 IF jsonb_typeof(_mapping) IS DISTINCT FROM 'object' OR _keep_exceptions IS NULL THEN RAISE EXCEPTION 'invalid_production_mapping'; END IF;
 snap:=public.production_stages_snapshot(_brand);
 FOR p IN SELECT * FROM jsonb_array_elements(snap->'pipelines') LOOP
  changes:='[]';
  FOR target IN SELECT * FROM jsonb_array_elements(_stages) LOOP
   SELECT x INTO s FROM jsonb_array_elements(snap->'stages') x WHERE x->>'pipeline_id'=p->>'id' AND x->>'key'=target->>'key';
   IF s IS NULL THEN changes:=changes||jsonb_build_array(jsonb_build_object('kind','add','label',target->>'label','key',target->>'key'));
   ELSIF jsonb_build_object('key',s->'key','label',s->'label','color',s->'color','is_terminal',s->'is_terminal','hide_in_portal',s->'hide_in_portal','enables_approval_link',s->'enables_approval_link','sla_hours',coalesce(nullif(s->'sla_hours','null'::jsonb),to_jsonb((s->>'sla_days')::int*24),'null'::jsonb)) IS DISTINCT FROM target OR (s->>'position')::int <> ((SELECT ordinality FROM jsonb_array_elements(_stages) WITH ORDINALITY WHERE value->>'key'=target->>'key')-1)*1024 THEN
    changes:=changes||jsonb_build_array(jsonb_build_object('kind','update','label',target->>'label','previous',s->>'label','key',target->>'key'));
   END IF;
  END LOOP;
  FOR s IN SELECT x FROM jsonb_array_elements(snap->'stages') x WHERE x->>'pipeline_id'=p->>'id' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(_stages) t WHERE t->>'key'=x->>'key') LOOP
   SELECT count(*) INTO n FROM jsonb_array_elements(snap->'posts') x WHERE x->>'stage_id'=s->>'id';
   dest:=_mapping->>(s->>'id');
   IF n>0 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(_stages) x WHERE x->>'key'=dest) THEN blocked:=true; END IF;
   changes:=changes||jsonb_build_array(jsonb_build_object('kind','remove','stageId',s->>'id','label',s->>'label','posts',n,'destination',dest));
  END LOOP;
  clients:=clients||jsonb_build_array(jsonb_build_object('clientId',p->>'client_id','name',(SELECT x->>'name' FROM jsonb_array_elements(snap->'clients') x WHERE x->>'id'=p->>'client_id'),'pipelineId',p->>'id','skipped',skip,'exception',NOT (p->>'follows_brand_default')::boolean,'changes',changes));
 END LOOP;
 FOR p IN SELECT x FROM jsonb_array_elements(snap->'clients') x WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(snap->'pipelines') y WHERE y->>'client_id'=x->>'id') LOOP
  clients:=clients||jsonb_build_array(jsonb_build_object('clientId',p->>'id','name',p->>'name','pipelineId',null,'skipped',false,'exception',false,'changes',(SELECT jsonb_agg(jsonb_build_object('kind','add','label',x->>'label','key',x->>'key')) FROM jsonb_array_elements(_stages) x)));
 END LOOP;
 RETURN jsonb_build_object('fingerprint',md5(snap::text),'clients',clients,'blocked',blocked);
END; $$;
REVOKE ALL ON FUNCTION public.production_stages_preview(uuid,jsonb,boolean,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.production_stages_preview(uuid,jsonb,boolean,jsonb) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.production_stages_apply(_brand uuid,_stages jsonb,_keep_exceptions boolean,_mapping jsonb,_fingerprint text,_operation uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE prior public.production_stage_applications; request jsonb; preview jsonb; c jsonb; s jsonb; old public.content_pipeline_stages; pipe uuid; dest uuid; result jsonb; applied int:=0; moved int:=0; affected int; pos int;
BEGIN
 IF auth.uid() IS NULL OR coalesce(public.app_access_role(auth.uid(),_brand),'') NOT IN ('super_admin','admin') THEN RAISE EXCEPTION 'production_stages_forbidden'; END IF;
 IF _operation IS NULL OR _fingerprint IS NULL THEN RAISE EXCEPTION 'production_preview_required'; END IF;
 request:=jsonb_build_object('stages',_stages,'keep',_keep_exceptions,'mapping',_mapping,'fingerprint',_fingerprint);
 PERFORM pg_advisory_xact_lock(hashtextextended('production-stages:'||_brand::text,0));
 SELECT * INTO prior FROM public.production_stage_applications WHERE id=_operation;
 IF FOUND THEN
  IF prior.brand_id<>_brand OR prior.actor_id<>auth.uid() OR prior.request<>request THEN RAISE EXCEPTION 'production_operation_conflict'; END IF;
  RETURN prior.result;
 END IF;
 PERFORM set_config('unitos.production_apply','on',true);
 PERFORM id FROM public.clients WHERE brand_id=_brand ORDER BY id FOR UPDATE;
 PERFORM id FROM public.content_pipelines WHERE brand_id=_brand AND is_default AND deleted_at IS NULL ORDER BY id FOR UPDATE;
 PERFORM s.id FROM public.content_pipeline_stages s JOIN public.content_pipelines p ON p.id=s.pipeline_id WHERE p.brand_id=_brand AND p.is_default AND p.deleted_at IS NULL ORDER BY s.id FOR UPDATE OF s;
 PERFORM x.id FROM public.posts x JOIN public.content_pipelines p ON p.id=x.pipeline_id WHERE p.brand_id=_brand AND p.is_default AND p.deleted_at IS NULL ORDER BY x.id FOR UPDATE OF x;
 preview:=public.production_stages_preview(_brand,_stages,_keep_exceptions,_mapping);
 IF preview->>'fingerprint'<>_fingerprint THEN RAISE EXCEPTION 'production_preview_stale'; END IF;
 IF (preview->>'blocked')::boolean THEN RAISE EXCEPTION 'production_destination_required'; END IF;
 PERFORM public.production_stages_save(_brand,_stages);
 FOR c IN SELECT * FROM jsonb_array_elements(preview->'clients') LOOP
  pipe:=(c->>'pipelineId')::uuid;
  IF pipe IS NULL THEN
   INSERT INTO public.content_pipelines(brand_id,client_id,name,slug,is_default,created_by,follows_brand_default) VALUES(_brand,(c->>'clientId')::uuid,'Pipeline principal','main',true,auth.uid(),true) RETURNING id INTO pipe;
  END IF;
  pos:=0;
  FOR s IN SELECT * FROM jsonb_array_elements(_stages) LOOP
   SELECT * INTO old FROM public.content_pipeline_stages WHERE pipeline_id=pipe AND key=s->>'key';
   IF FOUND THEN
    UPDATE public.content_pipeline_stages SET label=s->>'label',color=s->>'color',position=pos,is_terminal=(s->>'is_terminal')::boolean,hide_in_portal=(s->>'hide_in_portal')::boolean,enables_approval_link=(s->>'enables_approval_link')::boolean,sla_hours=(s->>'sla_hours')::int,sla_days=null WHERE id=old.id;
   ELSE
    INSERT INTO public.content_pipeline_stages(pipeline_id,key,label,color,position,is_terminal,hide_in_portal,enables_approval_link,sla_hours) VALUES(pipe,s->>'key',s->>'label',s->>'color',pos,(s->>'is_terminal')::boolean,(s->>'hide_in_portal')::boolean,(s->>'enables_approval_link')::boolean,(s->>'sla_hours')::int);
   END IF;
   pos:=pos+1024;
  END LOOP;
  FOR old IN SELECT * FROM public.content_pipeline_stages x WHERE pipeline_id=pipe AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(_stages) t WHERE t->>'key'=x.key) LOOP
   SELECT id INTO dest FROM public.content_pipeline_stages WHERE pipeline_id=pipe AND key=_mapping->>old.id::text;
   IF EXISTS(SELECT 1 FROM public.posts WHERE stage_id=old.id) AND dest IS NULL THEN RAISE EXCEPTION 'production_destination_required'; END IF;
   INSERT INTO public.production_stage_post_snapshots(operation_id,brand_id,post_id,pipeline_id,previous_stage_key,previous_stage_label,new_stage_key)
    SELECT _operation,_brand,x.id,pipe,old.key,old.label,_mapping->>old.id::text FROM public.posts x WHERE x.stage_id=old.id;
   UPDATE public.posts SET stage_id=dest,stage_entered_at=now() WHERE stage_id=old.id;
   GET DIAGNOSTICS affected=ROW_COUNT; moved:=moved+affected;
   DELETE FROM public.content_pipeline_stages WHERE id=old.id;
  END LOOP;
  UPDATE public.content_pipelines SET follows_brand_default=true WHERE id=pipe;
  applied:=applied+1;
 END LOOP;
 result:=jsonb_build_object('clients',applied,'movedPosts',moved);
 INSERT INTO public.production_stage_applications(id,brand_id,actor_id,request,result) VALUES(_operation,_brand,auth.uid(),request,result);
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.production_stages_apply(uuid,jsonb,boolean,jsonb,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.production_stages_apply(uuid,jsonb,boolean,jsonb,text,uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.production_pipeline_exception(_pipeline uuid,_exception boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 RAISE EXCEPTION 'production_stages_workspace_only';
END; $$;
REVOKE ALL ON FUNCTION public.production_pipeline_exception(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.production_pipeline_exception(uuid,boolean) TO authenticated,service_role;

-- Primary client boards are owned by the workspace standard: local stage edits are blocked outside the apply RPC.
DROP TRIGGER IF EXISTS production_stage_local_exception ON public.content_pipeline_stages;
CREATE OR REPLACE FUNCTION public.production_stage_workspace_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE pipe public.content_pipelines;
BEGIN
 IF current_user IN ('postgres','service_role','supabase_admin') OR coalesce(current_setting('unitos.production_apply',true),'')='on' THEN
  IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
 END IF;
 SELECT * INTO pipe FROM public.content_pipelines WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.pipeline_id ELSE NEW.pipeline_id END;
 IF FOUND AND pipe.is_default AND EXISTS(SELECT 1 FROM public.production_stage_defaults d WHERE d.brand_id=pipe.brand_id)
    AND NOT (TG_OP='INSERT' AND pipe.created_at > now() - interval '5 minutes') THEN
  RAISE EXCEPTION 'production_stages_workspace_only';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.production_stage_workspace_guard() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.production_stage_workspace_guard() TO service_role;
CREATE TRIGGER production_stage_workspace_guard BEFORE INSERT OR UPDATE OR DELETE ON public.content_pipeline_stages FOR EACH ROW EXECUTE FUNCTION public.production_stage_workspace_guard();

CREATE OR REPLACE FUNCTION public.production_new_client_pipeline() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE template jsonb; s jsonb; pipe uuid; pos int:=0;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('production-stages:'||NEW.brand_id::text,0));
 SELECT stages INTO template FROM public.production_stage_defaults WHERE brand_id=NEW.brand_id;
 IF template IS NULL THEN RETURN NEW; END IF;
 PERFORM set_config('unitos.production_apply','on',true);
 INSERT INTO public.content_pipelines(brand_id,client_id,name,slug,is_default,created_by,follows_brand_default) VALUES(NEW.brand_id,NEW.id,'Pipeline principal','main',true,auth.uid(),true) RETURNING id INTO pipe;
 FOR s IN SELECT * FROM jsonb_array_elements(template) LOOP
  INSERT INTO public.content_pipeline_stages(pipeline_id,key,label,color,position,is_terminal,hide_in_portal,enables_approval_link,sla_hours) VALUES(pipe,s->>'key',s->>'label',s->>'color',pos,(s->>'is_terminal')::boolean,(s->>'hide_in_portal')::boolean,(s->>'enables_approval_link')::boolean,(s->>'sla_hours')::int); pos:=pos+1024;
 END LOOP;
 PERFORM set_config('unitos.production_apply','',true);
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.production_new_client_pipeline() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.production_new_client_pipeline() TO service_role;