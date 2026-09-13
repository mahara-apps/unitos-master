-- lovable-cron-fallback-reviewed: 1440 runs/day; executor único de operações em fatias curtas, com atraso máximo de 60 segundos e sem dependência da interface aberta
DROP INDEX IF EXISTS public.installation_operations_one_active;
CREATE UNIQUE INDEX installation_operations_one_active
  ON public.installation_operations (installation_id)
  WHERE status IN ('pending', 'running', 'retryable');

CREATE OR REPLACE FUNCTION public.start_installation_operation(
  _actor_id uuid,
  _installation_id uuid,
  _kind text,
  _summary text,
  _steps jsonb,
  _run_token_hash text DEFAULT NULL,
  _run_token_expires_at timestamptz DEFAULT NULL
)
RETURNS public.installation_operations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _installation public.installations%ROWTYPE;
  _operation public.installation_operations%ROWTYPE;
  _target_status text;
BEGIN
  IF NOT public.is_super_admin(_actor_id) THEN
    RAISE EXCEPTION 'Apenas Super Admin pode iniciar operações de instalação' USING ERRCODE = '42501';
  END IF;
  IF _kind NOT IN ('provision', 'update', 'validate') THEN
    RAISE EXCEPTION 'Tipo de operação inválido' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO _installation FROM public.installations WHERE id = _installation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Instalação não encontrada' USING ERRCODE = 'P0002';
  END IF;
  IF _installation.active_operation_id IS NOT NULL OR EXISTS (
    SELECT 1 FROM public.installation_operations
    WHERE installation_id = _installation_id
      AND status IN ('pending', 'running', 'retryable')
  ) THEN
    RAISE EXCEPTION 'Já existe uma operação pendente ou em andamento nesta instalação' USING ERRCODE = '55P03';
  END IF;
  INSERT INTO public.installation_operations (
    installation_id, kind, status, summary, steps,
    run_token_hash, run_token_expires_at, started_at, last_report_at
  ) VALUES (
    _installation_id, _kind, 'pending', _summary, _steps,
    _run_token_hash, _run_token_expires_at, now(), now()
  ) RETURNING * INTO _operation;
  _target_status := CASE _kind WHEN 'provision' THEN 'provisioning' WHEN 'update' THEN 'updating' ELSE 'validating' END;
  UPDATE public.installations
  SET status = _target_status, active_operation_id = _operation.id, last_error = NULL, updated_at = now()
  WHERE id = _installation_id;
  RETURN _operation;
END;
$$;

REVOKE ALL ON FUNCTION public.start_installation_operation(uuid, uuid, text, text, jsonb, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_installation_operation(uuid, uuid, text, text, jsonb, text, timestamptz) TO service_role;

DO $$
DECLARE v_app_url text;
BEGIN
  SELECT rtrim(app_url, '/') INTO v_app_url FROM public.installation LIMIT 1;
  IF v_app_url IS NULL THEN RETURN; END IF;
  IF v_app_url !~ '^https://[a-zA-Z0-9._-]+(:[0-9]+)?$' THEN
    RAISE EXCEPTION 'installation.app_url inválida para installation-provision-resume (%)', v_app_url;
  END IF;
  PERFORM cron.unschedule('installation-provision-resume')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'installation-provision-resume');
  PERFORM cron.schedule(
    'installation-provision-resume',
    '* * * * *',
    format($fmt$select net.http_post(
      url := %L,
      headers := jsonb_build_object('Content-Type','application/json','x-cron-secret', public.cron_secret()),
      body := '{}'::jsonb
    );$fmt$, v_app_url || '/api/public/cron/installation-resume')
  );
END $$;