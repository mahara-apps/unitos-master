-- 1) Colunas
ALTER TABLE public.brand_members ADD COLUMN IF NOT EXISTS all_clients boolean NOT NULL DEFAULT false;
ALTER TABLE public.brand_invites ADD COLUMN IF NOT EXISTS all_clients boolean NOT NULL DEFAULT false;
ALTER TABLE public.brand_invites ADD COLUMN IF NOT EXISTS client_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

-- 2) Guard: all_clients só muda por função SECURITY DEFINER (nunca via Data API direto)
CREATE OR REPLACE FUNCTION public.guard_brand_member_all_clients()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF TG_OP = 'INSERT' AND NEW.all_clients THEN
      RAISE EXCEPTION 'Use a liberação de clientes da Equipe para "Todos os clientes".' USING ERRCODE = '42501';
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.all_clients IS DISTINCT FROM OLD.all_clients THEN
      RAISE EXCEPTION 'Use a liberação de clientes da Equipe para "Todos os clientes".' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_brand_member_all_clients ON public.brand_members;
CREATE TRIGGER trg_guard_brand_member_all_clients
  BEFORE INSERT OR UPDATE OF all_clients ON public.brand_members
  FOR EACH ROW EXECUTE FUNCTION public.guard_brand_member_all_clients();

