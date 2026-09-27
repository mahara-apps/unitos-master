CREATE TABLE public.project_duplication_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  source_project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  request_id uuid NOT NULL,
  duplicated_project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (created_by, request_id)
);
GRANT SELECT, INSERT ON public.project_duplication_requests TO authenticated;
GRANT ALL ON public.project_duplication_requests TO service_role;
ALTER TABLE public.project_duplication_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "duplication requests own read" ON public.project_duplication_requests FOR SELECT TO authenticated USING (created_by=auth.uid() AND public.can_access_project(source_project_id,auth.uid()));
CREATE POLICY "duplication requests own insert" ON public.project_duplication_requests FOR INSERT TO authenticated WITH CHECK (created_by=auth.uid() AND public.can_access_project(source_project_id,auth.uid()));
CREATE INDEX project_duplication_requests_source_idx ON public.project_duplication_requests(source_project_id,created_at DESC);

CREATE OR REPLACE FUNCTION public.duplicate_project(_project_id uuid,_brand_id uuid,_request_id uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
 _uid uuid:=auth.uid(); _source public.projects%ROWTYPE; _new uuid; _existing uuid; _owner uuid;
 _job record; _task record; _new_job uuid; _new_task uuid; _person record;
BEGIN
 IF _uid IS NULL OR _request_id IS NULL THEN RAISE EXCEPTION 'Unauthenticated' USING ERRCODE='42501'; END IF;
 SELECT * INTO _source FROM public.projects WHERE id=_project_id AND brand_id=_brand_id;
 IF NOT FOUND OR NOT public.can_access_project(_project_id,_uid) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;

 INSERT INTO public.project_duplication_requests(brand_id,source_project_id,created_by,request_id)
 VALUES(_brand_id,_project_id,_uid,_request_id)
 ON CONFLICT(created_by,request_id) DO NOTHING;
 SELECT duplicated_project_id INTO _existing FROM public.project_duplication_requests WHERE created_by=_uid AND request_id=_request_id FOR UPDATE;
 IF _existing IS NOT NULL THEN RETURN _existing; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.project_duplication_requests WHERE created_by=_uid AND request_id=_request_id AND source_project_id=_project_id AND brand_id=_brand_id) THEN RAISE EXCEPTION 'Request conflict' USING ERRCODE='23505'; END IF;

 _owner:=_source.owner_id;
 IF _owner IS NOT NULL AND _source.client_id IS NOT NULL AND NOT public.can_access_client(_source.client_id,_owner) THEN _owner:=NULL; END IF;
 INSERT INTO public.projects(brand_id,client_id,name,description,status,status_id,color,progress,start_date,due_at,goals,owner_id,done_at,archived_at,monthly_plan_id)
 VALUES(_source.brand_id,_source.client_id,'COPIA - '||_source.name,_source.description,'active',NULL,_source.color,0,_source.start_date,_source.due_at,_source.goals,coalesce(_owner,_uid),NULL,NULL,NULL)
 RETURNING id INTO _new;

 FOR _person IN SELECT pp.user_id FROM public.project_participants pp WHERE pp.project_id=_project_id ORDER BY pp.created_at LOOP
  IF _source.client_id IS NULL OR public.can_access_client(_source.client_id,_person.user_id) THEN
   INSERT INTO public.project_participants(brand_id,project_id,user_id) VALUES(_brand_id,_new,_person.user_id) ON CONFLICT DO NOTHING;
  END IF;
 END LOOP;

 FOR _job IN SELECT * FROM public.project_jobs WHERE project_id=_project_id AND brand_id=_brand_id AND archived_at IS NULL ORDER BY position,created_at,id LOOP
  IF _job.assignee_id IS NOT NULL AND _source.client_id IS NOT NULL AND NOT public.can_access_client(_source.client_id,_job.assignee_id) THEN _job.assignee_id:=NULL; END IF;
  INSERT INTO public.project_jobs(project_id,brand_id,name,description,color,position,assignee_id,start_date,due_at,status_id,estimated_minutes,done_at,archived_at)
  VALUES(_new,_brand_id,_job.name,_job.description,_job.color,_job.position,_job.assignee_id,_job.start_date,_job.due_at,NULL,_job.estimated_minutes,NULL,NULL) RETURNING id INTO _new_job;
  FOR _task IN SELECT * FROM public.tasks WHERE job_id=_job.id AND brand_id=_brand_id AND archived_at IS NULL ORDER BY position,created_at,id LOOP
   IF _task.assignee_id IS NOT NULL AND _source.client_id IS NOT NULL AND NOT public.can_access_client(_source.client_id,_task.assignee_id) THEN _task.assignee_id:=NULL; END IF;
   INSERT INTO public.tasks(brand_id,client_id,project_id,job_id,title,description,status,priority,assignee_id,due_at,start_date,status_id,done,done_at,archived_at,estimated_minutes,total_minutes,position,created_by,post_id)
   VALUES(_brand_id,_source.client_id,_new,_new_job,_task.title,_task.description,'todo',_task.priority,_task.assignee_id,_task.due_at,_task.start_date,NULL,false,NULL,NULL,_task.estimated_minutes,0,_task.position,_uid,NULL) RETURNING id INTO _new_task;
   INSERT INTO public.task_subtasks(brand_id,task_id,title,done,position,created_by)
   SELECT _brand_id,_new_task,s.title,false,s.position,_uid FROM public.task_subtasks s WHERE s.task_id=_task.id ORDER BY s.position,s.created_at,s.id;
  END LOOP;
 END LOOP;
 UPDATE public.project_duplication_requests SET duplicated_project_id=_new WHERE created_by=_uid AND request_id=_request_id;
 RETURN _new;
END $$;
REVOKE ALL ON FUNCTION public.duplicate_project(uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.duplicate_project(uuid,uuid,uuid) TO authenticated,service_role;