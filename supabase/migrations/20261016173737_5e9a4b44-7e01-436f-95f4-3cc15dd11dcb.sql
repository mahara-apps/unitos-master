CREATE OR REPLACE FUNCTION public.check_ai_usage_budget(_brand_id uuid, _client_id uuid, _user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  period_start timestamptz := date_trunc('month', now());
  brand_limit numeric := NULL;  brand_hard boolean := false;
  client_limit numeric := NULL; client_hard boolean := false;
  user_limit numeric := NULL;   user_hard boolean := false;
  brand_spent numeric := 0; client_spent numeric := 0; user_spent numeric := 0;
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT public.is_super_admin(auth.uid())
     AND NOT public.is_brand_member(_brand_id, auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT l.limit_usd, COALESCE(l.hard_stop,false) INTO brand_limit, brand_hard
    FROM public.ai_usage_limits l WHERE l.brand_id = _brand_id AND l.scope = 'brand' LIMIT 1;
  brand_hard := COALESCE(brand_hard,false);
  SELECT COALESCE(SUM(cost_usd),0) INTO brand_spent FROM public.brand_ai_usage
    WHERE brand_id = _brand_id AND created_at >= period_start;

  IF _client_id IS NOT NULL THEN
    SELECT l.limit_usd, COALESCE(l.hard_stop,false) INTO client_limit, client_hard
      FROM public.ai_usage_limits l
     WHERE l.brand_id = _brand_id AND l.scope = 'client' AND l.client_id = _client_id LIMIT 1;
    client_hard := COALESCE(client_hard,false);
    SELECT COALESCE(SUM(cost_usd),0) INTO client_spent FROM public.brand_ai_usage
      WHERE brand_id = _brand_id AND client_id = _client_id AND created_at >= period_start;
  END IF;

  IF _user_id IS NOT NULL THEN
    SELECT l.limit_usd, COALESCE(l.hard_stop,false) INTO user_limit, user_hard
      FROM public.ai_usage_limits l
     WHERE l.brand_id = _brand_id AND l.scope = 'user' AND l.user_id = _user_id
       AND (l.client_id IS NULL OR l.client_id = _client_id)
     ORDER BY (l.client_id IS NOT NULL) DESC LIMIT 1;
    user_hard := COALESCE(user_hard,false);
    SELECT COALESCE(SUM(cost_usd),0) INTO user_spent FROM public.brand_ai_usage
      WHERE brand_id = _brand_id AND actor_id = _user_id AND created_at >= period_start;
  END IF;

  IF user_limit IS NOT NULL AND user_hard AND user_spent >= user_limit THEN
    RETURN jsonb_build_object('allowed', false, 'blocked_by','user', 'spent_usd', user_spent, 'limit_usd', user_limit);
  END IF;
  IF client_limit IS NOT NULL AND client_hard AND client_spent >= client_limit THEN
    RETURN jsonb_build_object('allowed', false, 'blocked_by','client', 'spent_usd', client_spent, 'limit_usd', client_limit);
  END IF;
  IF brand_limit IS NOT NULL AND brand_hard AND brand_spent >= brand_limit THEN
    RETURN jsonb_build_object('allowed', false, 'blocked_by','brand', 'spent_usd', brand_spent, 'limit_usd', brand_limit);
  END IF;

  RETURN jsonb_build_object('allowed', true,
    'brand', jsonb_build_object('spent', brand_spent, 'limit', brand_limit),
    'client', jsonb_build_object('spent', client_spent, 'limit', client_limit),
    'user', jsonb_build_object('spent', user_spent, 'limit', user_limit));
END; $function$;

REVOKE ALL ON FUNCTION public.check_ai_usage_budget(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_ai_usage_budget(uuid, uuid, uuid) TO authenticated, service_role;