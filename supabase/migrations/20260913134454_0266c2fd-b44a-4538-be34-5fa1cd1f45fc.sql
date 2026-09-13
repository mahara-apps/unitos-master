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
    (_brand_id, 'job', 'Rotina', '#64748b', 0, false, true, null),
    (_brand_id, 'job', 'Em planejamento/briefing', '#0ea5e9', 1, false, false, null),
    (_brand_id, 'job', 'Campanha ativa', '#16a34a', 2, false, false, null),
    (_brand_id, 'job', 'Campanha pausada', '#e0a011', 3, false, false, null),
    (_brand_id, 'job', 'Atendimento', '#8b5cf6', 4, false, false, null),
    (_brand_id, 'job', 'Concluído', '#16a34a', 5, true, false, null),
    (_brand_id, 'task', 'A fazer', '#64748b', 0, false, true, 'todo'),
    (_brand_id, 'task', 'Fazendo', '#0ea5e9', 1, false, false, 'in_progress'),
    (_brand_id, 'task', 'Em revisão', '#e0a011', 2, false, false, 'review'),
    (_brand_id, 'task', 'Bloqueada', '#dc2626', 3, false, false, 'blocked'),
    (_brand_id, 'task', 'Concluída', '#16a34a', 4, true, false, 'done')
  ON CONFLICT (brand_id, scope, lower(name)) DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION public.ensure_default_work_statuses(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_default_work_statuses(uuid) TO authenticated, service_role;