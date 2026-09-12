-- lovable-cron-fallback-reviewed: 1440 runs/day; continuação de provisionamentos em fatias curtas, com atraso máximo de 60 segundos, sem criar endpoint público desprotegido
DO $$
DECLARE
  v_app_url text;
BEGIN
  IF to_regclass('public.installations') IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.installations LIMIT 1) THEN
    RETURN;
  END IF;

  SELECT rtrim(app_url, '/') INTO v_app_url FROM public.installation LIMIT 1;
  IF v_app_url IS NULL THEN
    SELECT substring(command FROM 'https://[^/''[:space:]]+')
      INTO v_app_url
      FROM cron.job
      WHERE jobname = 'installation-provision-resume'
      LIMIT 1;
  END IF;
  IF v_app_url IS NULL OR v_app_url !~ '^https://[a-zA-Z0-9._-]+(:[0-9]+)?$' THEN
    RAISE EXCEPTION 'installation.app_url inválida para installation-provision-resume (%)', v_app_url;
  END IF;

  UPDATE public.installation
     SET app_url = v_app_url, updated_at = now()
   WHERE app_url IS NULL;

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