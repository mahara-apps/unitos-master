DO $migration$
DECLARE _definition text; _guard text;
BEGIN
 _definition:=pg_get_functiondef('public.save_project_template_checked_base(uuid,uuid,text,text,jsonb,uuid)'::regprocedure);
 IF position('BEGIN' in _definition)=0 THEN RAISE EXCEPTION 'Expected function body'; END IF;
 _guard:=$body$
 IF _source_project_id IS NOT NULL THEN
  FOR _item IN SELECT value FROM jsonb_array_elements(coalesce(_blueprint->'texts','[]'::jsonb)) LOOP
   IF _item ? 'sourceId' THEN
    IF NOT (
     ((_item->>'sourceKind')='work_comment' AND EXISTS (SELECT 1 FROM public.work_comments c WHERE c.id=(_item->>'sourceId')::uuid AND c.project_id=_source_project_id AND c.brand_id=_brand_id)) OR
     ((_item->>'sourceKind')='task_comment' AND EXISTS (SELECT 1 FROM public.task_comments c JOIN public.tasks t ON t.id=c.task_id WHERE c.id=(_item->>'sourceId')::uuid AND t.project_id=_source_project_id AND c.brand_id=_brand_id AND public.can_access_task(t.id,_uid))) OR
     ((_item->>'sourceKind')='client_briefing' AND EXISTS (SELECT 1 FROM public.client_briefings b JOIN public.projects p ON p.client_id=b.client_id WHERE b.id=(_item->>'sourceId')::uuid AND p.id=_source_project_id AND public.can_access_client(b.client_id,_uid))) OR
     ((_item->>'sourceKind')='brand_briefing' AND EXISTS (SELECT 1 FROM public.brand_briefings b JOIN public.projects p ON p.client_id=b.client_id WHERE b.id=(_item->>'sourceId')::uuid AND p.id=_source_project_id AND b.brand_id=_brand_id AND public.can_access_client(b.client_id,_uid)))
    ) THEN RAISE EXCEPTION 'Source text out of scope' USING ERRCODE='42501'; END IF;
   END IF;
  END LOOP;
 END IF;
 $body$;
 _definition:=replace(_definition,'BEGIN', 'BEGIN' || _guard);
 EXECUTE replace(_definition,'save_project_template_checked_base','save_project_template');
END $migration$;
DROP FUNCTION public.save_project_template_checked_base(uuid,uuid,text,text,jsonb,uuid);
REVOKE ALL ON FUNCTION public.save_project_template(uuid,uuid,text,text,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_project_template(uuid,uuid,text,text,jsonb,uuid) TO authenticated;