ALTER TABLE public.project_templates ADD COLUMN IF NOT EXISTS blueprint jsonb, ADD COLUMN IF NOT EXISTS source_client_id uuid REFERENCES public.clients(id), ADD COLUMN IF NOT EXISTS archived_at timestamptz;
CREATE INDEX IF NOT EXISTS project_templates_brand_archive_idx ON public.project_templates(brand_id, archived_at);
DROP POLICY IF EXISTS "project_templates read visible" ON public.project_templates;
CREATE POLICY "project_templates read visible" ON public.project_templates FOR SELECT TO authenticated USING (is_system OR (brand_id IS NOT NULL AND public.is_brand_member(brand_id,auth.uid()) AND (source_client_id IS NULL OR public.can_access_client(source_client_id,auth.uid()))));
DROP POLICY IF EXISTS "project_templates insert brand" ON public.project_templates;
CREATE POLICY "project_templates insert brand" ON public.project_templates FOR INSERT TO authenticated WITH CHECK (NOT is_system AND brand_id IS NOT NULL AND public.is_brand_member(brand_id,auth.uid()) AND (source_client_id IS NULL OR (EXISTS (SELECT 1 FROM public.clients c WHERE c.id=source_client_id AND c.brand_id=project_templates.brand_id) AND public.can_access_client(source_client_id,auth.uid()))));
DROP POLICY IF EXISTS "project_templates update brand" ON public.project_templates;
CREATE POLICY "project_templates update brand" ON public.project_templates FOR UPDATE TO authenticated USING (NOT is_system AND brand_id IS NOT NULL AND public.is_brand_member(brand_id,auth.uid()) AND (source_client_id IS NULL OR public.can_access_client(source_client_id,auth.uid()))) WITH CHECK (NOT is_system AND brand_id IS NOT NULL AND public.is_brand_member(brand_id,auth.uid()) AND (source_client_id IS NULL OR (EXISTS (SELECT 1 FROM public.clients c WHERE c.id=source_client_id AND c.brand_id=project_templates.brand_id) AND public.can_access_client(source_client_id,auth.uid()))));
DROP POLICY IF EXISTS "project_templates delete brand" ON public.project_templates;
CREATE POLICY "project_templates delete brand" ON public.project_templates FOR DELETE TO authenticated USING (NOT is_system AND brand_id IS NOT NULL AND public.is_brand_member(brand_id,auth.uid()) AND (source_client_id IS NULL OR public.can_access_client(source_client_id,auth.uid())));
CREATE OR REPLACE FUNCTION public.save_project_template(_brand_id uuid, _template_id uuid, _name text, _description text, _blueprint jsonb, _source_project_id uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _uid uuid:=auth.uid(); _id uuid; _client uuid; _job jsonb; _task jsonb; _item jsonb; _row record; _role text; _count int:=0;
BEGIN
 IF _uid IS NULL OR NOT public.is_brand_member(_brand_id,_uid) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 _role:=public.app_access_role(_uid,_brand_id);
 IF _role NOT IN ('super_admin','admin','manager','user') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF length(trim(coalesce(_name,''))) NOT BETWEEN 2 AND 120 OR jsonb_typeof(_blueprint) <> 'object' OR jsonb_typeof(_blueprint->'jobs') <> 'array' OR jsonb_typeof(_blueprint->'participants') <> 'array' OR jsonb_typeof(_blueprint->'texts') <> 'array' THEN RAISE EXCEPTION 'Invalid template'; END IF;
 IF jsonb_array_length(_blueprint->'jobs') > 100 OR jsonb_array_length(_blueprint->'texts') > 300 OR jsonb_array_length(_blueprint->'participants') > 100 OR length(_blueprint::text)>500000 THEN RAISE EXCEPTION 'Template too large'; END IF;
 IF _source_project_id IS NOT NULL THEN
  SELECT p.client_id INTO _client FROM public.projects p WHERE p.id=_source_project_id AND p.brand_id=_brand_id AND public.can_access_project(p.id,_uid);
  IF NOT FOUND THEN RAISE EXCEPTION 'Project out of scope' USING ERRCODE='42501'; END IF;
 ELSIF _role NOT IN ('super_admin','admin') THEN RAISE EXCEPTION 'Workspace template requires admin'; END IF;
 IF _template_id IS NOT NULL THEN
  SELECT t.id INTO _id FROM public.project_templates t WHERE t.id=_template_id AND t.brand_id=_brand_id AND NOT t.is_system AND t.archived_at IS NULL AND (t.source_client_id IS NULL OR public.can_access_client(t.source_client_id,_uid)) FOR UPDATE;
  IF _id IS NULL THEN RAISE EXCEPTION 'Template unavailable' USING ERRCODE='42501'; END IF;
 END IF;
 FOR _job IN SELECT value FROM jsonb_array_elements(_blueprint->'jobs') LOOP
  IF length(trim(coalesce(_job->>'name',''))) NOT BETWEEN 1 AND 120 OR jsonb_typeof(_job->'tasks') <> 'array' OR jsonb_array_length(_job->'tasks') > 300 THEN RAISE EXCEPTION 'Invalid job'; END IF;
  IF _job->>'assigneeId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.brand_members bm WHERE bm.user_id=(_job->>'assigneeId')::uuid AND bm.brand_id=_brand_id AND bm.is_active) THEN RAISE EXCEPTION 'Invalid assignee'; END IF;
  FOR _task IN SELECT value FROM jsonb_array_elements(_job->'tasks') LOOP
   _count:=_count+1;
   IF _count>1000 OR length(trim(coalesce(_task->>'title',''))) NOT BETWEEN 1 AND 200 OR coalesce(_task->>'priority','medium') NOT IN ('low','medium','high','urgent') OR coalesce((_task->>'estimatedMinutes')::int,0)<0 THEN RAISE EXCEPTION 'Invalid task'; END IF;
   IF _task->>'assigneeId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.brand_members bm WHERE bm.user_id=(_task->>'assigneeId')::uuid AND bm.brand_id=_brand_id AND bm.is_active) THEN RAISE EXCEPTION 'Invalid assignee'; END IF;
  END LOOP;
 END LOOP;
 FOREACH _item IN ARRAY ARRAY(SELECT value FROM jsonb_array_elements(_blueprint->'participants')) LOOP
  IF NOT EXISTS(SELECT 1 FROM public.brand_members bm WHERE bm.user_id=trim(both '"' from _item::text)::uuid AND bm.brand_id=_brand_id AND bm.is_active) THEN RAISE EXCEPTION 'Invalid participant'; END IF;
 END LOOP;
 FOR _item IN SELECT value FROM jsonb_array_elements(_blueprint->'texts') LOOP
  IF (_item->>'level') NOT IN ('project','job','task') OR (_item->>'kind') NOT IN ('description','comment') OR length(coalesce(_item->>'body','')) NOT BETWEEN 1 AND 4000 THEN RAISE EXCEPTION 'Invalid text'; END IF;
 END LOOP;
 IF _blueprint->>'ownerId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.brand_members bm WHERE bm.user_id=(_blueprint->>'ownerId')::uuid AND bm.brand_id=_brand_id AND bm.is_active) THEN RAISE EXCEPTION 'Invalid owner'; END IF;
 IF _id IS NULL THEN INSERT INTO public.project_templates(brand_id,name,description,created_by,source_client_id,blueprint) VALUES(_brand_id,trim(_name),_description,_uid,_client,_blueprint) RETURNING id INTO _id;
 ELSE UPDATE public.project_templates SET name=trim(_name),description=_description,source_client_id=_client,blueprint=_blueprint WHERE id=_id; END IF;
 RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.save_project_template(uuid,uuid,text,text,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_project_template(uuid,uuid,text,text,jsonb,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.instantiate_project_template(_template_id uuid,_brand_id uuid,_client_id uuid,_project_name text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _uid uuid:=auth.uid(); _new uuid; _t public.project_templates%ROWTYPE; _job jsonb; _task jsonb; _text jsonb; _job_id uuid; _task_id uuid; _job_ids uuid[]:=ARRAY[]::uuid[]; _task_ids uuid[]:=ARRAY[]::uuid[]; _j int:=0; _k int; _assignee uuid; _person text; _owner uuid; _role text; _legacy record; _legacy_task record;
BEGIN
 IF _uid IS NULL OR NOT public.is_brand_member(_brand_id,_uid) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 _role:=public.app_access_role(_uid,_brand_id);
 IF _role NOT IN ('super_admin','admin','manager','user') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF length(trim(coalesce(_project_name,''))) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'Invalid project name'; END IF;
 IF _client_id IS NULL THEN IF _role NOT IN ('super_admin','admin') THEN RAISE EXCEPTION 'Client required' USING ERRCODE='42501'; END IF;
 ELSIF NOT EXISTS(SELECT 1 FROM public.clients WHERE id=_client_id AND brand_id=_brand_id) OR NOT public.can_access_client(_client_id,_uid) THEN RAISE EXCEPTION 'Client out of scope' USING ERRCODE='42501'; END IF;
 SELECT * INTO _t FROM public.project_templates WHERE id=_template_id AND (is_system OR (brand_id=_brand_id AND (source_client_id IS NULL OR public.can_access_client(source_client_id,_uid)))) AND archived_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Template unavailable' USING ERRCODE='42501'; END IF;
 IF _t.source_client_id IS NOT NULL AND _t.source_client_id IS DISTINCT FROM _client_id THEN RAISE EXCEPTION 'Source client restriction' USING ERRCODE='42501'; END IF;
 IF _t.blueprint IS NOT NULL THEN
  _owner:=nullif(_t.blueprint->>'ownerId','')::uuid;
  IF _owner IS NOT NULL AND (_client_id IS NULL AND _role NOT IN ('super_admin','admin') OR _client_id IS NOT NULL AND NOT public.can_access_client(_client_id,_owner)) THEN _owner:=NULL; END IF;
 END IF;
 INSERT INTO public.projects(brand_id,client_id,name,description,status,owner_id) VALUES(_brand_id,_client_id,trim(_project_name),CASE WHEN _t.blueprint IS NOT NULL THEN _t.blueprint->>'description' ELSE NULL END,'active',coalesce(_owner,_uid)) RETURNING id INTO _new;
 IF _t.blueprint IS NULL THEN
  FOR _legacy IN SELECT * FROM public.project_template_jobs WHERE template_id=_template_id ORDER BY position,id LOOP
   INSERT INTO public.project_jobs(project_id,brand_id,name,description,color,position) VALUES(_new,_brand_id,_legacy.name,_legacy.description,_legacy.color,_legacy.position) RETURNING id INTO _job_id;
   FOR _legacy_task IN SELECT * FROM public.project_template_tasks WHERE template_job_id=_legacy.id ORDER BY position,id LOOP
    INSERT INTO public.tasks(brand_id,client_id,project_id,job_id,title,description,priority,estimated_minutes,position,status,created_by) VALUES(_brand_id,_client_id,_new,_job_id,_legacy_task.title,_legacy_task.description,coalesce(_legacy_task.priority,'medium')::public.task_priority,_legacy_task.estimated_minutes,_legacy_task.position,'todo',_uid);
   END LOOP;
  END LOOP;
 ELSE
  FOR _job IN SELECT value FROM jsonb_array_elements(_t.blueprint->'jobs') LOOP
   _j:=_j+1; _k:=0; _assignee:=nullif(_job->>'assigneeId','')::uuid;
   IF _assignee IS NOT NULL AND _client_id IS NOT NULL AND NOT public.can_access_client(_client_id,_assignee) THEN _assignee:=NULL; END IF;
   INSERT INTO public.project_jobs(project_id,brand_id,name,description,color,position,assignee_id,estimated_minutes) VALUES(_new,_brand_id,_job->>'name',_job->>'description',_job->>'color',_j-1,_assignee,nullif(_job->>'estimatedMinutes','')::int) RETURNING id INTO _job_id;
   _job_ids:=array_append(_job_ids,_job_id);
   FOR _task IN SELECT value FROM jsonb_array_elements(_job->'tasks') LOOP
    _k:=_k+1; _assignee:=nullif(_task->>'assigneeId','')::uuid;
    IF _assignee IS NOT NULL AND _client_id IS NOT NULL AND NOT public.can_access_client(_client_id,_assignee) THEN _assignee:=NULL; END IF;
    INSERT INTO public.tasks(brand_id,client_id,project_id,job_id,title,description,priority,estimated_minutes,position,status,created_by,assignee_id) VALUES(_brand_id,_client_id,_new,_job_id,_task->>'title',_task->>'description',coalesce(_task->>'priority','medium')::public.task_priority,nullif(_task->>'estimatedMinutes','')::int,_k-1,'todo',_uid,_assignee) RETURNING id INTO _task_id;
    _task_ids:=array_append(_task_ids,_task_id);
   END LOOP;
  END LOOP;
  FOR _person IN SELECT jsonb_array_elements_text(_t.blueprint->'participants') LOOP
   IF _client_id IS NULL OR public.can_access_client(_client_id,_person::uuid) THEN INSERT INTO public.project_participants(brand_id,project_id,user_id) VALUES(_brand_id,_new,_person::uuid) ON CONFLICT DO NOTHING; END IF;
  END LOOP;
  FOR _text IN SELECT value FROM jsonb_array_elements(_t.blueprint->'texts') LOOP
   IF _text->>'kind'='description' THEN CONTINUE; END IF;
   IF _text->>'level'='project' THEN INSERT INTO public.work_comments(brand_id,project_id,author_id,body,mentions) VALUES(_brand_id,_new,_uid,_text->>'body','{}');
   ELSIF _text->>'level'='job' AND coalesce((_text->>'jobIndex')::int,-1)+1 BETWEEN 1 AND array_length(_job_ids,1) THEN INSERT INTO public.work_comments(brand_id,project_id,job_id,author_id,body,mentions) VALUES(_brand_id,_new,_job_ids[(_text->>'jobIndex')::int+1],_uid,_text->>'body','{}');
   ELSIF _text->>'level'='task' AND coalesce((_text->>'taskIndex')::int,-1)+1 BETWEEN 1 AND array_length(_task_ids,1) THEN INSERT INTO public.task_comments(brand_id,task_id,author_id,body,mentions) VALUES(_brand_id,_task_ids[(_text->>'taskIndex')::int+1],_uid,_text->>'body','{}'); END IF;
  END LOOP;
 END IF;
 RETURN _new;
END $$;
REVOKE ALL ON FUNCTION public.instantiate_project_template(uuid,uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.instantiate_project_template(uuid,uuid,uuid,text) TO authenticated;