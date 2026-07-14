## Objetivo

Criar `/analytics` com 4 abas (Redes Sociais · Produção · Equipe · Clientes), inspirada nas referências, com dados **reais** vindos do Supabase (posts, tasks, aprovações, conexões, projetos e membros).

## Escopo dos dados

Todas as métricas são calculadas server-side em `src/lib/analytics.functions.ts`, escopadas por `brandId` + `clientId` opcional + intervalo de datas.

### Aba Redes Sociais
- **KPIs**: Posts publicados, Engajamento médio/post, Crescimento líquido (deltas por período), Plataformas conectadas (via `brand_connections`).
- **Comparativo por plataforma**: contagem de posts publicados por canal, agrupado a partir de `posts.channels`.
- **Melhor momento pra postar**: agrupa `posts.published_at` por dia da semana × hora (usa `posts` publicados). Se < 5 publicados, mostra empty state igual à referência.
- **Performance por formato**: contagem por tipo (feed/reels/story/carrossel) via `posts.format` e `post_placements`.
- **Top posts**: lista de publicados mais recentes.
- *Nota de honestidade*: seguidores, alcance e taxa de engajamento **reais** exigem integração Instagram Graph API que ainda não existe. Vou mostrar cards com estado "Conecte uma rede para ver" quando não houver métricas persistidas, em vez de inventar números.

### Aba Produção
- **KPI cards**: Entregues no prazo, Atrasadas, Aguardando aprovação (posts com `stage=review`).
- **Funil de produção**: contagem de posts por `stage` (ideia → em produção → em revisão → aguardando aprovação → aprovado → agendado → publicado).
- **Por canal**: barras horizontais com posts por canal.
- **Velocidade média**: média `published_at - created_at` para posts publicados no período.
- **Por tipo de conteúdo**: barras por `posts.format`.
- **Produção ao longo do tempo**: linha (criadas × concluídas × aprovadas) por dia usando `posts.created_at`, `published_at`, `post_approvals`.

### Aba Equipe
- **Visão geral**: por membro (`brand_members` + `user_profiles`) — abertas, atrasadas, velocidade média (`done_at - created_at`), % no prazo, % retrabalho (tasks reabertas contando `activity_events`).
- **Onde tá travando por pessoa**: agrupa tasks abertas por `status` por membro.
- **Resumo da equipe**: KPIs agregados (velocidade média, pontualidade geral, taxa de retrabalho, dependência do maior membro).

### Aba Clientes
- **Saúde por marca**: por cliente (`clients`) — dias médios de aprovação, número de ajustes (comentários), frequência de posts, score composto 0-100.
- **Alertas**: heurística — pendentes > 3 dias, atrasos > 0, sem publicações há 14 dias.
- **Gargalos de aprovação**: lista de posts em `review` há mais tempo.
- **Taxa de aprovação no prazo**: % aprovados antes da `scheduled_at`.

## Filtros globais (header)
- Range: Últimos 7 / 30 / 90 dias / Personalizado (persistido em `search params` com `zodValidator`).
- Sheet "Filtros": Painel de Produção (pipeline), Marcas (cliente), Responsável, Projeto, Tags, Tipo de conteúdo, Canais.
- Chip "Limpar" reseta filtros.
- Botão "Exportar PDF" usa `window.print()` com CSS `@media print` na primeira versão (funcional, sem lib externa).

## Estrutura de arquivos

```text
src/lib/analytics.functions.ts        # 4 server fns: getSocialAnalytics, getProductionAnalytics, getTeamAnalytics, getClientsAnalytics
src/routes/_authenticated/analytics.tsx           # layout + validateSearch + tabs
src/components/analytics/
  ├── filters-bar.tsx                 # tabs + range + filtros sheet
  ├── kpi-card.tsx                    # cards coloridos gradient
  ├── social-tab.tsx
  ├── production-tab.tsx
  ├── team-tab.tsx
  └── clients-tab.tsx
```

## Padrões técnicos
- Server fns com `requireSupabaseAuth`, `zod` no `inputValidator`, retornam DTOs simples.
- `queryOptions` + `ensureQueryData` no loader do route, `useSuspenseQuery` nas tabs, Suspense skeletons.
- Charts com `recharts` (já usado). Cards seguem tokens semânticos.
- Header dinâmico via `PageHeaderProvider` (título "Analytics", ação "Exportar PDF").
- Sidebar já tem link `/analytics` — só criar a rota.

## Fora de escopo (marcado como "requer conexão")
- Seguidores reais / alcance real do Instagram (não há tabela de insights). Vou deixar cards prontos que passam a mostrar dados quando integrarmos Instagram Graph API — não vou fabricar números.
