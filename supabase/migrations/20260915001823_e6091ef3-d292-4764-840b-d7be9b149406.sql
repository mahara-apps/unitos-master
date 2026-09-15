UPDATE public.installation_operation_outbox
SET status = 'cancelled',
    last_error = 'Fila legada retirada do caminho crítico no MASTER 1.3.95; operação preservada no registro canônico.',
    updated_at = now()
WHERE status IN ('pending', 'claimed', 'retryable');