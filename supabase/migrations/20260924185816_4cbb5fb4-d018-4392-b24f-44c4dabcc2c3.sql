CREATE OR REPLACE FUNCTION public.sanitize_mention_body()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.body := public.clean_mention_tokens(NEW.body);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.clean_mention_tokens(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clean_mention_tokens(text) TO service_role;

REVOKE ALL ON FUNCTION public.sanitize_mention_body() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sanitize_mention_body() TO service_role;