-- 3) Regra canônica de acesso: Manager/User com all_clients veem todo o workspace
CREATE OR REPLACE FUNCTION public.can_access_client_row(_client_id uuid, _brand_id uuid, _owner_user_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_role text;
  v_all boolean;
BEGIN
  IF _user_id IS NULL OR _brand_id IS NULL THEN RETURN false; END IF;
  IF public.is_super_admin(_user_id) THEN RETURN true; END IF;

  -- Escopo INTERNO apenas. Portal (client_members.role='portal_client') não entra aqui.
  SELECT bool_or(all_clients) INTO v_all FROM public.brand_members
   WHERE brand_id = _brand_id AND user_id = _user_id AND is_active;
  IF v_all IS NULL THEN RETURN false; END IF;

  v_role := public.app_access_role(_user_id, _brand_id);
  IF v_role = 'admin' THEN RETURN true; END IF;

  -- MANAGER e USER: clientes atribuídos ou "Todos os clientes" (inclui futuros).
  IF v_role IN ('manager', 'user') THEN
    IF v_all THEN RETURN true; END IF;
    IF _owner_user_id IS NOT NULL AND _owner_user_id = _user_id THEN RETURN true; END IF;
    RETURN public.is_client_assigned(_user_id, _client_id);
  END IF;
  RETURN false;
END;
$function$;

-- 4) Núcleo: aplica o conjunto de clientes de um membro com ator explícito
CREATE OR REPLACE FUNCTION public._apply_member_clients(
  _actor uuid, _brand_id uuid, _user_id uuid, _all boolean, _client_ids uuid[]
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor text; v_target text; v_target_role text; v_before boolean; v_actor_all boolean;
  v_allowed uuid[]; v_wanted uuid[]; v_current uuid[]; v_final uuid[];
  v_add uuid[]; v_remove uuid[]; v_flag boolean; v_outside uuid[];
BEGIN
  IF _actor IS NULL OR _brand_id IS NULL OR _user_id IS NULL THEN
    RAISE EXCEPTION 'Dados incompletos para liberar clientes.' USING ERRCODE = '22023';
  END IF;
  v_actor := public.app_access_role(_actor, _brand_id);
  IF v_actor IS NULL OR v_actor NOT IN ('super_admin','admin','manager') THEN
    RAISE EXCEPTION 'Você não pode liberar clientes para membros deste workspace.' USING ERRCODE = '42501';
  END IF;
  IF _actor = _user_id AND v_actor <> 'super_admin' THEN
    RAISE EXCEPTION 'Você não pode alterar os próprios clientes.' USING ERRCODE = '42501';
  END IF;

  SELECT role::text, all_clients INTO v_target_role, v_before FROM public.brand_members
   WHERE brand_id = _brand_id AND user_id = _user_id AND is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Escolha um membro ativo deste workspace.' USING ERRCODE = '22023';
  END IF;
  v_target := public.app_access_role(_user_id, _brand_id);
  IF v_target NOT IN ('manager','user') THEN
    RAISE EXCEPTION 'Owner e Admin já veem todos os clientes do workspace.' USING ERRCODE = '22023';
  END IF;
  IF v_actor = 'manager' AND v_target <> 'user' THEN
    RAISE EXCEPTION 'Manager só libera clientes para membros User.' USING ERRCODE = '42501';
  END IF;

  v_actor_all := v_actor IN ('super_admin','admin') OR EXISTS (
    SELECT 1 FROM public.brand_members WHERE brand_id = _brand_id AND user_id = _actor AND is_active AND all_clients);

  SELECT COALESCE(array_agg(c.id), '{}') INTO v_allowed FROM public.clients c
   WHERE c.brand_id = _brand_id AND (v_actor_all OR public.can_access_client(c.id, _actor));

  v_wanted := COALESCE((SELECT array_agg(DISTINCT x) FROM unnest(COALESCE(_client_ids,'{}')) x), '{}');
  SELECT COALESCE(array_agg(x), '{}') INTO v_outside FROM unnest(v_wanted) x WHERE NOT (x = ANY(v_allowed));
  IF cardinality(v_outside) > 0 THEN
    RAISE EXCEPTION 'Há clientes que você não pode liberar para esta pessoa.' USING ERRCODE = '42501';
  END IF;

  IF NOT v_actor_all AND v_before AND NOT COALESCE(_all, false) THEN
    RAISE EXCEPTION 'Somente Owner/Admin podem retirar "Todos os clientes".' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(array_agg(client_id), '{}') INTO v_current FROM public.client_members
   WHERE brand_id = _brand_id AND user_id = _user_id AND role <> 'portal_client';

  IF COALESCE(_all, false) AND v_actor_all THEN
    v_flag := true;
    v_final := v_current;                       -- lista preservada para quando desligar
  ELSIF COALESCE(_all, false) THEN
    v_flag := COALESCE(v_before, false);        -- manager sem "todos": libera tudo o que acessa
    SELECT COALESCE(array_agg(DISTINCT x), '{}') INTO v_final
      FROM unnest(v_current || v_allowed) x;
  ELSE
    v_flag := false;
    -- vínculos fora do escopo do ator são preservados
    SELECT COALESCE(array_agg(DISTINCT x), '{}') INTO v_final FROM (
      SELECT x FROM unnest(v_current) x WHERE NOT (x = ANY(v_allowed))
      UNION SELECT x FROM unnest(v_wanted) x) s;
  END IF;

  SELECT COALESCE(array_agg(x), '{}') INTO v_add FROM unnest(v_final) x WHERE NOT (x = ANY(v_current));
  SELECT COALESCE(array_agg(x), '{}') INTO v_remove FROM unnest(v_current) x WHERE NOT (x = ANY(v_final));

  IF cardinality(v_remove) > 0 THEN
    DELETE FROM public.client_members
     WHERE brand_id = _brand_id AND user_id = _user_id AND role <> 'portal_client'
       AND client_id = ANY(v_remove);
  END IF;
  IF cardinality(v_add) > 0 THEN
    INSERT INTO public.client_members (brand_id, client_id, user_id, role, created_by)
    SELECT _brand_id, x, _user_id, v_target_role, _actor FROM unnest(v_add) x
    ON CONFLICT (client_id, user_id) DO NOTHING;
  END IF;
  IF v_flag IS DISTINCT FROM v_before THEN
    UPDATE public.brand_members SET all_clients = v_flag
     WHERE brand_id = _brand_id AND user_id = _user_id;
  END IF;

  IF cardinality(v_add) > 0 OR cardinality(v_remove) > 0 OR v_flag IS DISTINCT FROM v_before THEN
    INSERT INTO public.critical_action_events (actor_id, action_key, target_type, target_id, brand_id, impact)
    VALUES (_actor, 'member.clients', 'member', _user_id::text, _brand_id,
      jsonb_build_object('added', cardinality(v_add), 'removed', cardinality(v_remove),
                         'all_clients_before', v_before, 'all_clients', v_flag,
                         'added_ids', to_jsonb(v_add), 'removed_ids', to_jsonb(v_remove)));
  END IF;

  RETURN jsonb_build_object('added', cardinality(v_add), 'removed', cardinality(v_remove),
                            'allClients', v_flag, 'clientCount', cardinality(v_final));
END $$;

REVOKE ALL ON FUNCTION public._apply_member_clients(uuid, uuid, uuid, boolean, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._apply_member_clients(uuid, uuid, uuid, boolean, uuid[]) TO service_role;

-- 5) Ação pública (ator = quem está logado)
CREATE OR REPLACE FUNCTION public.set_member_clients(
  _brand_id uuid, _user_id uuid, _all boolean, _client_ids uuid[]
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  RETURN public._apply_member_clients(auth.uid(), _brand_id, _user_id, _all, _client_ids);
END $$;
REVOKE ALL ON FUNCTION public.set_member_clients(uuid, uuid, boolean, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_member_clients(uuid, uuid, boolean, uuid[]) TO authenticated, service_role;

-- 6) Aceite de convite aplica os clientes escolhidos com a autoridade de quem convidou
CREATE OR REPLACE FUNCTION public.accept_brand_invite(_token text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_user_email text := lower(coalesce((auth.jwt() ->> 'email'), ''));
  v_invite public.brand_invites%ROWTYPE;
  v_err text;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_invite FROM public.brand_invites WHERE token = _token;
  IF NOT FOUND THEN RAISE EXCEPTION 'invite_not_found'; END IF;
  IF v_invite.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'invite_revoked'; END IF;
  IF v_invite.accepted_at IS NOT NULL THEN RAISE EXCEPTION 'invite_already_accepted'; END IF;
  IF v_invite.expires_at < now() THEN RAISE EXCEPTION 'invite_expired'; END IF;
  IF lower(v_invite.email) <> v_user_email THEN RAISE EXCEPTION 'invite_email_mismatch'; END IF;
  IF v_invite.role NOT IN ('owner', 'admin', 'manager', 'user') THEN
    RAISE EXCEPTION 'invite_role_not_allowed';
  END IF;
  IF v_invite.invited_by = v_user_id AND NOT public.is_super_admin(v_user_id) THEN
    RAISE EXCEPTION 'invite_self_escalation';
  END IF;
  IF NOT public.can_invite_brand_role(
        v_invite.brand_id, v_invite.invited_by, v_invite.role, v_invite.email) THEN
    RAISE EXCEPTION 'invite_authority_invalid';
  END IF;

  INSERT INTO public.brand_members (brand_id, user_id, role, permissions)
  VALUES (v_invite.brand_id, v_user_id, v_invite.role, v_invite.permissions)
  ON CONFLICT (brand_id, user_id)
    DO UPDATE SET role = EXCLUDED.role, permissions = EXCLUDED.permissions;

  IF v_invite.role IN ('manager','user')
     AND (v_invite.all_clients OR cardinality(v_invite.client_ids) > 0) THEN
    BEGIN
      PERFORM public._apply_member_clients(v_invite.invited_by, v_invite.brand_id, v_user_id,
                                           v_invite.all_clients, v_invite.client_ids);
    EXCEPTION WHEN insufficient_privilege OR invalid_parameter_value THEN
      -- Autoridade de quem convidou mudou: a pessoa entra sem clientes (menor acesso) e fica registrado.
      GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
      INSERT INTO public.critical_action_events (actor_id, action_key, target_type, target_id, brand_id, result, error_message, impact)
      VALUES (v_invite.invited_by, 'member.clients', 'member', v_user_id::text, v_invite.brand_id, 'error', v_err,
              jsonb_build_object('source', 'invite_accept', 'invite_id', v_invite.id));
    END;
  END IF;

  UPDATE public.brand_invites SET accepted_at = now(), accepted_by = v_user_id WHERE id = v_invite.id;
  RETURN v_invite.brand_id;
END;
$function$;