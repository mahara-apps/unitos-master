DO $fix_nxt_domain$
DECLARE
  v_installation public.installations%ROWTYPE;
BEGIN
  SELECT * INTO v_installation
  FROM public.installations
  WHERE id = '46bda66d-2389-4d5b-8271-f97a3f83d0fb'::uuid
  FOR UPDATE;

  IF NOT FOUND
     OR v_installation.name <> 'NXT'
     OR v_installation.slug <> 'nxt'
     OR v_installation.domain <> 'unitosnxt.vercel.app'
     OR v_installation.deploy_project <> 'unitos-nxt'
     OR v_installation.git_repo_url <> 'https://github.com/mahara-apps/unitos-nxt'
     OR v_installation.current_version <> '1.4.42'
     OR v_installation.active_operation_id IS NOT NULL
     OR EXISTS (
       SELECT 1 FROM public.installation_operations o
       WHERE o.installation_id = v_installation.id
         AND o.status IN ('pending', 'running', 'retryable')
     )
     OR EXISTS (
       SELECT 1 FROM public.installations i
       WHERE i.id <> v_installation.id AND i.domain = 'unitos-nxt.vercel.app'
     )
  THEN
    RAISE EXCEPTION 'NXT: cadastro ou fila mudou; endereco nao alterado';
  END IF;

  UPDATE public.installations
  SET domain = 'unitos-nxt.vercel.app'
  WHERE id = v_installation.id AND domain = 'unitosnxt.vercel.app';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NXT: endereco nao alterado';
  END IF;
END
$fix_nxt_domain$;