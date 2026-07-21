
## Objetivo
Elevar a tela `/analytics` a um padrão premium com comparativos de período, gráficos revisados, filtros de data honrados em todas as camadas (KPIs, séries, top posts, timing) e Insights do Brain escopados exclusivamente ao cliente ativo.

## 1. KPIs com comparativo de período
Em `src/lib/social-analytics/brand-dashboard.functions.ts` (`getBrandSocialDashboardFn`):
- Calcular o range anterior de igual duração (`prevSince/prevUntil` = janela imediatamente anterior a `since`).
- Rodar um segundo `Promise.allSettled` de `svc.getDashboard(resolved, { range: prevRange })` em paralelo.
- Consolidar totais anteriores (followers, reach, impressions, engagement, posts, growth).
- Preencher `deltaPct` de cada `SocialKpi` como `((atual - anterior) / anterior) * 100`, `null` quando anterior=0.
- Reaproveitar cache (chave já inclui since/until).

## 2. Gráfico de Performance por Formato
Em `FormatPerformanceCard` (`social-analytics-dashboard.tsx`):
- Trocar Bar duplo (Engajamento+Alcance) por gráfico horizontal (`layout="vertical"`) com barras arredondadas mostrando **Engajamento médio por post** (`avgEngagement`) — métrica que já vem do backend mas está ignorada.
- Adicionar chip lateral com totais absolutos (posts, engajamento total) por formato.
- Cores por formato (imagem/vídeo/carrossel/texto) via tokens semânticos.
- Tooltip PT-BR com legenda por formato.

## 3. Gráfico de Evolução Temporal
Em `TimeSeriesCard`:
- Substituir por `LineChart` puro com 3 linhas (Alcance, Impressões, Engajamento), cada uma com `dot` e cor distinta — hoje mistura `<Area>` dentro de `<AreaChart>` com uma `<Line>` órfã que não cruza corretamente.
- Formatar `XAxis` com `tickFormatter` usando `Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" })`.
- Tooltip com `labelFormatter` PT-BR completo (`dd 'de' MMM`).
- Adicionar `<Legend>` PT-BR embaixo.

## 4. Top publicações com limite 10 e filtro de data
- Backend (`getBrandSocialTopPayloadFn`): repassar `range { since, until }` na chamada `svc.getTopPosts(resolved, { range, limit: 30 })`.
- Filtrar por `publishedAt` dentro de `[since, until]` antes de rankear (garantia se o provider não filtrar).
- Reduzir cap final de `.slice(0, 12)` para `.slice(0, 10)`.
- Ajustar `svc.getTopPosts` (`service.server.ts`) para aceitar `range` no cache key e repassar ao provider.

## 5. Métricas de Timing reais e escopadas
- Timing (`bestHours`, `bestDays`) já é derivado dos top posts — depois da correção acima, passa a respeitar automaticamente o filtro de data.
- Garantir que posts sem `publishedAt` sejam ignorados (já são) e que o cálculo use apenas posts dentro do range.

## 6. Filtro de data em todas as métricas
Auditar chamadas:
- `getDashboard` → já passa `range` ✔
- `getTopPosts` → passará `range` (item 4)
- Cache keys em `service.server.ts` para `top`/`posts` incluirão `s/u` do range para evitar contaminação entre janelas.
- Insights do Brain: filtrar por `created_at` dentro do range no `brain.insights.list` (parâmetro `since/until`) ou pós-filtro no array.

## 7. Brain escopado ao cliente ativo
Em `getBrandSocialTopPayloadFn`, na chamada `brain.insights.list`:
- Passar `clientId: data.clientId` no contexto quando presente.
- Se a API `brain.insights.list` não aceitar `clientId`, adicionar filtro `.eq("client_id", clientId)` na query subjacente (verificar `src/lib/brain/api`).
- Frontend permanece igual — apenas recebe insights já filtrados.

## Detalhes técnicos

**Arquivos a editar:**
1. `src/lib/social-analytics/brand-dashboard.functions.ts` — comparativo período anterior, range em top posts, filtro Brain por clientId, slice 10.
2. `src/lib/social-analytics/service.server.ts` — `getTopPosts` aceita `range`, cache key inclui since/until.
3. `src/lib/social-analytics/providers/meta.server.ts` — se necessário, propagar `range` para filtrar `publishedAt` no top posts.
4. `src/lib/brain/api` (verificar) — suporte a `clientId` em `insights.list`; se ausente, adicionar param.
5. `src/components/analytics/social-analytics-dashboard.tsx` — refactor de `FormatPerformanceCard`, `TimeSeriesCard`, delta visual nos KPIs (já suportado via `sub`), limite de 10 no grid.

**Fora de escopo:** mudanças no seletor de datas, permissões, ou nas outras rotas de analytics fora de `/analytics`.
