
## Objetivo

Deixar `/analytics` funcionando de ponta a ponta em ambos os modos (Agência e Cliente): KPIs com números reais, gráficos populados, grid de Top Publicações em formato de feed polido, e Insights/Timing do Brain visíveis. Manter o escopo em frontend + camada de agregação; a integração Meta em si (OAuth, tokens) não muda.

Como o Supabase deste projeto é externo (não gerenciado pela Lovable), não consigo autenticar no preview para reproduzir. O plano começa por instrumentar/diagnosticar via logs de server function para achar a causa real antes de trocar código de agregação.

## Fase 1 — Diagnóstico dirigido (sem alterar lógica)

1. **Inspecionar respostas reais do provider Meta** com `server-function-logs` filtrando por `getBrandSocialDashboardFn` e `getBrandSocialTopPayloadFn`, para descobrir se os totais chegam zerados do próprio Meta (metric_type/`views` etc.) ou se estão sendo perdidos na agregação em `brand-dashboard.functions.ts`.
2. **Instrumentar** temporariamente `svc.getDashboard`/`svc.getTopPosts` em `src/lib/social-analytics/service.server.ts` e no provider `providers/meta.server.ts` com `console.info` estruturado (network, connectionId, totalsKeys, seriesCount, topCount, warnings). Remover a instrumentação ao final da Fase 3.
3. **Registrar warnings** hoje engolidos: hoje `getTopPosts(...).catch(() => [])` esconde falhas. Trocar por `.catch(err => { warnings.push(...); return []; })` para que a UI mostre o motivo real.

## Fase 2 — Correções na agregação (`src/lib/social-analytics/brand-dashboard.functions.ts`)

Aplicar somente o que a Fase 1 confirmar. Suspeitas prováveis baseadas no código:

- **KPI "Publicações" fica sempre 0**: no `getBrandSocialDashboardFn` `totalPosts` é declarado mas nunca incrementado (só é corrigido depois no merge do payload de top posts). Contar `posts` no laço `for (const r of results)` a partir de `mv(totals,'posts')` ou de `dashboard.series` para popular imediatamente.
- **`channels[*].posts` sempre 0** → puxar da mesma fonte acima, para as barras "Performance por canal" fazerem sentido.
- **`engagementRate` cai para `null` quando `reach = 0` mas `impressions > 0`** → usar `impressions` como denominador de fallback quando `reach` for zero.
- **Séries diárias**: hoje a série soma `mv(p.metrics,'followers')` no bucket, o que estoura o eixo Y do gráfico de "Evolução temporal". Manter `followers` como snapshot do último dia (não somar) ou removê-lo da série exibida.
- **Timing (bestHours/bestDays)**: agregação é feita a partir de `post.publishedAt` do payload top. Se o Meta devolver 6 posts, os "melhores horários" ficam com amostra insignificante. Ampliar a coleta em `getBrandSocialTopPayloadFn` chamando `getTopPosts(resolved, { limit: 30 })` só para o timing e continuar usando 6-12 para o grid.

## Fase 3 — Redesign do grid de Top Publicações (polido, tipo feed)

Arquivo: `src/components/analytics/social-analytics-dashboard.tsx`, seção `TopPostsSection`.

- Substituir o grid atual (aspect-video + cards de altura variável) por um **feed uniforme estilo Instagram**:
  - Grid responsivo `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5`, gap 3.
  - **Thumb quadrada 1:1** (`aspect-square`), `object-cover`, `object-center`, com skeleton enquanto carrega e fallback com ícone da rede quando não há `thumbnailUrl`.
  - **Overlay hover** com degradê inferior mostrando: engajamento, alcance, formato e data (`Intl.DateTimeFormat('pt-BR')`).
  - Badge de rede pequeno no canto superior direito (mesmos ícones do `NETWORK_META`).
  - Clique no card abre `permalink` em nova aba (`rel="noopener"`), com `Play` sobreposto em Reels/Vídeo.
- Adicionar filtros leves acima do grid: **rede** (chips com os `data.networks`) e **ordenação** (Engajamento / Alcance / Recentes). Estado local, sem refetch.
- Empty state polido reutilizando `PanelEmptyState` com CTA "Publicar via Calendário".

## Fase 4 — Abas Produção / Equipe / Clientes

- `ProductionTab`, `TeamTab`, `ClientsTab` já existem e leem `getAnalytics` (posts/tasks internos, não Meta). Validar apenas:
  - Filtro por cliente ativo continua correto após a Fase 2.
  - `LoadingGrid` não fica preso quando `analyticsQuery.data` volta com listas vazias (mostrar `PanelEmptyState` em cada card).
- Sem mudanças estruturais nesta fase, só saneamento de empty states.

## Fase 5 — Verificação

- Rebuild + `server-function-logs` para conferir warnings zerados na resposta.
- Print antes/depois do feed, dos KPIs e do gráfico de série.
- Testar Agência (sem clientId) e Cliente (com `client_social_accounts` populado) — usando o cliente "Vereador Léo da Academia" (`475a42c5-…`) que já tem o Instagram vinculado.

## Detalhes técnicos

- **Arquivos alterados**:
  - `src/lib/social-analytics/brand-dashboard.functions.ts` (contagem de posts, engagementRate fallback, série, warnings de top, limit maior para timing).
  - `src/lib/social-analytics/service.server.ts` e `providers/meta.server.ts` (logs temporários; sem mudança funcional além do que Fase 1 revelar).
  - `src/components/analytics/social-analytics-dashboard.tsx` (redesign `TopPostsSection`, filtros locais, empty states).
- **Não altero**: `analytics.functions.ts` (produção/equipe/clientes), `client_social_accounts`, OAuth, tokens, esquema de banco.
- **Risco**: se o próprio Meta não estiver retornando `reach/impressions` para a Página conectada (permissão/insight indisponível), os KPIs continuarão baixos mesmo após o fix — nesse caso o WarningsBanner passará a mostrar o motivo (hoje é engolido).
