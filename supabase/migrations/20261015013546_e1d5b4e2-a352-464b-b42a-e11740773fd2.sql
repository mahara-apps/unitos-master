CREATE TABLE public.production_stage_defaults (
 brand_id uuid PRIMARY KEY REFERENCES public.brands(id) ON DELETE CASCADE,
 stages jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.production_stage_defaults FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.production_stage_defaults TO authenticated;
GRANT ALL ON public.production_stage_defaults TO service_role;
ALTER TABLE public.production_stage_defaults ENABLE ROW LEVEL SECURITY;
CREATE POLICY stage_defaults_read ON public.production_stage_defaults FOR SELECT TO authenticated USING (public.app_access_role(auth.uid(),brand_id) IN ('super_admin','admin','manager','user'));
CREATE TRIGGER stage_defaults_updated BEFORE UPDATE ON public.production_stage_defaults FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.production_stage_applications (
 id uuid PRIMARY KEY, brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
 actor_id uuid NOT NULL, request jsonb NOT NULL, result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.production_stage_applications FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.production_stage_applications TO authenticated;
GRANT ALL ON public.production_stage_applications TO service_role;
ALTER TABLE public.production_stage_applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY stage_applications_read ON public.production_stage_applications FOR SELECT TO authenticated USING (actor_id=auth.uid() AND public.app_access_role(auth.uid(),brand_id) IN ('super_admin','admin'));
CREATE TRIGGER stage_applications_updated BEFORE UPDATE ON public.production_stage_applications FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
ALTER TABLE public.content_pipelines ADD COLUMN follows_brand_default boolean NOT NULL DEFAULT false;

CREATE FUNCTION public.production_stages_validate(_stages jsonb) RETURNS void LANGUAGE plpgsql SET search_path=public AS $$
DECLARE s jsonb;
BEGIN
 IF jsonb_typeof(_stages) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'invalid_production_stages'; END IF;
 IF jsonb_array_length(_stages) NOT BETWEEN 1 AND 40 THEN RAISE EXCEPTION 'invalid_production_stages'; END IF;
 IF (SELECT count(DISTINCT x->>'key') FROM jsonb_array_elements(_stages) x) <> jsonb_array_length(_stages) THEN RAISE EXCEPTION 'duplicate_production_stage_key'; END IF;
 FOR s IN SELECT * FROM jsonb_array_elements(_stages) LOOP
  IF coalesce(s->>'key','') !~ '^[a-z0-9][a-z0-9_-]{0,79}$' OR length(btrim(coalesce(s->>'label',''))) NOT BETWEEN 1 AND 40
   OR coalesce(s->>'color','') NOT IN ('muted','indigo','violet','amber','emerald','sky','rose','cyan')
   OR jsonb_typeof(s->'is_terminal') IS DISTINCT FROM 'boolean'
   OR jsonb_typeof(s->'hide_in_portal') IS DISTINCT FROM 'boolean'
   OR jsonb_typeof(s->'enables_approval_link') IS DISTINCT FROM 'boolean'
   OR NOT (s ? 'sla_hours') THEN RAISE EXCEPTION 'invalid_production_stage'; END IF;
  IF s->'sla_hours' <> 'null'::jsonb AND (jsonb_typeof(s->'sla_hours') IS DISTINCT FROM 'number' OR (s->>'sla_hours')::numeric NOT BETWEEN 0 AND 8760 OR (s->>'sla_hours')::numeric <> trunc((s->>'sla_hours')::numeric)) THEN RAISE EXCEPTION 'invalid_production_sla'; END IF;
 END LOOP;
END; $$;
REVOKE ALL ON FUNCTION public.production_stages_validate(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.production_stages_validate(jsonb) TO service_role;

CREATE FUNCTION public.production_stages_snapshot(_brand uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object(
 'template',(SELECT stages FROM public.production_stage_defaults WHERE brand_id=_brand),
 'clients',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name) ORDER BY id) FROM public.clients WHERE brand_id=_brand),'[]'::jsonb),
 'pipelines',coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM public.content_pipelines p WHERE brand_id=_brand AND is_default AND deleted_at IS NULL),'[]'::jsonb),
 'stages',coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id) FROM public.content_pipeline_stages s JOIN public.content_pipelines p ON p.id=s.pipeline_id WHERE p.brand_id=_brand AND p.is_default AND p.deleted_at IS NULL),'[]'::jsonb),
 'posts',coalesce((SELECT jsonb_agg(jsonb_build_object('id',x.id,'pipeline_id',x.pipeline_id,'stage_id',x.stage_id,'deleted_at',x.deleted_at) ORDER BY x.id) FROM public.posts x JOIN public.content_pipelines p ON p.id=x.pipeline_id WHERE p.brand_id=_brand AND p.is_default AND p.deleted_at IS NULL),'[]'::jsonb));
