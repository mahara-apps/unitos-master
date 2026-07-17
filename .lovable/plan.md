# SLA configurável por coluna no `/content`

Hoje já existe `content_pipeline_stages.sla_days` (integer) e a UI de configuração do SLA no `ColumnConfigDialog`. Falta o resto do ciclo: medir tempo em coluna, marcar como atrasado, notificar e reportar.

## 1. Schema (migração)

- `posts.stage_entered_at timestamptz` — marca quando o card entrou na coluna atual. Default `now()`; backfill com `updated_at`.
- Trigger `posts_stage_change_bump()`:
  - Ao `INSERT`: setar `stage_entered_at = now()`.
  - Ao `UPDATE`, quando `stage_id` muda: `stage_entered_at = now()`.
- Índice parcial `posts(stage_id, stage_entered_at) WHERE deleted_at IS NULL` para o job de varredura.
- Adicionar `kind` enum values `sla_overdue` e `sla_overdue_manager` em `public.notification_kind` (se enum) — senão string livre.
- Nada de novas tabelas — reutilizamos `notifications` (payload jsonb guarda `post_id`, `stage_id`, `days_overdue`).

## 2. Regra de "atrasado"

Considera-se atrasado quando:
- `stage.sla_days IS NOT NULL AND stage.sla_days > 0`
- `stage.is_terminal = false` (colunas terminais não contam)
- `NOW() - posts.stage_entered_at > sla_days * interval '1 day'`
- `posts.deleted_at IS NULL`

Exposto via campo derivado `is_overdue` e `days_overdue` no retorno de `loadBoardFn` (calculado no server, sem coluna nova).

## 3. UI — badge no card (`content-board.tsx`)

- Novo badge vermelho `Atrasado · Nd` ao lado dos badges existentes (priority/format), usando token semântico `rose` do design system.
- Tooltip: "Em {stage.label} há X dias · SLA {sla_days}d".
- Aparece só quando `is_overdue = true`. Cards em estágio terminal nunca mostram.
- Também um contador de atrasados no header de cada coluna (bolinha rose) quando houver.

## 4. Job de notificação

Server route pública `src/routes/api/public/cron/sla-check.ts` (POST, protegida por header `x-cron-secret`):
- Varre posts atrasados agrupando por (assignee, brand, gestor).
- Para cada atrasado inédito nas últimas 24h (dedupe via `notifications.payload->>'post_id'` + `kind = 'sla_overdue'` no dia), insere:
  - 1 notificação para `posts.assignee_id` (kind `sla_overdue`).
  - 1 notificação para cada `brand_members` com role `owner`/`manager` do workspace (kind `sla_overdue_manager`), agregada por lote (evita spam: uma notificação-resumo por gestor com `count` no payload).
- Agendado via `pg_cron` chamando a rota (URL estável `https://project--<id>.lovable.app/api/public/cron/sla-check`), 1×/hora.
- Bell/`notifications` já renderizam automaticamente (nada a mudar lá além do rótulo pt-BR para os dois novos `kind`s no componente de bell/inbox).

## 5. Notificação em tela

- Toast + realtime já existente na inbox global cobre o "bell".
- Na tela `/content`, banner discreto (`AlertBanner` do design system) no topo quando houver ≥1 atrasado atribuído ao usuário atual: "Você tem N tarefas atrasadas".

## 6. Analytics (`/analytics`)

Novo painel "Performance de SLA":
- **Taxa de cumprimento de SLA por usuário** (últimos 30d): posts que saíram da coluna dentro do `sla_days` ÷ total de transições. Calculado a partir de `activity_events` (já registra mudanças de stage) + `content_pipeline_stages.sla_days` no momento da saída — ou, se `activity_events` não tiver o campo, usar heurística `updated_at - stage_entered_at` ao mover.
- **Tempo médio por coluna** (agregado): média de dias entre entradas/saídas por stage.
- **Atrasos ativos por usuário** (snapshot atual).

Server fn nova `slaMetricsFn` em `src/lib/analytics.functions.ts` retornando esses 3 datasets. Componente novo `SlaPerformancePanel` renderizado abaixo dos painéis atuais em `/analytics`.

## 7. Detalhes técnicos

- Servidor: nova função `checkSlaAndNotifyFn` (interna) chamada pela rota cron; usa `supabaseAdmin` (import dinâmico dentro do handler).
- Segurança: header `x-cron-secret` validado com `timingSafeEqual`. Secret adicionado via `add_secret` (`SLA_CRON_SECRET`).
- Dedupe: query `notifications` do dia por `kind + payload->>'post_id' + user_id` antes de inserir.
- RLS: as inserts vão via admin client, então RLS não bloqueia; leitura da inbox já é escopada por `user_id = auth.uid()`.
- `loadBoardFn`: computa `is_overdue`/`days_overdue` no map final (sem query extra).
- i18n: strings em pt-BR seguindo o padrão do projeto.

## 8. Fora de escopo (não faremos agora)

- Alterar o enum de `notification_kind` se ele estiver muito acoplado — se necessário, uso de valores string livres funciona.
- E-mail/WhatsApp de aviso (só bell + tela).
- SLA por prioridade/canal (só por coluna, conforme pedido).
