DO $release_taveira$
DECLARE
  v_installation public.installations%ROWTYPE;
  v_operation public.installation_operations%ROWTYPE;
BEGIN
  IF current_database() <> 'postgres' THEN
    RAISE EXCEPTION 'Banco inesperado; nenhuma operação liberada';
  END IF;
  SELECT * INTO v_installation FROM public.installations
  WHERE id = 'f20f6f63-eae3-4443-ab3b-f5623d1ea5ef'::uuid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Taveira não encontrada; nenhuma operação liberada';
  END IF;
  SELECT * INTO v_operation FROM public.installation_operations
  WHERE id = '7e90a20f-15cb-41a3-8022-469ca2f275ee'::uuid FOR UPDATE;
  IF NOT FOUND OR v_operation.installation_id <> v_installation.id
    OR v_operation.status <> 'pending' OR v_operation.kind <> 'update'
    OR v_operation.attempt_count <> 0 OR v_operation.lease_owner IS NOT NULL
    OR v_operation.detail->>'batchId' <> '261f5362-5afd-4856-b9d3-80d88362cf7f'
    OR v_operation.baseline_id <> '1.4.43:fb3f3b12d55ed79a268a34edc451c70fc9809785:93'
    OR v_installation.active_operation_id <> v_operation.id
    OR v_installation.status <> 'updating' THEN
    RAISE EXCEPTION 'Estado da Taveira mudou; nenhuma operação liberada';
  END IF;
  UPDATE public.installation_operations
  SET status = 'failed',
      summary = 'Operação em fila cancelada a pedido do responsável para liberar atualização manual da Taveira; nenhuma tentativa executada.',
      error_kind = 'cancelada_manual',
      blocked_reason = 'Fila anterior 1.4.43 cancelada para autorização manual individual.',
      error_detail = coalesce(error_detail, '{}'::jsonb) || jsonb_build_object('reason', 'manual_release_requested', 'originalBatchId', '261f5362-5afd-4856-b9d3-80d88362cf7f'),
      finished_at = now()
  WHERE id = v_operation.id;
  UPDATE public.installations
  SET status = 'attention', active_operation_id = NULL,
      last_error = 'Fila anterior cancelada a pedido do responsável; atualização manual disponível.'
  WHERE id = v_installation.id AND active_operation_id = v_operation.id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'A liberação da instalação não foi concluída';
  END IF;
END
$release_taveira$;