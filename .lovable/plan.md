## Diagnóstico

A tela `/notifications` renderiza corretamente, mas mostra "All caught up!" porque **nenhuma notificação é inserida** no banco. Duas migrações (`20260714…` e `20260715…`) fazem `INSERT INTO public.notifications (…, url)` — a coluna real é **`href`** e o enum `notification_kind` não tem `'task_assigned'` (tem `'assignment'`). Todo trigger de menção / atribuição / auto-scheduler falha silenciosamente. Além disso a tela e o drawer estão em inglês, fora do padrão pt-BR do sistema.

## Escopo

1. **Corrigir a origem das notificações (DB)** — nova migração:
   - Recria `notify_task_mentions` e `notify_task_assigned` usando `href` e `kind='assignment'`.
   - Adiciona `notify_post_approval_events`: dispara `approval_requested` quando um `post` entra em `stage='approval'` e `approval_decision` quando vira `approved`/`rejected`, notificando `assignee_id` / autor.
   - Adiciona `notify_ai_job_completed`: `kind='system'` quando `ai_jobs.status` vira `completed`/`failed`, para o `created_by`.
   - Trigger de deadline: função `public.enqueue_deadline_notifications()` chamada via `pg_cron` a cada 30min, cria `kind='deadline'` para tasks/posts vencendo em <24h ainda não notificados (dedupe por `payload->>'source_id'`).
   - Respeita `user_profiles.notification_preferences` (in-app on/off por kind).

2. **Refatorar `src/routes/_authenticated/notifications.tsx`** para o Design System padrão (igual Dashboard/Settings):
   - `DashboardPageShell` full-width com header global (título "Notificações", subtítulo dinâmico "X não lidas · Y hoje").
   - **4 KPI cards** (`SettingsStatCard` reutilizado): Não lidas · Menções · Aprovações pendentes · Prazos próximos — com tones violet/sky/amber/rose.
   - **Filtros**: `Tabs` (Todas · Não lidas · Menções · Aprovações · Sistema) + busca simples.
   - **Lista agrupada** por Hoje / Ontem / Esta semana / Anteriores, densidade compacta (px-4 py-3, border-border/60, sem sombra), ícone colorido por `kind`, chip com marca (`brand_id`), horário relativo pt-BR ("há 3 min"), ponto rosa para não lida, ação inline "Marcar como lida" e link para `href`.
   - Estado vazio no mesmo shell (mantém KPIs zerados).
   - Ação do header: "Marcar todas como lidas" + link para `/settings/notifications` (preferências).

3. **Localização + polish do `NotificationsBell` / drawer** (`src/components/notifications/notifications-drawer.tsx`):
   - Traduzir "Recent activity / Mark all as read / All caught up / View all notifications" para pt-BR.
   - Tempo relativo em pt-BR ("há 3 min", "há 2 h", "ontem").
   - Contador (badge numérico até 9+) no sino além do pulse.
   - Mantém realtime + invalidação já existentes.

4. **Utilitário compartilhado** `src/lib/notifications-format.ts` com `relativeTimePtBr`, `iconFor`, `toneFor`, `labelFor` — remove duplicação entre página e drawer.

## Detalhes técnicos

- Nenhuma quebra de contrato: `NotificationRow`, `listMyNotificationsFn`, mutations e realtime channel permanecem iguais.
- Migração usa `CREATE OR REPLACE FUNCTION` + `DROP TRIGGER IF EXISTS` para ser idempotente; grants não mudam (a tabela já tem GRANT/RLS corretos).
- pg_cron: `SELECT cron.schedule('deadline-notifications','*/30 * * * *', $$SELECT public.enqueue_deadline_notifications()$$)` com guarda `IF NOT EXISTS`.
- Sem novas dependências. Sem mudança de rotas.

## Fora de escopo

- E-mail/push (a aba `/settings/notifications` já controla preferências; ligar canal e-mail via Resend fica para próxima iteração).
- Novos tipos de evento além dos listados.