## Objetivo

Hoje `/analytics` sempre agrega tudo da agência (brand), mesmo quando o usuário selecionou um cliente específico no switcher. Vamos fazer com que:

- **Modo Cliente ativo** (`clientId` presente no `useActiveContext`) → analytics mostra somente os canais sociais vinculados àquele cliente (via `client_social_accounts`) e as métricas de produção/equipe/tarefas filtradas por `client_id`.
- **Modo Gestão** (nenhum cliente ativo, só `brandId`) → comportamento atual, agregando todas as contas e clientes da agência.

## Mudanças

### 1. Server functions

- **`src/lib/social-analytics/brand-dashboard.functions.ts`**
  - Adicionar `clientId: z.string().uuid().optional()` nos schemas `Input` e `TopInput` de `getBrandSocialDashboardFn` e `getBrandSocialTopPayloadFn`.
  - Quando `clientId` vier preenchido, buscar em `client_social_accounts` os `connection_id`s daquele cliente e filtrar `social_connections` por esse conjunto (retorno vazio = zerar dashboard sem quebrar).

- **`src/lib/analytics.functions.ts`** (`getAnalytics`)
  - Já aceita `client_ids[]` no filtro. Adicionar `clientId?` no input; quando presente, forçar `client_ids = [clientId]` antes das queries de posts/tasks/projetos/cohorts, ignorando o filtro manual da UI (para não permitir escapar do escopo).

### 2. Rota `src/routes/_authenticated/analytics.tsx`

- Ler `clientId` de `useActiveContext()` junto com `brandId`.
- Incluir `clientId` nas `queryKey`s (`["analytics", brandId, clientId, …]` etc.) e passar para as três chamadas: `analyticsFn`, `SocialAnalyticsDashboard` (novo prop opcional `clientId`) e o payload pesado de top posts.
- Ajustar `usePageHeader`:
  - Título continua "Análises"; subtítulo dinâmico: `"Visão do cliente {nome}"` vs `"Visão executiva da agência"`.
- Ocultar a aba **Clientes** quando `clientId` estiver ativo (redundante — já é o próprio cliente); manter Social/Produção/Equipe.
- No `FiltersSheet`, remover o seletor de "Clientes" quando `clientId` estiver ativo (o filtro fica travado).

### 3. `src/components/social/SocialAnalyticsDashboard.tsx`

- Aceitar `clientId?: string` e repassar para `getBrandSocialDashboardFn` / `getBrandSocialTopPayloadFn`. Incluir na `queryKey` para invalidar corretamente ao trocar de cliente.

### 4. `ClientsTab`

- Sem mudanças estruturais; só deixa de ser renderizada no modo cliente (esconder a `TabsTrigger` + `TabsContent`).

## Detalhes técnicos

- O filtro de conexões por cliente sai de `client_social_accounts` (colunas `client_id`, `connection_id`). Já existem RLS/tipos para essa tabela.
- Nenhuma migração de banco: toda a lógica é do lado do servidor filtrando por `IN (...)`.
- Cache: as `queryKey`s ganham `clientId ?? "all"` para não misturar caches entre gestão e cliente.
- Contagens/KPIs continuam somando só o que restou após o filtro — quando o cliente não tem canais vinculados, o dashboard social exibe estado vazio com CTA para ir em Perfil → Canais (já existente).

## Fora de escopo

- Novos gráficos comparativos entre clientes na visão gestão.
- Mudanças no dashboard `/dashboard` (só `/analytics`).
- Alterações em Brain/Calendar (já são escopados por outro caminho).
