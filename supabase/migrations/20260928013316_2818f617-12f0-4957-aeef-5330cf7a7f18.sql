CREATE OR REPLACE FUNCTION public.can_manage_project_templates(_brand_id uuid, _user_id uuid DEFAULT auth.uid()) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $fn$ SELECT _brand_id IS NOT NULL AND _user_id IS NOT NULL AND (public.is_super_admin(_user_id) OR (public.is_brand_member(_brand_id,_user_id) AND public.app_access_role(_user_id,_brand_id)='admin')) $fn$;
REVOKE ALL ON FUNCTION public.can_manage_project_templates(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_manage_project_templates(uuid,uuid) TO authenticated;
DROP POLICY IF EXISTS "project_templates insert brand" ON public.project_templates;
CREATE POLICY "project_templates insert brand" ON public.project_templates FOR INSERT TO authenticated WITH CHECK (NOT is_system AND brand_id IS NOT NULL AND public.can_manage_project_templates(brand_id,auth.uid()) AND (source_client_id IS NULL OR (EXISTS (SELECT 1 FROM public.clients c WHERE c.id=source_client_id AND c.brand_id=project_templates.brand_id) AND public.can_access_client(source_client_id,auth.uid()))));
DROP POLICY IF EXISTS "project_templates update brand" ON public.project_templates;
CREATE POLICY "project_templates update brand" ON public.project_templates FOR UPDATE TO authenticated USING (NOT is_system AND brand_id IS NOT NULL AND public.can_manage_project_templates(brand_id,auth.uid()) AND (source_client_id IS NULL OR public.can_access_client(source_client_id,auth.uid()))) WITH CHECK (NOT is_system AND brand_id IS NOT NULL AND public.can_manage_project_templates(brand_id,auth.uid()) AND (source_client_id IS NULL OR (EXISTS (SELECT 1 FROM public.clients c WHERE c.id=source_client_id AND c.brand_id=project_templates.brand_id) AND public.can_access_client(source_client_id,auth.uid()))));
DROP POLICY IF EXISTS "project_templates delete brand" ON public.project_templates;
CREATE POLICY "project_templates delete brand" ON public.project_templates FOR DELETE TO authenticated USING (NOT is_system AND brand_id IS NOT NULL AND public.can_manage_project_templates(brand_id,auth.uid()) AND (source_client_id IS NULL OR public.can_access_client(source_client_id,auth.uid())));
DROP POLICY IF EXISTS "template_jobs write" ON public.project_template_jobs;
CREATE POLICY "template_jobs write" ON public.project_template_jobs FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.project_templates t WHERE t.id=project_template_jobs.template_id AND NOT t.is_system AND public.can_manage_project_templates(t.brand_id,auth.uid()) AND (t.source_client_id IS NULL OR public.can_access_client(t.source_client_id,auth.uid())))) WITH CHECK (EXISTS (SELECT 1 FROM public.project_templates t WHERE t.id=project_template_jobs.template_id AND NOT t.is_system AND public.can_manage_project_templates(t.brand_id,auth.uid()) AND (t.source_client_id IS NULL OR public.can_access_client(t.source_client_id,auth.uid()))));
DROP POLICY IF EXISTS "template_tasks write" ON public.project_template_tasks;
CREATE POLICY "template_tasks write" ON public.project_template_tasks FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.project_template_jobs j JOIN public.project_templates t ON t.id=j.template_id WHERE j.id=project_template_tasks.template_job_id AND NOT t.is_system AND public.can_manage_project_templates(t.brand_id,auth.uid()) AND (t.source_client_id IS NULL OR public.can_access_client(t.source_client_id,auth.uid())))) WITH CHECK (EXISTS (SELECT 1 FROM public.project_template_jobs j JOIN public.project_templates t ON t.id=j.template_id WHERE j.id=project_template_tasks.template_job_id AND NOT t.is_system AND public.can_manage_project_templates(t.brand_id,auth.uid()) AND (t.source_client_id IS NULL OR public.can_access_client(t.source_client_id,auth.uid()))));
GRANT DELETE ON public.project_templates TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.project_template_jobs,public.project_template_tasks FROM authenticated;
CREATE OR REPLACE FUNCTION public.save_project_template(_brand_id uuid,_template_id uuid,_name text,_description text,_blueprint jsonb,_source_project_id uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $fn$
DECLARE _uid uuid:=auth.uid(); _id uuid; _client uuid; _job jsonb; _task jsonb; _item jsonb; _role text; _count int:=0;
BEGIN
 IF NOT public.can_manage_project_templates(_brand_id,_uid) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF length(trim(coalesce(_name,''))) NOT BETWEEN 2 AND 120 OR jsonb_typeof(_blueprint)<>'object' OR jsonb_typeof(_blueprint->'jobs')<>'array' OR jsonb_typeof(_blueprint->'participants')<>'array' OR jsonb_typeof(_blueprint->'texts')<>'array' THEN RAISE EXCEPTION 'Invalid template'; END IF;
 IF jsonb_array_length(_blueprint->'jobs')>100 OR jsonb_array_length(_blueprint->'texts')>300 OR jsonb_array_length(_blueprint->'participants')>100 OR length(_blueprint::text)>500000 THEN RAISE EXCEPTION 'Template too large'; END IF;
 IF _source_project_id IS NOT NULL THEN
  SELECT p.client_id INTO _client FROM public.projects p WHERE p.id=_source_project_id AND p.brand_id=_brand_id AND public.can_access_project(p.id,_uid);
  IF NOT FOUND THEN RAISE EXCEPTION 'Project out of scope' USING ERRCODE='42501'; END IF;
 END IF;
 FOR _item IN SELECT value FROM jsonb_array_elements(_blueprint->'texts') LOOP
  IF (_item->>'level') NOT IN ('project','job','task') OR (_item->>'kind') NOT IN ('description','comment') OR length(coalesce(_item->>'body','')) NOT BETWEEN 1 AND 4000 THEN RAISE EXCEPTION 'Invalid text'; END IF;
  IF (_item->>'kind')='comment' AND _source_project_id IS NOT NULL AND (NOT (_item ? 'sourceId') OR NOT (_item ? 'sourceKind')) THEN RAISE EXCEPTION 'Missing source text proof' USING ERRCODE='42501'; END IF;
  IF _item ? 'sourceId' THEN
   IF _source_project_id IS NULL OR NOT (
    ((_item->>'sourceKind')='work_comment' AND EXISTS (SELECT 1 FROM public.work_comments c WHERE c.id=(_item->>'sourceId')::uuid AND c.project_id=_source_project_id AND c.brand_id=_brand_id AND public.can_access_project(c.project_id,_uid))) OR
    ((_item->>'sourceKind')='task_comment' AND EXISTS (SELECT 1 FROM public.task_comments c JOIN public.tasks t ON t.id=c.task_id WHERE c.id=(_item->>'sourceId')::uuid AND t.project_id=_source_project_id AND c.brand_id=_brand_id AND public.can_access_task(t.id,_uid))) OR
    ((_item->>'sourceKind')='client_briefing' AND EXISTS (SELECT 1 FROM public.client_briefings b JOIN public.projects p ON p.client_id=b.client_id WHERE b.id=(_item->>'sourceId')::uuid AND p.id=_source_project_id AND p.brand_id=_brand_id AND public.can_access_client(b.client_id,_uid))) OR
    ((_item->>'sourceKind')='brand_briefing' AND EXISTS (SELECT 1 FROM public.brand_briefings b JOIN public.projects p ON p.client_id=b.client_id WHERE b.id=(_item->>'sourceId')::uuid AND p.id=_source_project_id AND p.brand_id=_brand_id AND b.brand_id=_brand_id AND public.can_access_client(b.client_id,_uid)))
   ) THEN RAISE EXCEPTION 'Source text out of scope' USING ERRCODE='42501'; END IF;
  END IF;
 END LOOP;
 IF _template_id IS NOT NULL THEN
  SELECT t.id INTO _id FROM public.project_templates t WHERE t.id=_template_id AND t.brand_id=_brand_id AND NOT t.is_system AND t.archived_at IS NULL AND (t.source_client_id IS NULL OR public.can_access_client(t.source_client_id,_uid)) FOR UPDATE;
  IF _id IS NULL THEN RAISE EXCEPTION 'Template unavailable' USING ERRCODE='42501'; END IF;
 END IF;
 FOR _job IN SELECT value FROM jsonb_array_elements(_blueprint->'jobs') LOOP
  IF length(trim(coalesce(_job->>'name',''))) NOT BETWEEN 1 AND 120 OR jsonb_typeof(_job->'tasks')<>'array' OR jsonb_array_length(_job->'tasks')>300 THEN RAISE EXCEPTION 'Invalid job'; END IF;
  IF _job->>'assigneeId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.brand_members bm WHERE bm.user_id=(_job->>'assigneeId')::uuid AND bm.brand_id=_brand_id AND bm.is_active) THEN RAISE EXCEPTION 'Invalid assignee'; END IF;
  FOR _task IN SELECT value FROM jsonb_array_elements(_job->'tasks') LOOP
   _count:=_count+1;
   IF _count>1000 OR length(trim(coalesce(_task->>'title',''))) NOT BETWEEN 1 AND 200 OR coalesce(_task->>'priority','medium') NOT IN ('low','medium','high','urgent') OR coalesce((_task->>'estimatedMinutes')::int,0)<0 THEN RAISE EXCEPTION 'Invalid task'; END IF;
   IF _task->>'assigneeId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.brand_members bm WHERE bm.user_id=(_task->>'assigneeId')::uuid AND bm.brand_id=_brand_id AND bm.is_active) THEN RAISE EXCEPTION 'Invalid assignee'; END IF;
  END LOOP;
 END LOOP;
 FOR _item IN SELECT value FROM jsonb_array_elements(_blueprint->'participants') LOOP
  IF NOT EXISTS(SELECT 1 FROM public.brand_members bm WHERE bm.user_id=trim(both '"' from _item::text)::uuid AND bm.brand_id=_brand_id AND bm.is_active) THEN RAISE EXCEPTION 'Invalid participant'; END IF;
 END LOOP;
 IF _blueprint->>'ownerId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.brand_members bm WHERE bm.user_id=(_blueprint->>'ownerId')::uuid AND bm.brand_id=_brand_id AND bm.is_active) THEN RAISE EXCEPTION 'Invalid owner'; END IF;
 IF _id IS NULL THEN INSERT INTO public.project_templates(brand_id,name,description,created_by,source_client_id,blueprint) VALUES(_brand_id,trim(_name),_description,_uid,_client,_blueprint) RETURNING id INTO _id;
 ELSE UPDATE public.project_templates SET name=trim(_name),description=_description,source_client_id=_client,blueprint=_blueprint WHERE id=_id; END IF;
 RETURN _id;
END $fn$;
REVOKE ALL ON FUNCTION public.save_project_template(uuid,uuid,text,text,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_project_template(uuid,uuid,text,text,jsonb,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.archive_project_template(_brand_id uuid,_template_id uuid) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $fn$ DECLARE _id uuid; BEGIN IF NOT public.can_manage_project_templates(_brand_id,auth.uid()) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF; UPDATE public.project_templates t SET archived_at=now() WHERE t.id=_template_id AND t.brand_id=_brand_id AND NOT t.is_system AND t.archived_at IS NULL AND (t.source_client_id IS NULL OR public.can_access_client(t.source_client_id,auth.uid())) RETURNING t.id INTO _id; IF _id IS NULL THEN RAISE EXCEPTION 'Template unavailable' USING ERRCODE='42501'; END IF; RETURN _id; END $fn$;
REVOKE ALL ON FUNCTION public.archive_project_template(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.archive_project_template(uuid,uuid) TO authenticated;
CREATE FUNCTION public.restore_project_template(_brand_id uuid,_template_id uuid) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $fn$ DECLARE _id uuid; BEGIN IF NOT public.can_manage_project_templates(_brand_id,auth.uid()) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF; UPDATE public.project_templates t SET archived_at=NULL WHERE t.id=_template_id AND t.brand_id=_brand_id AND NOT t.is_system AND t.archived_at IS NOT NULL AND (t.source_client_id IS NULL OR public.can_access_client(t.source_client_id,auth.uid())) RETURNING t.id INTO _id; IF _id IS NULL THEN RAISE EXCEPTION 'Template unavailable' USING ERRCODE='42501'; END IF; RETURN _id; END $fn$;
REVOKE ALL ON FUNCTION public.restore_project_template(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.restore_project_template(uuid,uuid) TO authenticated;
CREATE FUNCTION public.delete_project_template(_brand_id uuid,_template_id uuid,_confirmation text) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $fn$ DECLARE _model public.project_templates%ROWTYPE; BEGIN IF NOT public.can_manage_project_templates(_brand_id,auth.uid()) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF; SELECT * INTO _model FROM public.project_templates t WHERE t.id=_template_id AND t.brand_id=_brand_id AND NOT t.is_system AND (t.source_client_id IS NULL OR public.can_access_client(t.source_client_id,auth.uid())) FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Template unavailable' USING ERRCODE='42501'; END IF; IF _confirmation IS DISTINCT FROM _model.name THEN RAISE EXCEPTION 'Confirmation does not match model name' USING ERRCODE='22023'; END IF; IF EXISTS(SELECT 1 FROM public.project_template_requests r WHERE r.template_id=_template_id) THEN RAISE EXCEPTION 'Model has creation records; archive instead' USING ERRCODE='23503'; END IF; DELETE FROM public.project_templates t WHERE t.id=_template_id AND t.brand_id=_brand_id; RETURN _template_id; END $fn$;
REVOKE ALL ON FUNCTION public.delete_project_template(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.delete_project_template(uuid,uuid,text) TO authenticated;