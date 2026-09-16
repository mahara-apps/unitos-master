DO $verify$
DECLARE
  _dangerous_count bigint;
BEGIN
  SELECT count(*)
    INTO _dangerous_count
  FROM pg_class AS c
  JOIN pg_namespace AS n ON n.oid = c.relnamespace
  CROSS JOIN LATERAL aclexplode(c.relacl) AS a
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p')
    AND a.grantee = 'anon'::regrole
    AND a.privilege_type IN ('MAINTAIN', 'TRUNCATE', 'TRIGGER', 'REFERENCES');

  IF _dangerous_count <> 0 THEN
    RAISE EXCEPTION 'A contenção deixou % concessões administrativas anônimas', _dangerous_count;
  END IF;

  IF NOT has_table_privilege('anon', 'public.installation', 'SELECT') THEN
    RAISE EXCEPTION 'A leitura pública intencional de installation foi removida';
  END IF;
END
$verify$;