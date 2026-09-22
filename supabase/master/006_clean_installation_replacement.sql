-- MASTER 1.4.24: vínculo fail-closed para substituição limpa de instalações.
-- Control-plane only. Nunca incluir no pacote Client.

ALTER TABLE public.installations
  ADD COLUMN IF NOT EXISTS clean_replacement_of uuid REFERENCES public.installations(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS pending_domain text;

CREATE UNIQUE INDEX IF NOT EXISTS installations_one_clean_replacement
  ON public.installations (clean_replacement_of)
  WHERE clean_replacement_of IS NOT NULL;

COMMENT ON COLUMN public.installations.clean_replacement_of IS
  'Instalação antiga preservada enquanto esta substituição limpa é provisionada e validada.';
COMMENT ON COLUMN public.installations.pending_domain IS
  'Domínio institucional preservado para cutover posterior; não é usado durante o provisionamento isolado.';