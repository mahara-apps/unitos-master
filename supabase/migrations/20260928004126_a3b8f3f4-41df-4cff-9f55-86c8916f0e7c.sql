DO $migration$
DECLARE _definition text; _old text; _new text;
BEGIN
 _definition:=pg_get_functiondef('public.instantiate_project_template(uuid,uuid,uuid,text)'::regprocedure);
 _old:=substring(_definition from 'FOR _text IN SELECT value FROM jsonb_array_elements\(_t\.blueprint -> ''texts''\) LOOP[\s\S]*?END LOOP;');
 IF _old IS NULL THEN _old:=substring(_definition from 'FOR _text IN SELECT value FROM jsonb_array_elements\(_t\.blueprint->''texts''\) LOOP[\s\S]*?END LOOP;'); END IF;
 IF _old IS NULL THEN RAISE EXCEPTION 'Expected template text loop not found'; END IF;
 _new:=$body$FOR _text IN SELECT value FROM jsonb_array_elements(_t.blueprint->'texts') LOOP
    IF length(trim(coalesce(_text->>'body',''))) = 0 THEN CONTINUE; END IF;
    IF _text->>'level'='project' THEN
      UPDATE public.projects SET description=concat_ws(E'\n\n',nullif(description,''),_text->>'body') WHERE id=_new;
    ELSIF _text->>'level'='job' AND coalesce((_text->>'jobIndex')::int,-1)+1 BETWEEN 1 AND coalesce(array_length(_job_ids,1),0) THEN
      UPDATE public.project_jobs SET description=concat_ws(E'\n\n',nullif(description,''),_text->>'body') WHERE id=_job_ids[(_text->>'jobIndex')::int+1];
    ELSIF _text->>'level'='task' AND coalesce((_text->>'taskIndex')::int,-1)+1 BETWEEN 1 AND coalesce(array_length(_task_ids,1),0) THEN
      UPDATE public.tasks SET description=concat_ws(E'\n\n',nullif(description,''),_text->>'body') WHERE id=_task_ids[(_text->>'taskIndex')::int+1];
    END IF;
   END LOOP;$body$;
 EXECUTE replace(_definition,_old,_new);
END $migration$;