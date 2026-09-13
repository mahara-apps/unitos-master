-- start_job_timer também registra activity_events, uma tabela deliberadamente
-- sem política de escrita para usuários. SECURITY DEFINER é necessário para que
-- a auditoria seja atômica com o início do timer. A função valida autenticação,
-- vínculo job/marca e acesso ao projeto antes de qualquer escrita.
ALTER FUNCTION public.start_job_timer(uuid, uuid) SECURITY DEFINER;
REVOKE ALL ON FUNCTION public.start_job_timer(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_job_timer(uuid, uuid) TO authenticated, service_role;

CREATE INDEX IF NOT EXISTS work_statuses_brand_task_state_idx
  ON public.work_statuses (brand_id, task_state)
  WHERE task_state IS NOT NULL;