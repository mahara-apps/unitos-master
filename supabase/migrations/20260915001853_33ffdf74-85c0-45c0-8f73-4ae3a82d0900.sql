CREATE OR REPLACE FUNCTION public.cancel_legacy_installation_outbox()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('pending', 'claimed', 'retryable') THEN
    NEW.status := 'cancelled';
    NEW.last_error := coalesce(NEW.last_error, 'Fila legada desativada; use o registro canônico da operação.');
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS installation_operation_outbox_disable_legacy ON public.installation_operation_outbox;
CREATE TRIGGER installation_operation_outbox_disable_legacy
BEFORE INSERT OR UPDATE OF status ON public.installation_operation_outbox
FOR EACH ROW
EXECUTE FUNCTION public.cancel_legacy_installation_outbox();

REVOKE ALL ON FUNCTION public.cancel_legacy_installation_outbox() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_legacy_installation_outbox() TO service_role;