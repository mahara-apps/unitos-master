-- =============================================================================
-- Convergência idempotente do Control-plane do MASTER.
-- Fora do pacote Client. Aplicar após 20260913205310 e antes de 20260913230055
-- em uma reconstrução limpa do MASTER.
--
-- installation_operation_effects e installation_migration_ledger não são
-- materializadas: não possuem consumidor atual e exigem decisão arquitetural.
-- =============================================================================

ALTER TABLE public.installation_operations
  ADD COLUMN IF NOT EXISTS workflow_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS baseline_id text,
  ADD COLUMN IF NOT EXISTS baseline_hash text,
  ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz,
  ADD COLUMN IF NOT EXISTS blocked_reason text,
  ADD COLUMN IF NOT EXISTS reconciled_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_command text;

CREATE TABLE IF NOT EXISTS public.installation_operation_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL REFERENCES public.installation_operations(id) ON DELETE CASCADE,
  step_key text NOT NULL,
  position integer NOT NULL,
  label text NOT NULL,
  state text NOT NULL DEFAULT 'pending',
  progress integer NOT NULL DEFAULT 0,
  detail text,
  input_fingerprint text,
  started_at timestamptz,
  finished_at timestamptz,
  last_error_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operation_id, step_key),
  UNIQUE (operation_id, position)
);
REVOKE ALL ON public.installation_operation_steps FROM PUBLIC, anon;
GRANT SELECT ON public.installation_operation_steps TO authenticated;
GRANT ALL ON public.installation_operation_steps TO service_role;
ALTER TABLE public.installation_operation_steps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS installation_operation_steps_super_admin_read ON public.installation_operation_steps;
CREATE POLICY installation_operation_steps_super_admin_read
  ON public.installation_operation_steps FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));
CREATE INDEX IF NOT EXISTS installation_operation_steps_state_idx
  ON public.installation_operation_steps(operation_id, state, position);
DROP TRIGGER IF EXISTS installation_operation_steps_touch_updated_at ON public.installation_operation_steps;
CREATE TRIGGER installation_operation_steps_touch_updated_at
  BEFORE UPDATE ON public.installation_operation_steps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.installation_operation_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL REFERENCES public.installation_operations(id) ON DELETE CASCADE,
  command text NOT NULL,
  deduplication_key text NOT NULL UNIQUE,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  available_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  delivered_at timestamptz,
  delivery_attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.installation_operation_outbox FROM PUBLIC, anon;
GRANT SELECT ON public.installation_operation_outbox TO authenticated;
GRANT ALL ON public.installation_operation_outbox TO service_role;
ALTER TABLE public.installation_operation_outbox ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS installation_operation_outbox_super_admin_read ON public.installation_operation_outbox;
CREATE POLICY installation_operation_outbox_super_admin_read
  ON public.installation_operation_outbox FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));
CREATE INDEX IF NOT EXISTS installation_operation_outbox_ready_idx
  ON public.installation_operation_outbox(available_at, created_at)
  WHERE status IN ('pending', 'retryable');
DROP TRIGGER IF EXISTS installation_operation_outbox_touch_updated_at ON public.installation_operation_outbox;
CREATE TRIGGER installation_operation_outbox_touch_updated_at
  BEFORE UPDATE ON public.installation_operation_outbox
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.cancel_legacy_installation_outbox()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
BEGIN
  IF NEW.status IN ('pending', 'claimed', 'retryable') THEN
    NEW.status := 'cancelled';
    NEW.last_error := coalesce(NEW.last_error, 'Fila legada desativada; use o registro canônico da operação.');
  END IF;
  RETURN NEW;
END
$fn$;
REVOKE ALL ON FUNCTION public.cancel_legacy_installation_outbox() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_legacy_installation_outbox() TO service_role;
DROP TRIGGER IF EXISTS installation_operation_outbox_disable_legacy ON public.installation_operation_outbox;
CREATE TRIGGER installation_operation_outbox_disable_legacy
  BEFORE INSERT OR UPDATE OF status ON public.installation_operation_outbox
  FOR EACH ROW EXECUTE FUNCTION public.cancel_legacy_installation_outbox();

CREATE INDEX IF NOT EXISTS installation_operations_reconcile_idx
  ON public.installation_operations(lease_expires_at, heartbeat_at, next_attempt_at)
  WHERE status IN ('pending', 'running', 'retryable');
