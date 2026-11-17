-- Fechamento de leitura ampla (varredura de segurança):
-- * brain_retention_config: só Super Admin lê (jobs usam funções SECURITY DEFINER).
-- * installation: deixa de ser legível por qualquer visitante; o app lê via service_role.
-- * avatars: cada pessoa lê apenas a própria pasta; quem vê a foto usa a URL assinada.
DROP POLICY IF EXISTS "brain_retention_config read by any authenticated" ON public.brain_retention_config;
DROP POLICY IF EXISTS brain_retention_config_select_super_admin ON public.brain_retention_config;
CREATE POLICY brain_retention_config_select_super_admin ON public.brain_retention_config
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS installation_select_public ON public.installation;
DROP POLICY IF EXISTS installation_select_super_admin ON public.installation;
CREATE POLICY installation_select_super_admin ON public.installation
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS avatars_auth_read ON storage.objects;
DROP POLICY IF EXISTS avatars_owner_read ON storage.objects;
CREATE POLICY avatars_owner_read ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'avatars' AND (auth.uid())::text = (storage.foldername(name))[1]);