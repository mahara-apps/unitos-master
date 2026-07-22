
## Problema

O `DateRangePicker` nos dashboards (agência, cliente e customer) só entra na `queryKey` — o range nunca chega no servidor. As fns (`getStatsFn`, `getAgencyFn`, `getCustomerDashboardFn`) usam janelas fixas hardcoded (`sinceIso(7|14|30|60)`), então mudar o filtro visualmente não muda nenhum número.

Além disso, cada bloco usa um campo de data diferente (`updated_at`, `done_at`, `published_at`, `scheduled_at`), o que dificulta um filtro consistente.

## Objetivo

Fazer o range escolhido no header filtrar de verdade os dados, usando **`created_at` como campo padrão** (conforme pedido). Campos de eventos naturalmente temporais (agendamento futuro, "atrasadas hoje") permanecem intactos porque não fazem sentido serem filtrados pelo range histórico.

## Escopo por fn

### `src/lib/dashboard.functions.ts`
- Adicionar input opcional `range: { from: string; to: string }` em `BrandInput` (ISO strings), com fallback: últimos 30 dias.
- Substituir todo `sinceIso(N)` que hoje filtra dados retroativos por `range.from` / `range.to` sobre **`created_at`**, exceto:
  - `upcomingPosts` / `upcoming` (agendamentos futuros) — mantém `scheduled_at >= now`, `<= now+7d`.
  - `tasks_overdue` — mantém `due_at < now`.
  - `tasks_done_7d` → renomear conceitualmente para "concluídas no período" usando `done_at` dentro do range.
  - `heatmap` (60d fixo) e `sparkline`/`publishTrend14d` — trocar o tamanho fixo pelo tamanho do range (dias entre from/to, cap 60/90) e usar `created_at`/`published_at` conforme aplicável dentro do range.
- Aprovações: `approvals_pending` continua absoluto; `posts_approved_30d` passa a usar `post_approvals.created_at` dentro do range (label "aprovadas no período").
- `computeAiUsage`: aceitar range e filtrar `brand_ai_usage.created_at` por ele; `cost7d` / `spark14d` recomputados sobre o range.

### `src/lib/customer-dashboard.functions.ts`
- Mesmo tratamento: input `range`, filtros por `created_at` no range em vez de `since30d` hardcoded.
- `social_posts` published metrics: filtrar `published_at` dentro do range (a métrica é sobre publicação, mas o range escolhido pelo usuário passa a ser respeitado).

### `src/routes/_authenticated/dashboard.tsx`
- Nos três `useQuery` (`dashboard-agency`, `dashboard-client`, `customer-dashboard`): passar `data: { brandId, clientId?, range: { from: range.from.toISOString(), to: range.to.toISOString() } }`.
- Manter `days` na queryKey para invalidar cache (já está).

## Regra padrão do filtro

- Campo padrão: **`posts.created_at`, `tasks.created_at`, `activity_events.created_at`, `brand_ai_usage.created_at`, `post_approvals.created_at`**.
- Exceções mantêm o campo semântico correto:
  - Agendamentos futuros: `scheduled_at`.
  - Atrasadas: `due_at < now`.
  - Publicações realizadas (worker): `social_posts.published_at`.
- Sparkline/heatmap/trend adaptam seu tamanho ao range (`Math.min(90, daysBetween(from,to))`).

## Fora de escopo

- UI do `DateRangePicker` (já existe e funciona).
- Filtros de outras rotas (analytics, brain) — só o Dashboard nesta iteração.
- Backfill de `posts.published_at`.

## Validação

- `tsgo --noEmit`.
- Preview: trocar preset (7d / 30d / 90d) e conferir que KPIs, sparkline, ritmo de publicações e AI usage mudam de valor.
