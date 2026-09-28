ALTER FUNCTION public.save_project_template(uuid,uuid,text,text,jsonb,uuid) RENAME TO save_project_template_checked_base;
REVOKE ALL ON FUNCTION public.save_project_template_checked_base(uuid,uuid,text,text,jsonb,uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.save_project_template(_brand_id uuid,_template_id uuid,_name text,_description text,_blueprint jsonb,_source_project_id uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $fn$
DECLARE _text jsonb; _source uuid; _kind text; _client uuid; _uid uuid:=auth.uid();
BEGIN
 IF _uid IS NULL THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF _source_project_id IS NOT NULL THEN
  SELECT p.client_id INTO _client FROM public.projects p WHERE p.id=_source_project_id AND p.brand_id=_brand_id AND public.can_access_project(p.id,_uid);
  IF NOT FOUND THEN RAISE EXCEPTION 'Project out of scope' USING ERRCODE='42501'; END IF;
  FOR _text IN SELECT value FROM jsonb_array_elements(coalesce(_blueprint->'texts','[]'::jsonb)) LOOP
   _source:=nullif(_text->>'sourceId','')::uuid; _kind:=_text->>'sourceKind';
   IF _source IS NULL OR NOT (
    (_kind='work_comment' AND EXISTS (SELECT 1 FROM public.work_comments c WHERE c.id=_source AND c.project_id=_source_project_id AND c.brand_id=_brand_id)) OR
    (_kind='task_comment' AND EXISTS (SELECT 1 FROM public.task_comments c JOIN public.tasks t ON t.id=c.task_id WHERE c.id=_source AND t.project_id=_source_project_id AND c.brand_id=_brand_id AND public.can_access_task(t.id,_uid))) OR
    (_kind='client_briefing' AND EXISTS (SELECT 1 FROM public.client_briefings b WHERE b.id=_source AND b.client_id=_client AND public.can_access_client(b.client_id,_uid))) OR
    (_kind='brand_briefing' AND EXISTS (SELECT 1 FROM public.brand_briefings b WHERE b.id=_source AND b.client_id=_client AND b.brand_id=_brand_id AND public.can_access_client(b.client_id,_uid)))
   ) THEN RAISE EXCEPTION 'Source text out of scope' USING ERRCODE='42501'; END IF;
  END LOOP;
 END IF;
 RETURN public.save_project_template_checked_base(_brand_id,_template_id,_name,_description,_blueprint,_source_project_id);
END $fn$;
REVOKE ALL ON FUNCTION public.save_project_template(uuid,uuid,text,text,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_project_template(uuid,uuid,text,text,jsonb,uuid) TO authenticated;