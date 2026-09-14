-- lovable-cron-fallback-reviewed: 1440 runs/day; reconciliação temporária necessária para retomar operações em até cerca de um minuto enquanto o despertar por fila não substitui o polling
CREATE OR REPLACE FUNCTION public.defer_installation_operation(
  _operation_id uuid,
  _owner text,
  _fencing_token bigint,
  _delay_seconds integer,
  _error_kind text,
  _summary text,
  _error_detail jsonb DEFAULT '{}'::jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _saved boolean;
BEGIN
  IF _delay_seconds < 5 OR _delay_seconds > 900 THEN
    RAISE EXCEPTION 'Atraso de reagendamento inválido' USING ERRCODE = '22023';
  END IF;

  WITH changed AS (
    UPDATE public.installation_operations
    SET status = 'pending',
        next_attempt_at = now() + make_interval(secs => _delay_seconds),
        lease_owner = NULL,
        lease_expires_at = NULL,
        error_kind = _error_kind,
        blocked_reason = NULL,
        summary = _summary,
        error_detail = coalesce(error_detail, '{}'::jsonb) || coalesce(_error_detail, '{}'::jsonb),
        last_report_at = now(),
        finished_at = NULL,
        next_command = 'execute'
    WHERE id = _operation_id
      AND status = 'running'
      AND lease_owner = _owner
      AND fencing_token = _fencing_token
    RETURNING id, attempt_count, fencing_token, next_attempt_at
  ), closed_attempt AS (
    UPDATE public.installation_operation_attempts a
    SET status = 'deferred',
        error_kind = _error_kind,
        error_message = _summary,
        retryable = true,
        finished_at = now(),
        heartbeat_at = now()
    FROM changed c
    WHERE a.operation_id = c.id
      AND a.fencing_token = c.fencing_token
      AND a.status = 'running'
  ), queued AS (
    INSERT INTO public.installation_operation_outbox(
      operation_id, command, deduplication_key, payload, status, available_at
    )
    SELECT id,
           'execute',
           id::text || ':defer:' || fencing_token::text,
           jsonb_build_object(
             'operationId', id,
             'failureCount', attempt_count,
             'fencingToken', fencing_token,
             'source', 'master'
           ),
           'pending',
           next_attempt_at
    FROM changed
    ON CONFLICT(deduplication_key) DO UPDATE
      SET status = 'pending', available_at = EXCLUDED.available_at, last_error = NULL
  )
  SELECT EXISTS(SELECT 1 FROM changed) INTO _saved;

  RETURN _saved;
END
$$;

REVOKE ALL ON FUNCTION public.defer_installation_operation(uuid,text,bigint,integer,text,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.defer_installation_operation(uuid,text,bigint,integer,text,text,jsonb) TO service_role;

DO $$
DECLARE
  v_app_url text;
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
      headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',public.cron_secret()),
      body := jsonb_build_object('job','installation-provision-resume','scheduledAt',now()),
      timeout_milliseconds := 60000
    ) from (select pg_sleep(7)) stagger;$fmt$, v_app_url || '/api/public/cron/installation-resume')
  );
END
$$;