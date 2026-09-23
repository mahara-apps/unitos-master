-- Resend institucional: hardening retroativo e preventivo.
--
-- Esta migration é deliberadamente idempotente: corrige instalações que
-- receberam parcialmente o pacote de e-mail sem tocar na credencial cifrada,
-- no remetente, no domínio ou no histórico.
DO $email_credentials_hardening$
BEGIN
  IF to_regclass('public.installation_email_credentials') IS NOT NULL THEN
    REVOKE ALL ON TABLE public.installation_email_credentials FROM PUBLIC, anon, authenticated;
    GRANT ALL ON TABLE public.installation_email_credentials TO service_role;

    ALTER TABLE public.installation_email_credentials ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS installation_email_credentials_no_direct_access
      ON public.installation_email_credentials;
    CREATE POLICY installation_email_credentials_no_direct_access
      ON public.installation_email_credentials
      FOR ALL
      TO anon, authenticated
      USING (false)
      WITH CHECK (false);
  END IF;

  IF to_regprocedure('public.save_installation_email_configuration(text,text,text,text,text,text,timestamptz,uuid)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.save_installation_email_configuration(text,text,text,text,text,text,timestamptz,uuid)
      FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.save_installation_email_configuration(text,text,text,text,text,text,timestamptz,uuid)
      TO service_role;
  END IF;

  IF to_regprocedure('public.remove_installation_email_configuration()') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.remove_installation_email_configuration()
      FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.remove_installation_email_configuration()
      TO service_role;
  END IF;
END;
$email_credentials_hardening$;

-- Novas tabelas passam a exigir grants explícitos na própria migration.
-- Isso impede que segredos futuros herdem permissões amplas silenciosamente.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;

GRANT USAGE ON SCHEMA public TO anon, authenticated;