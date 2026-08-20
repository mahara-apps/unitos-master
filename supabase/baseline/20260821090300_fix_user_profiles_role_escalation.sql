-- =============================================================================
-- FORWARD-ONLY. ARQUIVO EM STAGING: ver supabase/baseline/README.md.
-- Nome-alvo final:
--   supabase/migrations/20260821090300_fix_user_profiles_role_escalation.sql
-- =============================================================================
-- ACHADO CRITICO (reproduzido no clone descartavel, mas presente TAMBEM em
-- producao, pois os objetos sao identicos):
--
--   1. public.user_profiles tem UPDATE policy "auth.uid() = id" sem restricao de
--      coluna -> um USER comum pode executar:
--          update user_profiles set role='super_admin' where id = auth.uid();
--   2. public.is_super_admin(uuid) retorna true quando
--          is_super_admin = true OR role = 'super_admin'
--      -> a auto-promocao acima concede acesso global imediato.
--   3. O trigger guard_super_admin_flag() so protege a COLUNA is_super_admin,
--      nunca a coluna role.
--
-- Correcao: o trigger passa a bloquear tambem mudanca de `role` por quem nao e
-- super admin. auth.uid() nulo = rotina interna (service_role / SQL admin),
-- mantendo o comportamento atual de backoffice e seeds.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.guard_super_admin_flag()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.is_super_admin, false) IS DISTINCT FROM COALESCE(OLD.is_super_admin, false) THEN
    IF auth.uid() IS NOT NULL AND NOT public.is_super_admin(auth.uid()) THEN
      RAISE EXCEPTION 'Forbidden: apenas super admin altera is_super_admin';
    END IF;
  END IF;

  IF COALESCE(NEW.role, '') IS DISTINCT FROM COALESCE(OLD.role, '') THEN
    IF auth.uid() IS NOT NULL AND NOT public.is_super_admin(auth.uid()) THEN
      RAISE EXCEPTION 'Forbidden: apenas super admin altera role do perfil';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
