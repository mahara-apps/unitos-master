SELECT public.set_installation_operations_freeze(
  true,
  'Preparação autorizada para recovery canônica e promoção do Control-plane 1.4.20',
  'Lovable — execução autorizada pelo operador',
  (SELECT generation FROM public.installation_operations_freeze WHERE singleton IS TRUE)
);