-- =============================================================================
-- FORWARD-ONLY / BASELINE DE STORAGE. ARQUIVO EM STAGING:
-- ver supabase/baseline/README.md.
-- Nome-alvo final:
--   supabase/migrations/20260821090100_storage_buckets_baseline.sql
-- =============================================================================
-- As migrations historicas criam APENAS as policies em storage.objects para
-- 'brand-assets', 'brand-documents', 'brand-media' e 'avatars'. Os buckets em si
-- foram criados via painel/API e nunca versionados -> em instalacao limpa os
-- uploads quebram.
--
-- Idempotente (ON CONFLICT DO NOTHING): no-op em producao.
-- Todos privados: o acesso e feito por signed URLs geradas em server functions.
-- =============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('brand-assets',    'brand-assets',    false),
  ('brand-documents', 'brand-documents', false),
  ('brand-media',     'brand-media',     false),
  ('avatars',         'avatars',         false)
ON CONFLICT (id) DO NOTHING;
