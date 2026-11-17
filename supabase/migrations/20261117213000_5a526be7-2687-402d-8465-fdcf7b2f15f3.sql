-- Avisos em tempo real nas instalações: o pacote nunca publicou estas tabelas
-- (o baseline foi gerado sem publicação), então a tela não via a geração de
-- IA terminar, nem notificações, tarefas e aprovações novas. Idempotente e
-- restrito às tabelas que o MASTER já publica; o Realtime respeita RLS.
DO $$
DECLARE
  _t text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RETURN;
  END IF;
  FOREACH _t IN ARRAY ARRAY[
    'ai_jobs', 'notifications', 'tasks', 'post_approvals', 'posts',
    'messages', 'message_threads', 'chat_messages', 'chat_conversations',
    'activity_events', 'card_approval_events'
  ] LOOP
    IF to_regclass('public.' || _t) IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = _t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', _t);
    END IF;
  END LOOP;
END;
$$;
