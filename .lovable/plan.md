## Diagnóstico (não confirmado ainda no runtime)

Estado verificado até agora:
- A marca ativa tem 1 conexão Meta real (`superiaofc`, provider=`meta`, IG business vinculado, `status=active`, token presente) — os dados existem no banco.
- A rota `/analytics` → `SocialAnalyticsDashboard` → `getBrandSocialDashboardFn` → `SocialAnalyticsService.getDashboard/getTopPosts` → `MetaProvider` (`src/lib/social/providers/meta.server.ts`) → `MetaAnalyticsProvider` (`src/lib/social-analytics/providers/meta.server.ts`) → Graph API `v21.0`.
- O provider Meta engloba TODAS as chamadas de insights num helper `safe()` que **converte qualquer erro em `warning` e devolve `null`**. Isso zera silenciosamente todos os totais e séries quando a Graph rejeita métricas, então a UI renderiza "0" ou vazio sem sinal de erro.

Causa suspeita (a confirmar como passo 1 do plano): a partir da Graph API v19 (abr/2024) e v22 (set/2024) a Meta descontinuou várias métricas que o código ainda pede — no Instagram Business (`impressions`, `profile_views`, `website_clicks`) e no Facebook Page (`page_impressions`, `page_engaged_users`, `page_post_engagements`). Como o app usa v21, os endpoints já retornam `400 (#100) metric ... is not valid` para essas keys — o `safe()` engole tudo e a dashboard fica zerada.

Não vou afirmar isso como causa antes de rodar a diagnose.

## Plano

### 1. Diagnóstico ao vivo (obrigatório antes de qualquer edição)
- Adicionar logs temporários em `MetaAnalyticsProvider.safe()` para imprimir `label`, mensagem crua e `graph.error.code`/`error_subcode` sempre que uma chamada falhar.
- Executar `/api/social/dashboard/c793392c-…?period=30d` autenticado (via preview) e coletar os warnings reais.
- Confirmar quais métricas retornam erro e quais retornam dados. A partir daí, o plano abaixo se aplica só ao que estiver quebrado — nada é substituído "no escuro".

### 2. Atualizar vocabulário de métricas para a Graph API atual

Instagram Business — trocar chamadas `/{ig_id}/insights` para o novo schema:
- `impressions` → `views` (com `metric_type=total_value`)
- `reach` → mantido, mas exige `metric_type=total_value` + `period=day`
- `profile_views` → `profile_views` sob `total_value`
- `website_clicks` → `website_clicks` sob `total_value`
- Adicionar `accounts_engaged`, `total_interactions` como fontes canônicas de `engagement`.

Facebook Page — trocar por métricas suportadas em v21+:
- `page_impressions` → `page_impressions` (segue válida) + `page_impressions_unique` para `reach`
- `page_engaged_users` / `page_post_engagements` → `page_post_engagements` só via posts; nível página usar `page_actions_post_reactions_total`.
- Fãs: `page_fan_adds_unique` / `page_fan_removes_unique`.

Post-level IG — migrar para o novo endpoint `/media/{id}/insights?metric_type=total_value` com `views`, `reach`, `likes`, `comments`, `saved`, `shares`, `total_interactions`.

Todas as substituições vão para `src/lib/social-analytics/metric-mapping.ts` (INSTAGRAM/FACEBOOK) e para as listas de métricas em `MetaAnalyticsProvider.fetchInstagramAccount/fetchFacebookAccount/fetchInstagramPost/fetchFacebookPost`.

### 3. Ajustes no chamador do Graph
- `MetaProvider.graph()` já monta querystring — adicionar suporte a `metric_type` (só passa quando informado) sem quebrar as chamadas antigas.
- Em `MetaAnalyticsProvider`, quando a métrica exigir `metric_type=total_value`, mover para uma segunda chamada isolada (essa flag conflita com `period=day` em algumas métricas — precisa dividir por família).

### 4. Tornar falhas visíveis
- Propagar `warnings` do `SocialDashboard` para o `BrandSocialDashboard.warnings` (já existe) e exibir um banner discreto no topo do `SocialAnalyticsDashboard` quando `warnings.length > 0` (ex.: "Algumas métricas do Instagram não puderam ser carregadas — clique para detalhes"). Hoje o array existe mas nunca é renderizado.
- Assim regressões futuras da Graph API aparecem para o usuário em vez de silenciosamente virar zero.

### 5. Validação
- Rodar de novo `/api/social/dashboard/:id?period=30d` e conferir: `metrics.followers`, `metrics.reach`, `metrics.impressions`, `metrics.engagement` diferentes de `null`/`0`; `series` populada.
- Abrir `/analytics` no preview: os KPIs "Seguidores / Alcance / Impressões / Engajamento" devem ter valores; "Performance por canal" deve mostrar `superiaofc`; "Top publicações" listar posts recentes com thumbnail.
- Revalidar cache: como `withSocialCache` é in-memory, um restart do worker já basta; documentar isso.

## Detalhes técnicos

Arquivos que serão tocados:
- `src/lib/social-analytics/providers/meta.server.ts` (listas de métricas + `safe()` com log detalhado temporário)
- `src/lib/social-analytics/metric-mapping.ts` (traduções nativas → canônicas)
- `src/lib/meta/provider.server.ts` (suporte a `metric_type` no builder de query, se necessário)
- `src/components/analytics/social-analytics-dashboard.tsx` (banner de warnings)
- Possivelmente `src/lib/social/providers/meta.server.ts` se o `getTopPosts` também depender de métricas descontinuadas.

Fora de escopo: LinkedIn/TikTok/YouTube/X/Threads permanecem stubs; nenhum trabalho em provedores não-Meta.
