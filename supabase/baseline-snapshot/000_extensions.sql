-- =============================================================================
-- 000_extensions.sql — EXTENSOES DO ESTADO ATUAL (aplicar ANTES de 001)
--
-- Motivo de existir: pg_dump --schema=public NAO emite CREATE EXTENSION para
-- extensoes cujo schema-alvo nao esta no dump (extensions, vault, pg_catalog),
-- nem para as instaladas em public quando dumpadas isoladamente. Portanto o
-- 001_initial_schema.sql referencia public.vector(1536) / hnsw sem criar a
-- extensao. Este arquivo NAO e reconstrucao aproximada: e a copia literal de
-- pg_extension do banco de origem (nome + schema + versao real).
--
-- Estado real lido em 2026-08-29 (SELECT em pg_extension, somente leitura):
--   pg_cron            pg_catalog   1.6.4
--   pg_net             public       0.20.3
--   pg_stat_statements extensions   1.11
--   pgcrypto           extensions   1.3
--   plpgsql            pg_catalog   1.0
--   supabase_vault     vault        0.3.1
--   uuid-ossp          extensions   1.1
--   vector             public       0.8.2
--
-- plpgsql ja vem pronto em qualquer projeto Supabase novo.
-- supabase_vault e criado explicitamente abaixo porque 001 depende dele
-- (public.cron_secret() / public.set_cron_secret() usam vault.*).
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS extensions;

CREATE EXTENSION IF NOT EXISTS pgcrypto      WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp"   WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions;

-- Vault: necessario para o segredo do cron (public.cron_secret()).
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

-- O Supabase pode provisionar pgvector previamente no schema `extensions`.
-- `CREATE EXTENSION IF NOT EXISTS ... WITH SCHEMA public` não reloca uma
-- extensão existente: converge explicitamente sem apagar seus objetos/dados.
DO $unitos_vector_schema$
DECLARE
  current_schema text;
BEGIN
  SELECT n.nspname
    INTO current_schema
    FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace
   WHERE e.extname = 'vector';

  IF current_schema IS NULL THEN
    EXECUTE 'CREATE EXTENSION vector WITH SCHEMA public';
  ELSIF current_schema <> 'public' THEN
    EXECUTE 'ALTER EXTENSION vector SET SCHEMA public';
  END IF;
END
$unitos_vector_schema$;

-- pg_net registrado com schema public no banco de origem, mas a propria extensao
-- cria o schema "net": as funcoes ficam em net.http_post/net.http_get, usadas
-- pelo cron canonico em supabase/install/020_cron.sql.
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA public;

-- pg_cron sempre em pg_catalog no Supabase.
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Ledger canônico do executor compartilhado NEW/UPDATE. A evolução é aditiva:
-- registros legados mantêm kind='blob' e file/fingerprint nulos, sem inventar
-- evidência por migration.
CREATE TABLE IF NOT EXISTS public._unitos_applied_deltas (
  label text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public._unitos_applied_deltas TO service_role;
ALTER TABLE public._unitos_applied_deltas
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'blob';
ALTER TABLE public._unitos_applied_deltas
  ADD COLUMN IF NOT EXISTS file text;
ALTER TABLE public._unitos_applied_deltas
  ADD COLUMN IF NOT EXISTS fingerprint text;
DROP INDEX IF EXISTS public._unitos_applied_deltas_file_key;
CREATE UNIQUE INDEX IF NOT EXISTS _unitos_applied_deltas_file_fingerprint_key
  ON public._unitos_applied_deltas (file, fingerprint)
  WHERE kind = 'migration';
ALTER TABLE public._unitos_applied_deltas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._unitos_applied_deltas FROM anon, authenticated;

-- Pós-condição obrigatória do arquivo: 001_initial_schema usa ambos os objetos
-- com schema qualificado. Falhar aqui impede checkpoint falso de conclusão.
DO $unitos_vector_postcondition$
BEGIN
  IF to_regtype('public.vector') IS NULL THEN
    RAISE EXCEPTION '000_extensions: tipo public.vector ausente após convergência do pgvector';
  END IF;
  IF NOT EXISTS (
    SELECT 1
      FROM pg_opclass oc
      JOIN pg_namespace n ON n.oid = oc.opcnamespace
     WHERE n.nspname = 'public'
       AND oc.opcname = 'vector_cosine_ops'
  ) THEN
    RAISE EXCEPTION '000_extensions: operator class public.vector_cosine_ops ausente após convergência do pgvector';
  END IF;
END
$unitos_vector_postcondition$;
