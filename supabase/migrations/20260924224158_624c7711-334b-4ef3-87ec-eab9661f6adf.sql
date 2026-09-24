CREATE TABLE public.installation_bootstrap_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  secret_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  consumed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.installation_bootstrap_state TO service_role;
ALTER TABLE public.installation_bootstrap_state ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.installation_bootstrap_state FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.installation_setup_state()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'needs_super_admin', NOT EXISTS (
      SELECT 1 FROM public.user_profiles p
      WHERE coalesce(p.is_super_admin, false) OR p.role = 'super_admin'
    ),
    'has_super_admin', EXISTS (
      SELECT 1 FROM public.user_profiles p
      WHERE coalesce(p.is_super_admin, false) OR p.role = 'super_admin'
    ),
    'has_workspace', EXISTS (SELECT 1 FROM public.brands),
    'bootstrap_available', EXISTS (
      SELECT 1 FROM public.installation_bootstrap_state s
      WHERE s.singleton IS TRUE
        AND s.consumed_at IS NULL
        AND s.expires_at > now()
    )
  );
$$;
REVOKE ALL ON FUNCTION public.installation_setup_state() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.installation_setup_state() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.prepare_installation_bootstrap(_secret_hash text, _expires_at timestamptz)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_user NOT IN ('postgres', 'service_role') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF nullif(btrim(_secret_hash), '') IS NULL OR _expires_at <= now() THEN
    RAISE EXCEPTION 'invalid_bootstrap_contract';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.user_profiles p
    WHERE coalesce(p.is_super_admin, false) OR p.role = 'super_admin'
  ) OR EXISTS (SELECT 1 FROM public.brands) THEN
    RAISE EXCEPTION 'installation_already_initialized';
  END IF;

  INSERT INTO public.installation_bootstrap_state(singleton, secret_hash, expires_at, consumed_at, consumed_by, updated_at)
  VALUES (true, lower(btrim(_secret_hash)), _expires_at, NULL, NULL, now())
  ON CONFLICT (singleton) DO UPDATE
    SET secret_hash = EXCLUDED.secret_hash,
        expires_at = EXCLUDED.expires_at,
        consumed_at = NULL,
        consumed_by = NULL,
        updated_at = now();
END;
$$;
REVOKE ALL ON FUNCTION public.prepare_installation_bootstrap(text,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_installation_bootstrap(text,timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.complete_installation_bootstrap(
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
  v_user_id uuid := auth.uid();
  v_state public.installation_bootstrap_state%ROWTYPE;
  v_workspace_id uuid;
  v_workspace_name text := nullif(btrim(_workspace_name), '');
  v_slug text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF nullif(btrim(_secret), '') IS NULL OR nullif(btrim(_full_name), '') IS NULL OR v_workspace_name IS NULL THEN
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

  UPDATE public.user_profiles
  SET full_name = left(btrim(_full_name), 120),
      email = coalesce(email, auth.jwt() ->> 'email'),
      role = 'super_admin',
      is_super_admin = true,
      requires_password_change = false,
      updated_at = now()
  WHERE id = v_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  v_slug := regexp_replace(lower(v_workspace_name), '[^a-z0-9]+', '-', 'g');
  v_slug := coalesce(nullif(trim(both '-' from v_slug), ''), 'workspace') || '-' || substr(v_user_id::text, 1, 8);
  INSERT INTO public.brands(name, slug, created_by)
  VALUES (left(v_workspace_name, 80), v_slug, v_user_id)
  RETURNING id INTO v_workspace_id;

  INSERT INTO public.brand_members(brand_id, user_id, role)
  VALUES (v_workspace_id, v_user_id, 'admin'::public.app_role)
  ON CONFLICT (brand_id, user_id) DO NOTHING;

  UPDATE public.installation_bootstrap_state
  SET consumed_at = now(), consumed_by = v_user_id, updated_at = now()
  WHERE singleton IS TRUE AND consumed_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'bootstrap_already_consumed';
  END IF;

  RETURN v_workspace_id;
END;
$$;
REVOKE ALL ON FUNCTION public.complete_installation_bootstrap(text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_installation_bootstrap(text,text,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_full_name text;
BEGIN
  v_full_name := coalesce(
    nullif(trim(coalesce(NEW.raw_user_meta_data->>'full_name', '')), ''),
    nullif(trim(split_part(coalesce(NEW.email, ''), '@', 1)), ''),
    'Usuário'
  );

  INSERT INTO public.user_profiles(id, full_name, email, role, is_super_admin, requires_password_change)
  VALUES (NEW.id, v_full_name, NEW.email, 'user', false, false)
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

DO $$
BEGIN
  IF to_regclass('public.installation_bootstrap_state') IS NULL
     OR to_regprocedure('public.prepare_installation_bootstrap(text,timestamp with time zone)') IS NULL
     OR to_regprocedure('public.complete_installation_bootstrap(text,text,text)') IS NULL THEN
    RAISE EXCEPTION 'bootstrap seguro não foi instalado integralmente';
  END IF;
  IF (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = 'public.handle_new_user()'::regprocedure) IS DISTINCT FROM true
     OR (SELECT p.prosrc FROM pg_proc p WHERE p.oid = 'public.handle_new_user()'::regprocedure) LIKE '%brand_members%' THEN
    RAISE EXCEPTION 'handle_new_user ainda concede acesso automaticamente';
  END IF;
END;
$$;