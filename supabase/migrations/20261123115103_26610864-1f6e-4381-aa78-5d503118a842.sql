CREATE TABLE IF NOT EXISTS public.client_access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  task_id uuid NULL,
  requested_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  resolved_by uuid NULL,
  resolved_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS client_access_requests_pending_uq
  ON public.client_access_requests (client_id, user_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS client_access_requests_brand_idx ON public.client_access_requests (brand_id, status);

REVOKE ALL ON public.client_access_requests FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.client_access_requests FROM authenticated;
GRANT SELECT ON public.client_access_requests TO authenticated;
GRANT ALL ON public.client_access_requests TO service_role;
ALTER TABLE public.client_access_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "client_access_requests_read" ON public.client_access_requests;
CREATE POLICY "client_access_requests_read" ON public.client_access_requests
  FOR SELECT TO authenticated
  USING (
    requested_by = auth.uid() OR user_id = auth.uid()
    OR public.app_access_role(auth.uid(), brand_id) IN ('super_admin','admin')
    OR (public.app_access_role(auth.uid(), brand_id) = 'manager' AND public.can_access_client(client_id, auth.uid()))
  );

DROP TRIGGER IF EXISTS client_access_requests_touch ON public.client_access_requests;
CREATE OR REPLACE FUNCTION public.client_access_requests_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
CREATE TRIGGER client_access_requests_touch BEFORE UPDATE ON public.client_access_requests
  FOR EACH ROW EXECUTE FUNCTION public.client_access_requests_touch();

-- Quem pode liberar: Super Admin/Owner/Admin para qualquer membro interno;
-- Manager somente para User e somente em clientes que ele acessa.
CREATE OR REPLACE FUNCTION public.can_grant_client_access(_client_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_brand uuid; v_actor text; v_target text;
BEGIN
  IF auth.uid() IS NULL OR _client_id IS NULL OR _user_id IS NULL THEN RETURN false; END IF;
  SELECT brand_id INTO v_brand FROM public.clients WHERE id = _client_id;
  IF v_brand IS NULL THEN RETURN false; END IF;
  v_actor := public.app_access_role(auth.uid(), v_brand);
  v_target := public.app_access_role(_user_id, v_brand);
  IF v_target IS NULL OR v_target IN ('client','super_admin') THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.brand_members WHERE brand_id = v_brand AND user_id = _user_id AND is_active) THEN
    RETURN false;
  END IF;
  IF v_actor IN ('super_admin','admin') THEN RETURN true; END IF;
  IF v_actor = 'manager' AND v_target = 'user' AND public.can_access_client(_client_id, auth.uid()) THEN RETURN true; END IF;
  RETURN false;
END $$;

CREATE OR REPLACE FUNCTION public.grant_client_access(_client_id uuid, _user_id uuid, _task_id uuid DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_brand uuid; v_role text;
BEGIN
  IF NOT public.can_grant_client_access(_client_id, _user_id) THEN
    RAISE EXCEPTION 'Você não pode liberar o acesso desta pessoa a este cliente.' USING ERRCODE = '42501';
  END IF;
  SELECT brand_id INTO v_brand FROM public.clients WHERE id = _client_id;
  SELECT role INTO v_role FROM public.brand_members WHERE brand_id = v_brand AND user_id = _user_id AND is_active LIMIT 1;
  INSERT INTO public.client_members (brand_id, client_id, user_id, role, created_by)
  VALUES (v_brand, _client_id, _user_id, COALESCE(v_role, 'user'), auth.uid())
  ON CONFLICT (client_id, user_id) DO NOTHING;
  -- resolve pedido pendente ou registra liberação direta (trilha de auditoria)
  UPDATE public.client_access_requests SET status = 'approved', resolved_by = auth.uid(), resolved_at = now()
   WHERE client_id = _client_id AND user_id = _user_id AND status = 'pending';
  IF NOT FOUND THEN
    INSERT INTO public.client_access_requests (brand_id, client_id, user_id, task_id, requested_by, status, resolved_by, resolved_at)
    VALUES (v_brand, _client_id, _user_id, _task_id, auth.uid(), 'granted', auth.uid(), now());
  END IF;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.request_client_access(_client_id uuid, _user_id uuid, _task_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_brand uuid; v_id uuid; v_client text; v_name text; v_req text;
BEGIN
  SELECT brand_id, name INTO v_brand, v_client FROM public.clients WHERE id = _client_id;
  IF v_brand IS NULL OR auth.uid() IS NULL
     OR public.app_access_role(auth.uid(), v_brand) NOT IN ('super_admin','admin','manager','user')
     OR NOT public.can_access_client(_client_id, auth.uid()) THEN
    RAISE EXCEPTION 'Você não tem acesso a este cliente.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.brand_members WHERE brand_id = v_brand AND user_id = _user_id AND is_active) THEN
    RAISE EXCEPTION 'Escolha um membro deste workspace.' USING ERRCODE = '22023';
  END IF;
  IF _task_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.tasks WHERE id = _task_id AND client_id = _client_id) THEN
    _task_id := NULL;
  END IF;
  SELECT id INTO v_id FROM public.client_access_requests WHERE client_id = _client_id AND user_id = _user_id AND status = 'pending';
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  INSERT INTO public.client_access_requests (brand_id, client_id, user_id, task_id, requested_by)
  VALUES (v_brand, _client_id, _user_id, _task_id, auth.uid()) RETURNING id INTO v_id;
  SELECT COALESCE(full_name, email) INTO v_name FROM public.user_profiles WHERE id = _user_id;
  SELECT COALESCE(full_name, email) INTO v_req FROM public.user_profiles WHERE id = auth.uid();
  INSERT INTO public.notifications (user_id, brand_id, kind, title, body, href, payload, dedupe_key)
  SELECT bm.user_id, v_brand, 'system',
         'Pedido de acesso a cliente',
         COALESCE(v_req,'Alguém') || ' pediu acesso de ' || COALESCE(v_name,'uma pessoa') || ' ao cliente ' || COALESCE(v_client,''),
         '/customers/' || _client_id || '?tab=trabalho',
         jsonb_build_object('client_access_request_id', v_id),
         'client_access_request:' || v_id || ':' || bm.user_id
    FROM public.brand_members bm
   WHERE bm.brand_id = v_brand AND bm.is_active AND bm.user_id <> auth.uid()
     AND (bm.role IN ('owner','admin')
          OR (bm.role = 'manager' AND public.can_access_client(_client_id, bm.user_id)
              AND public.app_access_role(_user_id, v_brand) = 'user'))
  ON CONFLICT DO NOTHING;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.resolve_client_access_request(_request_id uuid, _approve boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.client_access_requests%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.client_access_requests WHERE id = _request_id FOR UPDATE;
  IF r.id IS NULL OR r.status <> 'pending' THEN RETURN false; END IF;
  IF NOT public.can_grant_client_access(r.client_id, r.user_id) THEN
    RAISE EXCEPTION 'Você não pode decidir este pedido.' USING ERRCODE = '42501';
  END IF;
  IF NOT _approve THEN
    UPDATE public.client_access_requests SET status = 'rejected', resolved_by = auth.uid(), resolved_at = now() WHERE id = r.id;
    RETURN true;
  END IF;
  PERFORM public.grant_client_access(r.client_id, r.user_id, r.task_id);
  IF r.task_id IS NOT NULL THEN
    UPDATE public.tasks SET assignee_id = r.user_id WHERE id = r.task_id AND assignee_id IS NULL;
  END IF;
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.can_grant_client_access(uuid,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.grant_client_access(uuid,uuid,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.request_client_access(uuid,uuid,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resolve_client_access_request(uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_grant_client_access(uuid,uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.grant_client_access(uuid,uuid,uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.request_client_access(uuid,uuid,uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_client_access_request(uuid,boolean) TO authenticated, service_role;