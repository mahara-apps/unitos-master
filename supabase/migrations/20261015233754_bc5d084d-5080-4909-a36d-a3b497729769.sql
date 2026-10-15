REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.ai_credential_audit FROM authenticated;
REVOKE ALL ON public.ai_credential_audit FROM anon;
GRANT SELECT ON public.ai_credential_audit TO authenticated;
GRANT ALL ON public.ai_credential_audit TO service_role;