DROP POLICY IF EXISTS "template requests own completed insert" ON public.project_template_requests;
CREATE POLICY "template requests own completed insert" ON public.project_template_requests FOR INSERT TO authenticated WITH CHECK (created_by=auth.uid() AND project_id IS NOT NULL AND public.is_brand_member(brand_id,auth.uid()) AND EXISTS (SELECT 1 FROM public.projects p WHERE p.id=project_id AND p.brand_id=project_template_requests.brand_id AND p.client_id IS NOT DISTINCT FROM project_template_requests.client_id AND p.name=project_name AND public.can_access_project(p.id,auth.uid())));
DO $migration$
DECLARE _definition text;
BEGIN
 _definition:=pg_get_functiondef('public.instantiate_project_template(uuid,uuid,uuid,text)'::regprocedure);
 IF position('FOR _task IN SELECT value FROM jsonb_array_elements(coalesce(_t.blueprint->''directTasks'',''[]''::jsonb)) LOOP' in _definition)=0 THEN RAISE EXCEPTION 'Direct task loop not found'; END IF;
 _definition:=replace(_definition,'FOR _task IN SELECT value FROM jsonb_array_elements(coalesce(_t.blueprint->''directTasks'',''[]''::jsonb)) LOOP','_k:=0;' || chr(10) || '   FOR _task IN SELECT value FROM jsonb_array_elements(coalesce(_t.blueprint->''directTasks'',''[]''::jsonb)) LOOP');
 EXECUTE _definition;
END $migration$;
DO $migration$
DECLARE _definition text;
BEGIN
 _definition:=pg_get_functiondef('public.save_project_template(uuid,uuid,text,text,jsonb,uuid)'::regprocedure);
 _definition:=replace(_definition,'IF _item ? ''sourceId'' THEN','IF (_item->>''kind'')=''comment'' AND (NOT (_item ? ''sourceId'') OR NOT (_item ? ''sourceKind'')) THEN RAISE EXCEPTION ''Missing source text proof'' USING ERRCODE=''42501''; END IF;' || chr(10) || '   IF _item ? ''sourceId'' THEN');
 EXECUTE _definition;
END $migration$;