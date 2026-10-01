ALTER TABLE public.ai_model_health
  ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES public.brands(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS ai_model_health_brand_provider_checked_idx
  ON public.ai_model_health (brand_id, provider, checked_at DESC);

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS ai_run_id uuid;

CREATE INDEX IF NOT EXISTS posts_ai_phase_run_idx
  ON public.posts (ai_phase, ai_phase_at)
  WHERE deleted_at IS NULL AND ai_phase = 'copy_running';

CREATE OR REPLACE FUNCTION public.post_copy_queue_has_work()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.posts p
    WHERE p.deleted_at IS NULL
      AND coalesce(p.copy, '') = ''
      AND coalesce(p.ai_phase, 'idea') IN (
        'idea', 'copy_failed', 'copy_failed_retryable', 'copy_running'
      )
  );
$$;

REVOKE ALL ON FUNCTION public.post_copy_queue_has_work() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_copy_queue_has_work() TO service_role;

CREATE OR REPLACE FUNCTION public.post_copy_queue_drain_off()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.post_copy_queue_has_work() THEN
    PERFORM public.post_copy_queue_drain_on();
    RETURN false;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'post-content-drain') THEN
    PERFORM cron.unschedule('post-content-drain');
  END IF;
  UPDATE public.post_copy_queue_state SET drain_scheduled = false WHERE id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.post_copy_queue_drain_off() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_copy_queue_drain_off() TO service_role;

CREATE OR REPLACE FUNCTION public.post_copy_queue_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text;
  v_fresh boolean;
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN RETURN NEW; END IF;
  IF coalesce(NEW.copy, '') <> '' THEN RETURN NEW; END IF;
  IF coalesce(NEW.ai_phase, 'idea') NOT IN (
    'idea', 'copy_failed', 'copy_failed_retryable', 'copy_running'
  ) THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND coalesce(OLD.ai_phase, 'idea') = coalesce(NEW.ai_phase, 'idea')
     AND coalesce(OLD.copy, '') = coalesce(NEW.copy, '') THEN
    RETURN NEW;
  END IF;

  UPDATE public.post_copy_queue_state
     SET last_notified_at = now()
   WHERE id
     AND (last_notified_at IS NULL OR last_notified_at < now() - interval '20 seconds')
  RETURNING true INTO v_fresh;

  PERFORM public.post_copy_queue_drain_on();

  IF NOT coalesce(v_fresh, false) THEN RETURN NEW; END IF;

  SELECT rtrim(app_url, '/') INTO v_url FROM public.installation LIMIT 1;
  IF v_url IS NULL OR public.cron_secret() IS NULL THEN RETURN NEW; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN RETURN NEW; END IF;

  PERFORM net.http_post(
    url := v_url || '/api/public/hooks/resume-post-content',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', public.cron_secret()
    ),
    body := '{}'::jsonb
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.post_copy_queue_notify() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_copy_queue_notify() TO service_role;