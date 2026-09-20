REVOKE ALL ON FUNCTION public.system_events_guard_scope() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.system_events_guard_scope() TO service_role;