$$;
REVOKE ALL ON FUNCTION public.production_stages_snapshot(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.production_stages_snapshot(uuid) TO service_role;

CREATE FUNCTION public.production_stages_preview(_brand uuid,_stages jsonb,_keep_exceptions boolean DEFAULT true,_mapping jsonb DEFAULT '{}'::jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE snap jsonb; p jsonb; s jsonb; target jsonb; changes jsonb; clients jsonb:='[]'; n int; dest text; blocked boolean:=false; skip boolean;
BEGIN
 IF auth.uid() IS NULL OR coalesce(public.app_access_role(auth.uid(),_brand),'') NOT IN ('super_admin','admin') THEN RAISE EXCEPTION 'production_stages_forbidden'; END IF;
 PERFORM public.production_stages_validate(_stages);
 IF jsonb_typeof(_mapping) IS DISTINCT FROM 'object' OR _keep_exceptions IS NULL THEN RAISE EXCEPTION 'invalid_production_mapping'; END IF;
 snap:=public.production_stages_snapshot(_brand);
 FOR p IN SELECT * FROM jsonb_array_elements(snap->'pipelines') LOOP
  skip:=_keep_exceptions AND NOT (p->>'follows_brand_default')::boolean; changes:='[]';
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
   IF n>0 AND NOT skip AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(_stages) x WHERE x->>'key'=dest) THEN blocked:=true; END IF;
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

CREATE FUNCTION public.production_stages_save(_brand uuid,_stages jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR coalesce(public.app_access_role(auth.uid(),_brand),'') NOT IN ('super_admin','admin') THEN RAISE EXCEPTION 'production_stages_forbidden'; END IF;
 PERFORM public.production_stages_validate(_stages);
 PERFORM pg_advisory_xact_lock(hashtextextended('production-stages:'||_brand::text,0));
 INSERT INTO public.production_stage_defaults(brand_id,stages) VALUES(_brand,_stages) ON CONFLICT(brand_id) DO UPDATE SET stages=excluded.stages;
END; $$;
REVOKE ALL ON FUNCTION public.production_stages_save(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.production_stages_save(uuid,jsonb) TO authenticated,service_role;

CREATE FUNCTION public.production_stages_apply(_brand uuid,_stages jsonb,_keep_exceptions boolean,_mapping jsonb,_fingerprint text,_operation uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
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
 PERFORM id FROM public.clients WHERE brand_id=_brand ORDER BY id FOR UPDATE;
 PERFORM id FROM public.content_pipelines WHERE brand_id=_brand AND is_default AND deleted_at IS NULL ORDER BY id FOR UPDATE;
 PERFORM s.id FROM public.content_pipeline_stages s JOIN public.content_pipelines p ON p.id=s.pipeline_id WHERE p.brand_id=_brand AND p.is_default AND p.deleted_at IS NULL ORDER BY s.id FOR UPDATE OF s;
 PERFORM x.id FROM public.posts x JOIN public.content_pipelines p ON p.id=x.pipeline_id WHERE p.brand_id=_brand AND p.is_default AND p.deleted_at IS NULL ORDER BY x.id FOR UPDATE OF x;
 preview:=public.production_stages_preview(_brand,_stages,_keep_exceptions,_mapping);
 IF preview->>'fingerprint'<>_fingerprint THEN RAISE EXCEPTION 'production_preview_stale'; END IF;
 IF (preview->>'blocked')::boolean THEN RAISE EXCEPTION 'production_destination_required'; END IF;
 PERFORM public.production_stages_save(_brand,_stages);
 FOR c IN SELECT * FROM jsonb_array_elements(preview->'clients') LOOP
  IF (c->>'skipped')::boolean THEN CONTINUE; END IF;
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

CREATE FUNCTION public.production_pipeline_exception(_pipeline uuid,_exception boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b uuid;
BEGIN
 SELECT brand_id INTO b FROM public.content_pipelines WHERE id=_pipeline AND deleted_at IS NULL;
 IF b IS NULL OR auth.uid() IS NULL OR coalesce(public.app_access_role(auth.uid(),b),'') NOT IN ('super_admin','admin') THEN RAISE EXCEPTION 'production_stages_forbidden'; END IF;
 IF _exception IS DISTINCT FROM true THEN RAISE EXCEPTION 'production_preview_required'; END IF;
 UPDATE public.content_pipelines SET follows_brand_default=false WHERE id=_pipeline;
END; $$;
REVOKE ALL ON FUNCTION public.production_pipeline_exception(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.production_pipeline_exception(uuid,boolean) TO authenticated,service_role;

CREATE FUNCTION public.production_new_client_pipeline() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE template jsonb; s jsonb; pipe uuid; pos int:=0;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('production-stages:'||NEW.brand_id::text,0));
 SELECT stages INTO template FROM public.production_stage_defaults WHERE brand_id=NEW.brand_id;
 IF template IS NULL THEN RETURN NEW; END IF;
 INSERT INTO public.content_pipelines(brand_id,client_id,name,slug,is_default,created_by,follows_brand_default) VALUES(NEW.brand_id,NEW.id,'Pipeline principal','main',true,auth.uid(),true) RETURNING id INTO pipe;
 FOR s IN SELECT * FROM jsonb_array_elements(template) LOOP
  INSERT INTO public.content_pipeline_stages(pipeline_id,key,label,color,position,is_terminal,hide_in_portal,enables_approval_link,sla_hours) VALUES(pipe,s->>'key',s->>'label',s->>'color',pos,(s->>'is_terminal')::boolean,(s->>'hide_in_portal')::boolean,(s->>'enables_approval_link')::boolean,(s->>'sla_hours')::int); pos:=pos+1024;
 END LOOP;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.production_new_client_pipeline() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.production_new_client_pipeline() TO service_role;
CREATE TRIGGER production_new_client_pipeline AFTER INSERT ON public.clients FOR EACH ROW EXECUTE FUNCTION public.production_new_client_pipeline();