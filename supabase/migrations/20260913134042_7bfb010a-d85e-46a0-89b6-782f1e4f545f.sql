CREATE TABLE public.project_job_counters (
  brand_id uuid PRIMARY KEY REFERENCES public.brands(id) ON DELETE CASCADE,
  next_number bigint NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.project_job_counters TO authenticated;
GRANT ALL ON public.project_job_counters TO service_role;
ALTER TABLE public.project_job_counters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "project_job_counters_read" ON public.project_job_counters
  FOR SELECT TO authenticated
  USING (public.brand_member_role(auth.uid(), brand_id) IS NOT NULL);

ALTER TABLE public.project_jobs
  ADD COLUMN job_number bigint,
  ADD COLUMN estimated_minutes integer;

WITH numbered AS (
  SELECT id, brand_id,
         row_number() OVER (PARTITION BY brand_id ORDER BY created_at, id)::bigint AS seq
  FROM public.project_jobs
)
UPDATE public.project_jobs j
SET job_number = numbered.seq
FROM numbered
WHERE numbered.id = j.id;

INSERT INTO public.project_job_counters (brand_id, next_number)
SELECT brand_id, COALESCE(max(job_number), 0) + 1
FROM public.project_jobs
GROUP BY brand_id
ON CONFLICT (brand_id) DO UPDATE
SET next_number = GREATEST(public.project_job_counters.next_number, EXCLUDED.next_number),
    updated_at = now();

ALTER TABLE public.project_jobs
  ALTER COLUMN job_number SET NOT NULL,
  ADD CONSTRAINT project_jobs_estimated_minutes_nonnegative CHECK (estimated_minutes IS NULL OR estimated_minutes >= 0),
  ADD CONSTRAINT project_jobs_brand_number_unique UNIQUE (brand_id, job_number);

CREATE OR REPLACE FUNCTION public.assign_project_job_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _number bigint;
BEGIN
  IF NEW.job_number IS NOT NULL THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.project_job_counters (brand_id, next_number)
  VALUES (NEW.brand_id, 2)
  ON CONFLICT (brand_id) DO UPDATE
    SET next_number = public.project_job_counters.next_number + 1,
        updated_at = now()
  RETURNING next_number - 1 INTO _number;
  NEW.job_number := _number;
  RETURN NEW;
END;
$$;

CREATE TRIGGER project_jobs_assign_number
BEFORE INSERT ON public.project_jobs
FOR EACH ROW EXECUTE FUNCTION public.assign_project_job_number();

CREATE OR REPLACE FUNCTION public.prevent_project_job_number_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.job_number IS DISTINCT FROM OLD.job_number THEN
    RAISE EXCEPTION 'O número do job é imutável';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER project_jobs_number_immutable
BEFORE UPDATE OF job_number ON public.project_jobs
FOR EACH ROW EXECUTE FUNCTION public.prevent_project_job_number_change();

ALTER TABLE public.work_statuses
  ADD COLUMN task_state public.task_status;

CREATE UNIQUE INDEX work_statuses_brand_scope_name_ci_uidx
  ON public.work_statuses (brand_id, scope, lower(name));

ALTER TABLE public.task_time_entries
  ALTER COLUMN task_id DROP NOT NULL,
  ADD COLUMN job_id uuid REFERENCES public.project_jobs(id) ON DELETE CASCADE,
  ADD CONSTRAINT task_time_entries_one_target CHECK ((task_id IS NOT NULL) <> (job_id IS NOT NULL));

CREATE INDEX task_time_entries_job_idx ON public.task_time_entries (job_id, started_at DESC)
  WHERE job_id IS NOT NULL;

DROP POLICY IF EXISTS "time_entries read via parent task" ON public.task_time_entries;
DROP POLICY IF EXISTS "time_entries own insert via parent task" ON public.task_time_entries;
DROP POLICY IF EXISTS "time_entries own update via parent task" ON public.task_time_entries;
DROP POLICY IF EXISTS "time_entries own delete via parent task" ON public.task_time_entries;

CREATE POLICY "time_entries read via work target" ON public.task_time_entries
  FOR SELECT TO authenticated
  USING (
    (task_id IS NOT NULL AND public.can_access_task(task_id, auth.uid()))
    OR
    (job_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.project_jobs j
      WHERE j.id = job_id AND public.can_access_project(j.project_id, auth.uid())
    ))
  );
CREATE POLICY "time_entries own insert via work target" ON public.task_time_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid() AND (
      (task_id IS NOT NULL AND public.can_access_task(task_id, auth.uid()))
      OR
      (job_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.project_jobs j
        WHERE j.id = job_id AND public.can_access_project(j.project_id, auth.uid())
      ))
    )
  );
