-- =============================================================================
-- FORWARD-ONLY. ARQUIVO EM STAGING: ver supabase/baseline/README.md.
-- Nome-alvo final:
--   supabase/migrations/20260821090200_storage_bucket_chat_attachments.sql
-- =============================================================================
-- Achado da validacao em ambiente descartavel:
-- producao possui 5 buckets (avatars, brand-assets, brand-documents,
-- brand-media, chat-attachments) e o baseline de storage versionava apenas 4.
-- Em instalacao limpa, anexos de chat quebram.
--
-- Idempotente (ON CONFLICT DO NOTHING): no-op em producao.
-- Privado: acesso via signed URLs geradas em server functions.
-- =============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-attachments', 'chat-attachments', false)
ON CONFLICT (id) DO NOTHING;
