CREATE TABLE public.system_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  severity text NOT NULL CHECK (severity IN ('info', 'warning', 'error', 'success')),
  category text NOT NULL CHECK (category IN ('email', 'cron', 'webhook', 'ai', 'integration', 'installation', 'system')),
  source text NOT NULL CHECK (length(source) BETWEEN 1 AND 80),
  operation text NOT NULL CHECK (length(operation) BETWEEN 1 AND 120),
  outcome text NOT NULL CHECK (outcome IN ('success', 'warning', 'error', 'skipped')),
  error_code text CHECK (error_code IS NULL OR length(error_code) <= 80),
  message text NOT NULL CHECK (length(message) BETWEEN 1 AND 500),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  correlation_id text CHECK (correlation_id IS NULL OR length(correlation_id) <= 120),
  attempt integer CHECK (attempt IS NULL OR attempt > 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT system_events_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);
GRANT SELECT ON public.system_events TO authenticated;
GRANT ALL ON public.system_events TO service_role;
REVOKE ALL ON public.system_events FROM anon;
ALTER TABLE public.system_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY system_events_owner_admin_read ON public.system_events FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()) OR public.app_access_role(auth.uid(), brand_id) = 'admin');
CREATE INDEX system_events_brand_time_idx ON public.system_events (brand_id, occurred_at DESC);
CREATE INDEX system_events_brand_severity_time_idx ON public.system_events (brand_id, severity, occurred_at DESC);
CREATE INDEX system_events_brand_category_time_idx ON public.system_events (brand_id, category, occurred_at DESC);
CREATE INDEX system_events_client_time_idx ON public.system_events (client_id, occurred_at DESC) WHERE client_id IS NOT NULL;
CREATE INDEX system_events_correlation_idx ON public.system_events (correlation_id) WHERE correlation_id IS NOT NULL;
CREATE OR REPLACE FUNCTION public.system_events_guard_scope() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN IF NEW.client_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.clients c WHERE c.id = NEW.client_id AND c.brand_id = NEW.brand_id) THEN RAISE EXCEPTION 'system_events: cliente fora do workspace'; END IF; RETURN NEW; END; $$;
CREATE TRIGGER system_events_guard_scope_trg BEFORE INSERT ON public.system_events FOR EACH ROW EXECUTE FUNCTION public.system_events_guard_scope();
CREATE OR REPLACE FUNCTION public.purge_system_events_90d() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ DECLARE deleted_count integer; BEGIN DELETE FROM public.system_events WHERE occurred_at < now() - interval '90 days'; GET DIAGNOSTICS deleted_count = ROW_COUNT; RETURN deleted_count; END; $$;
REVOKE ALL ON FUNCTION public.purge_system_events_90d() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_system_events_90d() TO service_role;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN PERFORM cron.unschedule('system-events-retention-90d') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'system-events-retention-90d'); PERFORM cron.schedule('system-events-retention-90d', '35 3 * * *', 'SELECT public.purge_system_events_90d();'); END IF; END; $$;
COMMENT ON TABLE public.system_events IS 'Eventos operacionais sanitizados, append-only para usuários e retidos por 90 dias.';