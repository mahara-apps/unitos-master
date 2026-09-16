DO $migration$
DECLARE
  _table regclass;
BEGIN
  FOR _table IN
    SELECT c.oid::regclass
    FROM pg_class AS c
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND c.relowner = 'postgres'::regrole
  LOOP
    EXECUTE format(
      'REVOKE MAINTAIN, TRUNCATE, TRIGGER, REFERENCES ON TABLE %s FROM anon',
      _table
    );
  END LOOP;
END
$migration$;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE MAINTAIN, TRUNCATE, TRIGGER, REFERENCES ON TABLES FROM anon;

GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT ON TABLE public.installation TO anon;