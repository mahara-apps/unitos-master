DO $migration$
DECLARE _definition text; _anchor text; _addition text;
BEGIN
 _definition:=pg_get_functiondef('public.instantiate_project_template(uuid,uuid,uuid,text)'::regprocedure);
 _anchor:='FOR _person IN SELECT jsonb_array_elements_text(_t.blueprint -> ''participants'') LOOP';
 IF position(_anchor in _definition)=0 THEN _anchor:='FOR _person IN SELECT jsonb_array_elements_text(_t.blueprint->''participants'') LOOP'; END IF;
 IF position(_anchor in _definition)=0 THEN RAISE EXCEPTION 'Expected participants loop not found'; END IF;
 _addition:=$body$FOR _task IN SELECT value FROM jsonb_array_elements(coalesce(_t.blueprint->'directTasks','[]'::jsonb)) LOOP
    _k:=_k+1; _assignee:=nullif(_task->>'assigneeId','')::uuid;
    IF _assignee IS NOT NULL AND _client_id IS NOT NULL AND NOT public.can_access_client(_client_id,_assignee) THEN _assignee:=NULL; END IF;
    INSERT INTO public.tasks(brand_id,client_id,project_id,job_id,title,description,priority,estimated_minutes,position,status,created_by,assignee_id)
    VALUES(_brand_id,_client_id,_new,NULL,_task->>'title',_task->>'description',coalesce(_task->>'priority','medium')::public.task_priority,nullif(_task->>'estimatedMinutes','')::int,_k-1,'todo',_uid,_assignee) RETURNING id INTO _task_id;
    _task_ids:=array_append(_task_ids,_task_id);
   END LOOP;
   $body$;
 EXECUTE replace(_definition,_anchor,_addition || _anchor);
END $migration$;