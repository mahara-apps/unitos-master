CREATE OR REPLACE FUNCTION public.guard_client_policy_authority()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _brand uuid;
  _role text;
BEGIN
  IF NEW.approval_policy IS DISTINCT FROM OLD.approval_policy
     OR NEW.scope_policy IS DISTINCT FROM OLD.scope_policy THEN
    IF auth.uid() IS NULL THEN
      RETURN NEW;
    END IF;
    -- brands não tem brand_id: ler via jsonb evita erro 42703 ao resolver o campo.
    IF TG_TABLE_NAME = 'brands' THEN
      _brand := NEW.id;
    ELSE
      _brand := (to_jsonb(NEW)->>'brand_id')::uuid;
    END IF;
    _role := public.app_access_role(auth.uid(), _brand);
    IF _role IS NULL OR _role NOT IN ('super_admin', 'admin') THEN
      RAISE EXCEPTION 'client_policy_forbidden';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_client_policy_authority() FROM PUBLIC, anon, authenticated;