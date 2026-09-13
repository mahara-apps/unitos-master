CREATE OR REPLACE FUNCTION public.seed_default_work_statuses_for_brand()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.work_statuses (brand_id, scope, name, color, position, is_done, is_default, task_state)
  VALUES
    (NEW.id, 'job', 'Rotina', '#64748b', 0, false, true, null),
    (NEW.id, 'job', 'Em planejamento/briefing', '#0ea5e9', 1, false, false, null),
    (NEW.id, 'job', 'Campanha ativa', '#16a34a', 2, false, false, null),
    (NEW.id, 'job', 'Campanha pausada', '#e0a011', 3, false, false, null),
    (NEW.id, 'job', 'Atendimento', '#8b5cf6', 4, false, false, null),
    (NEW.id, 'job', 'Concluído', '#16a34a', 5, true, false, null),
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

DROP TRIGGER IF EXISTS brands_seed_default_work_statuses ON public.brands;
CREATE TRIGGER brands_seed_default_work_statuses
AFTER INSERT ON public.brands
FOR EACH ROW EXECUTE FUNCTION public.seed_default_work_statuses_for_brand();