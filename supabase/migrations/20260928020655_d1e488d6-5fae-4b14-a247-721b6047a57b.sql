-- Revoga somente capacidades administrativas herdadas pelo papel anônimo nas duas tabelas de controle criadas após o endurecimento de privilégios.
-- Não altera grants de authenticated/service_role, RLS, dados nem os registros da operação.
REVOKE MAINTAIN, TRUNCATE, TRIGGER, REFERENCES ON TABLE public.project_duplication_requests FROM anon;
REVOKE MAINTAIN, TRUNCATE, TRIGGER, REFERENCES ON TABLE public.project_template_requests FROM anon;