CREATE POLICY "time_entries own update via work target" ON public.task_time_entries
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid() AND (
      (task_id IS NOT NULL AND public.can_access_task(task_id, auth.uid()))
      OR
      (job_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.project_jobs j
        WHERE j.id = job_id AND public.can_access_project(j.project_id, auth.uid())
      ))
    )
  );
CREATE POLICY "time_entries own delete via work target" ON public.task_time_entries
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid() AND (
      (task_id IS NOT NULL AND public.can_access_task(task_id, auth.uid()))
      OR
      (job_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.project_jobs j
        WHERE j.id = job_id AND public.can_access_project(j.project_id, auth.uid())
      ))
    )
  );

CREATE OR REPLACE FUNCTION public.start_job_timer(_job_id uuid, _brand_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
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

  INSERT INTO public.activity_events (brand_id, actor_id, entity_type, entity_id, verb, payload)
  VALUES (_brand_id, _uid, 'job', _job_id, 'timer_started', '{}'::jsonb);
  RETURN _new_id;
END;
$$;
REVOKE ALL ON FUNCTION public.start_job_timer(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_job_timer(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.log_project_job_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _client_id uuid;
BEGIN
  SELECT client_id INTO _client_id FROM public.projects WHERE id = NEW.project_id;
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.activity_events (brand_id, client_id, actor_id, entity_type, entity_id, verb, payload)
    VALUES (NEW.brand_id, _client_id, auth.uid(), 'job', NEW.id, 'created', jsonb_build_object('title', NEW.name, 'job_number', NEW.job_number));
  ELSE
    IF OLD.status_id IS DISTINCT FROM NEW.status_id THEN
      INSERT INTO public.activity_events (brand_id, client_id, actor_id, entity_type, entity_id, verb, payload)
      VALUES (NEW.brand_id, _client_id, auth.uid(), 'job', NEW.id, 'status_changed', jsonb_build_object('from', OLD.status_id, 'to', NEW.status_id));
    END IF;
    IF OLD.done_at IS DISTINCT FROM NEW.done_at THEN
      INSERT INTO public.activity_events (brand_id, client_id, actor_id, entity_type, entity_id, verb, payload)
      VALUES (NEW.brand_id, _client_id, auth.uid(), 'job', NEW.id, CASE WHEN NEW.done_at IS NULL THEN 'reopened' ELSE 'completed' END, '{}'::jsonb);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER project_jobs_activity
AFTER INSERT OR UPDATE ON public.project_jobs
FOR EACH ROW EXECUTE FUNCTION public.log_project_job_activity();

CREATE OR REPLACE FUNCTION public.log_task_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.activity_events (brand_id, client_id, actor_id, entity_type, entity_id, verb, payload)
    VALUES (NEW.brand_id, NEW.client_id, NEW.created_by, 'task', NEW.id, 'created', jsonb_build_object('title', NEW.title, 'job_id', NEW.job_id));
  ELSIF OLD.status IS DISTINCT FROM NEW.status OR OLD.status_id IS DISTINCT FROM NEW.status_id THEN
    INSERT INTO public.activity_events (brand_id, client_id, actor_id, entity_type, entity_id, verb, payload)
    VALUES (NEW.brand_id, NEW.client_id, auth.uid(), 'task', NEW.id, 'status_changed', jsonb_build_object('from', OLD.status, 'to', NEW.status, 'status_id', NEW.status_id, 'title', NEW.title, 'job_id', NEW.job_id));
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_work_timer_stop()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _client_id uuid;
DECLARE _target_job uuid;
BEGIN
  IF OLD.ended_at IS NULL AND NEW.ended_at IS NOT NULL THEN
    IF NEW.job_id IS NOT NULL THEN
      _target_job := NEW.job_id;
      SELECT p.client_id INTO _client_id FROM public.project_jobs j JOIN public.projects p ON p.id = j.project_id WHERE j.id = NEW.job_id;
    ELSE
      SELECT t.job_id, t.client_id INTO _target_job, _client_id FROM public.tasks t WHERE t.id = NEW.task_id;
    END IF;
    IF _target_job IS NOT NULL THEN
      INSERT INTO public.activity_events (brand_id, client_id, actor_id, entity_type, entity_id, verb, payload)
      VALUES (NEW.brand_id, _client_id, NEW.user_id, 'job', _target_job,
        CASE WHEN NEW.ended_reason = 'pause' THEN 'timer_paused' ELSE 'timer_stopped' END,
        jsonb_build_object('task_id', NEW.task_id, 'seconds', NEW.seconds));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER work_timer_stop_activity
AFTER UPDATE OF ended_at ON public.task_time_entries
FOR EACH ROW EXECUTE FUNCTION public.log_work_timer_stop();

CREATE TRIGGER project_job_counters_touch
BEFORE UPDATE ON public.project_job_counters
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();