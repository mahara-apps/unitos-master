CREATE OR REPLACE FUNCTION public.reorder_job_tasks(p_job_id uuid, p_ordered_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_expected int;
  v_given int;
  v_updated int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  v_given := coalesce(array_length(p_ordered_ids, 1), 0);
  IF v_given <> (SELECT count(DISTINCT x) FROM unnest(p_ordered_ids) x) THEN
    RAISE EXCEPTION 'reorder_duplicate_ids';
  END IF;
  SELECT count(*) INTO v_expected FROM public.tasks WHERE job_id = p_job_id;
  IF v_expected <> v_given OR EXISTS (
    SELECT 1 FROM unnest(p_ordered_ids) x
    WHERE NOT EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = x AND t.job_id = p_job_id)
  ) THEN
    RAISE EXCEPTION 'reorder_set_mismatch';
  END IF;
  UPDATE public.tasks t SET position = o.ord
  FROM unnest(p_ordered_ids) WITH ORDINALITY AS o(id, ord)
  WHERE t.id = o.id AND t.job_id = p_job_id AND t.position IS DISTINCT FROM o.ord;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;
REVOKE ALL ON FUNCTION public.reorder_job_tasks(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reorder_job_tasks(uuid, uuid[]) TO authenticated, service_role;