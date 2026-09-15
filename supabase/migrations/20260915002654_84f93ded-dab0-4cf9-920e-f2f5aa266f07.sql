REVOKE ALL PRIVILEGES ON TABLE public.installation_operation_migrations FROM authenticated;
GRANT SELECT ON TABLE public.installation_operation_migrations TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.installation_operation_migrations TO service_role;
REVOKE ALL PRIVILEGES ON FUNCTION public.checkpoint_installation_migration(uuid,text,bigint,text,text,integer,integer,integer,boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON FUNCTION public.reconcile_installation_operation_migrations(uuid,text,bigint,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON FUNCTION public.merge_installation_operation_steps(jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.checkpoint_installation_migration(uuid,text,bigint,text,text,integer,integer,integer,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_installation_operation_migrations(uuid,text,bigint,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.merge_installation_operation_steps(jsonb,jsonb) TO service_role;