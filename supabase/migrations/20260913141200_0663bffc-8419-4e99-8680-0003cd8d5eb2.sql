CREATE OR REPLACE FUNCTION public.duplicate_project_job(_job_id uuid, _brand_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _source public.project_jobs%ROWTYPE;
  _new_job_id uuid;
  _next_position integer;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated';
  END IF;

  SELECT * INTO _source
  FROM public.project_jobs
  WHERE id = _job_id
    AND brand_id = _brand_id;

  IF _source.id IS NULL OR NOT public.can_access_project(_source.project_id, _uid) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT COALESCE(MAX(position), -1) + 1 INTO _next_position
  FROM public.project_jobs
  WHERE project_id = _source.project_id;

  INSERT INTO public.project_jobs (
    project_id, brand_id, name, description, color, position,
    assignee_id, start_date, due_at, status_id, estimated_minutes
  ) VALUES (
    _source.project_id, _source.brand_id, _source.name || ' (cópia)',
    _source.description, _source.color, _next_position,
    _source.assignee_id, _source.start_date, _source.due_at,
    _source.status_id, _source.estimated_minutes
  )
  RETURNING id INTO _new_job_id;

  INSERT INTO public.tasks (
    brand_id, client_id, project_id, job_id, title, description,
    status, priority, assignee_id, due_at, start_date, status_id,
    done, done_at, estimated_minutes, total_minutes, position, created_by
  )
  SELECT
    brand_id, client_id, project_id, _new_job_id, title, description,
    status, priority, assignee_id, due_at, start_date, status_id,
    done, CASE WHEN done THEN now() ELSE NULL END,
    estimated_minutes, 0, position, _uid
  FROM public.tasks
  WHERE job_id = _source.id
    AND brand_id = _brand_id
    AND archived_at IS NULL
  ORDER BY position, created_at;

  RETURN _new_job_id;
END;
$$;
REVOKE ALL ON FUNCTION public.duplicate_project_job(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.duplicate_project_job(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ensure_default_work_statuses(_brand_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.brand_member_role(auth.uid(), _brand_id) IS NULL THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  INSERT INTO public.work_statuses (brand_id, scope, name, color, position, is_done, is_default, task_state)
  VALUES
    (_brand_id, 'job', 'Não iniciado', '#64748b', 10, false, false, null),
    (_brand_id, 'job', 'Em andamento', '#0ea5e9', 11, false, false, null),
    (_brand_id, 'job', 'Em revisão', '#e0a011', 12, false, false, null),
    (_brand_id, 'job', 'Bloqueado', '#dc2626', 13, false, false, null),
    (_brand_id, 'job', 'Concluído', '#16a34a', 14, true, false, null),
    (_brand_id, 'job', 'Rotina', '#64748b', 0, false, true, null),
    (_brand_id, 'job', 'Em planejamento/briefing', '#0ea5e9', 1, false, false, null),
    (_brand_id, 'job', 'Campanha ativa', '#16a34a', 2, false, false, null),
    (_brand_id, 'job', 'Campanha pausada', '#e0a011', 3, false, false, null),
    (_brand_id, 'job', 'Atendimento', '#8b5cf6', 4, false, false, null),
    (_brand_id, 'task', 'A fazer', '#64748b', 0, false, true, 'todo'),
    (_brand_id, 'task', 'Fazendo', '#0ea5e9', 1, false, false, 'in_progress'),
    (_brand_id, 'task', 'Em revisão', '#e0a011', 2, false, false, 'review'),
    (_brand_id, 'task', 'Bloqueada', '#dc2626', 3, false, false, 'blocked'),
    (_brand_id, 'task', 'Concluída', '#16a34a', 4, true, false, 'done')
  ON CONFLICT (brand_id, scope, lower(name)) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.seed_default_work_statuses_for_brand()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.work_statuses (brand_id, scope, name, color, position, is_done, is_default, task_state)
  VALUES
    (NEW.id, 'job', 'Não iniciado', '#64748b', 10, false, false, null),
    (NEW.id, 'job', 'Em andamento', '#0ea5e9', 11, false, false, null),
    (NEW.id, 'job', 'Em revisão', '#e0a011', 12, false, false, null),
    (NEW.id, 'job', 'Bloqueado', '#dc2626', 13, false, false, null),
    (NEW.id, 'job', 'Concluído', '#16a34a', 14, true, false, null),
    (NEW.id, 'job', 'Rotina', '#64748b', 0, false, true, null),
    (NEW.id, 'job', 'Em planejamento/briefing', '#0ea5e9', 1, false, false, null),
    (NEW.id, 'job', 'Campanha ativa', '#16a34a', 2, false, false, null),
    (NEW.id, 'job', 'Campanha pausada', '#e0a011', 3, false, false, null),
    (NEW.id, 'job', 'Atendimento', '#8b5cf6', 4, false, false, null),
    (NEW.id, 'task', 'A fazer', '#64748b', 0, false, true, 'todo'),
    (NEW.id, 'task', 'Fazendo', '#0ea5e9', 1, false, false, 'in_progress'),
    (NEW.id, 'task', 'Em revisão', '#e0a011', 2, false, false, 'review'),
    (NEW.id, 'task', 'Bloqueada', '#dc2626', 3, false, false, 'blocked'),
    (NEW.id, 'task', 'Concluída', '#16a34a', 4, true, false, 'done')
  ON CONFLICT (brand_id, scope, lower(name)) DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.seed_default_work_statuses_for_brand() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seed_default_work_statuses_for_brand() TO service_role;