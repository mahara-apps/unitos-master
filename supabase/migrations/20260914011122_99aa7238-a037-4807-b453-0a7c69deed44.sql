-- INCIDENT HOTFIX: table-owner capabilities bypass or sit outside row-level policies.
-- Remove them explicitly from anon on sensitive operational tables.
REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE
  public.evolution_events,
  public.evolution_instances,
  public.installation,
  public.whatsapp_recipients
FROM anon;

-- Prevent future tables created by the main database owner from inheriting
-- these capabilities for anonymous callers.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLES FROM anon;

-- Preserve anonymous schema access required by intentionally public RPCs.
GRANT USAGE ON SCHEMA public TO anon;