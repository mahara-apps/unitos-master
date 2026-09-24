CREATE POLICY installation_bootstrap_state_deny_anon
ON public.installation_bootstrap_state
FOR ALL TO anon
USING (false)
WITH CHECK (false);

CREATE POLICY installation_bootstrap_state_deny_authenticated
ON public.installation_bootstrap_state
FOR ALL TO authenticated
USING (false)
WITH CHECK (false);

REVOKE ALL ON FUNCTION public.complete_installation_bootstrap(text,text,text) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.complete_installation_bootstrap_service(
  _user_id uuid,
  _secret text,
  _full_name text,
  _workspace_name text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_state public.installation_bootstrap_state%ROWTYPE;
  v_workspace_id uuid;
  v_workspace_name text := nullif(btrim(_workspace_name), '');
  v_slug text;
BEGIN
  IF current_user NOT IN ('postgres', 'service_role') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _user_id IS NULL OR nullif(btrim(_secret), '') IS NULL
     OR nullif(btrim(_full_name), '') IS NULL OR v_workspace_name IS NULL THEN
    RAISE EXCEPTION 'invalid_bootstrap_input';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('unitos:installation-bootstrap', 0));
  SELECT * INTO v_state
  FROM public.installation_bootstrap_state
  WHERE singleton IS TRUE
  FOR UPDATE;

  IF NOT FOUND OR v_state.consumed_at IS NOT NULL OR v_state.expires_at <= now() THEN
    RAISE EXCEPTION 'bootstrap_unavailable';
  END IF;
  IF encode(digest(_secret, 'sha256'), 'hex') <> v_state.secret_hash THEN
    RAISE EXCEPTION 'bootstrap_invalid';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.user_profiles p
    WHERE coalesce(p.is_super_admin, false) OR p.role = 'super_admin'
  ) OR EXISTS (SELECT 1 FROM public.brands) THEN
    RAISE EXCEPTION 'installation_already_initialized';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = _user_id) THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  UPDATE public.user_profiles
  SET full_name = left(btrim(_full_name), 120),
      role = 'super_admin',
      is_super_admin = true,
      requires_password_change = false,
      updated_at = now()
  WHERE id = _user_id;

  v_slug := regexp_replace(lower(v_workspace_name), '[^a-z0-9]+', '-', 'g');
  v_slug := coalesce(nullif(trim(both '-' from v_slug), ''), 'workspace') || '-' || substr(_user_id::text, 1, 8);
  INSERT INTO public.brands(name, slug, created_by)
  VALUES (left(v_workspace_name, 80), v_slug, _user_id)
  RETURNING id INTO v_workspace_id;

  INSERT INTO public.brand_members(brand_id, user_id, role)
  VALUES (v_workspace_id, _user_id, 'admin'::public.app_role)
  ON CONFLICT (brand_id, user_id) DO NOTHING;

  UPDATE public.installation_bootstrap_state
  SET consumed_at = now(), consumed_by = _user_id, updated_at = now()
  WHERE singleton IS TRUE AND consumed_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'bootstrap_already_consumed';
  END IF;

  RETURN v_workspace_id;
END;
$$;
REVOKE ALL ON FUNCTION public.complete_installation_bootstrap_service(uuid,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_installation_bootstrap_service(uuid,text,text,text) TO service_role;

DO $$
BEGIN
  IF has_function_privilege('authenticated', 'public.complete_installation_bootstrap(text,text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.complete_installation_bootstrap_service(uuid,text,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'bootstrap privilegiado ainda está exposto diretamente ao usuário';
  END IF;
END;
$$;