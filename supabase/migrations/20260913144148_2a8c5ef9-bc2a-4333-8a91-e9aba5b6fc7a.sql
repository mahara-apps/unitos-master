REVOKE ALL ON FUNCTION public.seed_default_work_statuses_for_brand() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seed_default_work_statuses_for_brand() TO service_role;