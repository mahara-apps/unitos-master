CREATE OR REPLACE FUNCTION public.start_job_timer(_job_id uuid, _brand_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _new_id uuid;
  _now timestamptz := now();
  _project_id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Unauthenticated'; END IF;
  SELECT project_id INTO _project_id
  FROM public.project_jobs
  WHERE id = _job_id AND brand_id = _brand_id;
  IF _project_id IS NULL OR NOT public.can_access_project(_project_id, _uid) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  UPDATE public.task_time_entries
  SET ended_at = _now,
      seconds = GREATEST(0, ROUND(EXTRACT(EPOCH FROM (_now - started_at)))::int),
      minutes = GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (_now - started_at)) / 60.0)::int),
      ended_reason = 'auto'
  WHERE user_id = _uid AND ended_at IS NULL;

  INSERT INTO public.task_time_entries (job_id, user_id, brand_id, started_at, source)
  VALUES (_job_id, _uid, _brand_id, _now, 'timer')
  RETURNING id INTO _new_id;
  RETURN _new_id;
END;
$$;
REVOKE ALL ON FUNCTION public.start_job_timer(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_job_timer(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.log_work_timer_start()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _client_id uuid;
DECLARE _target_job uuid;
BEGIN
  IF NEW.source = 'timer' THEN
    IF NEW.job_id IS NOT NULL THEN
      _target_job := NEW.job_id;
      SELECT p.client_id INTO _client_id
      FROM public.project_jobs j
      JOIN public.projects p ON p.id = j.project_id
      WHERE j.id = NEW.job_id;
    ELSE
      SELECT t.job_id, t.client_id INTO _target_job, _client_id
      FROM public.tasks t WHERE t.id = NEW.task_id;
    END IF;
    IF _target_job IS NOT NULL THEN
      INSERT INTO public.activity_events (brand_id, client_id, actor_id, entity_type, entity_id, verb, payload)
      VALUES (NEW.brand_id, _client_id, NEW.user_id, 'job', _target_job, 'timer_started',
        jsonb_build_object('entry_id', NEW.id, 'task_id', NEW.task_id));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.log_work_timer_start() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_work_timer_start() TO service_role;

DROP TRIGGER IF EXISTS task_time_entries_activity_start ON public.task_time_entries;
CREATE TRIGGER task_time_entries_activity_start
AFTER INSERT ON public.task_time_entries
FOR EACH ROW EXECUTE FUNCTION public.log_work_timer_start();