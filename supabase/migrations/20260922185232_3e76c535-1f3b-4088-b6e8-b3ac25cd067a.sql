CREATE POLICY "installation_email_credentials_no_direct_access"
ON public.installation_email_credentials
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);