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
    (_brand_id, 'project', 'Rascunho', '#64748b', 0, false, true, null),
    (_brand_id, 'project', 'Em planejamento', '#0ea5e9', 1, false, false, null),
    (_brand_id, 'project', 'Ativa', '#16a34a', 2, false, false, null),
    (_brand_id, 'project', 'Pausada', '#e0a011', 3, false, false, null),
    (_brand_id, 'project', 'Aguardando cliente', '#8b5cf6', 4, false, false, null),
    (_brand_id, 'project', 'Concluído', '#16a34a', 5, true, false, null),
    (_brand_id, 'job', 'Não iniciado', '#64748b', 0, false, true, null),
    (_brand_id, 'job', 'Em andamento', '#0ea5e9', 1, false, false, null),
    (_brand_id, 'job', 'Em revisão', '#e0a011', 2, false, false, null),
    (_brand_id, 'job', 'Bloqueado', '#dc2626', 3, false, false, null),
    (_brand_id, 'job', 'Concluído', '#16a34a', 4, true, false, null),
    (_brand_id, 'task', 'A fazer', '#64748b', 0, false, true, 'todo'),
    (_brand_id, 'task', 'Fazendo', '#0ea5e9', 1, false, false, 'in_progress'),
    (_brand_id, 'task', 'Em revisão', '#e0a011', 2, false, false, 'review'),
    (_brand_id, 'task', 'Bloqueada', '#dc2626', 3, false, false, 'blocked'),
    (_brand_id, 'task', 'Concluída', '#16a34a', 4, true, false, 'done')
  ON CONFLICT (brand_id, scope, lower(name)) DO UPDATE
  SET color = EXCLUDED.color,
      position = EXCLUDED.position,
      is_done = EXCLUDED.is_done,
      is_default = EXCLUDED.is_default,
      task_state = EXCLUDED.task_state;
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
    (NEW.id, 'project', 'Rascunho', '#64748b', 0, false, true, null),
    (NEW.id, 'project', 'Em planejamento', '#0ea5e9', 1, false, false, null),
    (NEW.id, 'project', 'Ativa', '#16a34a', 2, false, false, null),
    (NEW.id, 'project', 'Pausada', '#e0a011', 3, false, false, null),
    (NEW.id, 'project', 'Aguardando cliente', '#8b5cf6', 4, false, false, null),
    (NEW.id, 'project', 'Concluído', '#16a34a', 5, true, false, null),
    (NEW.id, 'job', 'Não iniciado', '#64748b', 0, false, true, null),
    (NEW.id, 'job', 'Em andamento', '#0ea5e9', 1, false, false, null),
    (NEW.id, 'job', 'Em revisão', '#e0a011', 2, false, false, null),
    (NEW.id, 'job', 'Bloqueado', '#dc2626', 3, false, false, null),
    (NEW.id, 'job', 'Concluído', '#16a34a', 4, true, false, null),
    (NEW.id, 'task', 'A fazer', '#64748b', 0, false, true, 'todo'),
    (NEW.id, 'task', 'Fazendo', '#0ea5e9', 1, false, false, 'in_progress'),
    (NEW.id, 'task', 'Em revisão', '#e0a011', 2, false, false, 'review'),
    (NEW.id, 'task', 'Bloqueada', '#dc2626', 3, false, false, 'blocked'),
    (NEW.id, 'task', 'Concluída', '#16a34a', 4, true, false, 'done')
  ON CONFLICT (brand_id, scope, lower(name)) DO NOTHING;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  brand record;
  source_status record;
  target_id uuid;
  target_name text;
BEGIN
  FOR brand IN SELECT id FROM public.brands LOOP
    INSERT INTO public.work_statuses (brand_id, scope, name, color, position, is_done, is_default, task_state)
    VALUES
      (brand.id, 'job', 'Não iniciado', '#64748b', 0, false, true, null),
      (brand.id, 'job', 'Em andamento', '#0ea5e9', 1, false, false, null),
      (brand.id, 'job', 'Em revisão', '#e0a011', 2, false, false, null),
      (brand.id, 'job', 'Bloqueado', '#dc2626', 3, false, false, null),
      (brand.id, 'job', 'Concluído', '#16a34a', 4, true, false, null)
    ON CONFLICT (brand_id, scope, lower(name)) DO UPDATE
    SET color = EXCLUDED.color,
        position = EXCLUDED.position,
        is_done = EXCLUDED.is_done,
        is_default = EXCLUDED.is_default;

    FOR source_status IN
      SELECT id, name
      FROM public.work_statuses
      WHERE brand_id = brand.id
        AND scope = 'job'
        AND lower(name) IN ('rotina', 'em planejamento/briefing', 'campanha ativa', 'campanha pausada', 'atendimento')
    LOOP
      target_name := CASE lower(source_status.name)
        WHEN 'rotina' THEN 'Não iniciado'
        WHEN 'campanha pausada' THEN 'Bloqueado'
        ELSE 'Em andamento'
      END;

      SELECT id INTO target_id
      FROM public.work_statuses
      WHERE brand_id = brand.id AND scope = 'job' AND lower(name) = lower(target_name)
      LIMIT 1;

      UPDATE public.project_jobs SET status_id = target_id WHERE status_id = source_status.id;
      DELETE FROM public.work_statuses WHERE id = source_status.id;
    END LOOP;
  END LOOP;
END;
$$;