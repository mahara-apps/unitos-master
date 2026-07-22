# Refatoração dos Dashboards — Padrão SaaS Enterprise

Refatoração cirúrgica do Dashboard Geral (Agência) e Dashboard do Cliente para elevar a leitura executiva ao nível Linear/Vercel/HubSpot, sem tocar em regras de negócio, permissões, arquitetura, KPIs principais, barra de alertas ou Design System.

## Escopo por camada

### 1. Date Picker como fonte única (obrigatório)
- Remover qualquer subtítulo/label com "14d", "30d", "última semana" etc. em `dashboard.tsx`, `customer-dashboard.tsx`, `client-health-panel.tsx` e widgets filhos.
- Toda `queryKey` passa a incluir `range.from`/`range.to`; todo widget recebe `range` via prop — sem defaults internos.
- Backend (`dashboard.functions.ts`, `customer-dashboard.functions.ts`) passa a exigir `range` e aplica em TODAS as sub-queries (KPIs, saúde, funil, IA, atividade, aprovações, entregas, ritmo, produção).
- Ao mudar o range: `queryClient.invalidateQueries` cobre todas as chaves do dashboard.

### 2. Layout executivo (grid 2 colunas, 8px)
Ordem visual fixa:
```text
[ KPIs 4-up                                     ]
[ Barra de alertas                              ]
[ Saúde da operação        | Pipeline editorial ]
[ Distribuição de tarefas  | Publicações/canal  ]
[ Produção de conteúdo     | Tempo aprovação    ]
[ Evolução da saúde        | Heatmap editorial  ]
[ Fila de aprovações       | Próximas entregas  ]
[ Produtividade equipe     | Ranking operacional]
[ IA — consumo expandido (2 col)                ]
```
- Todos os widgets abaixo dos KPIs em `grid-cols-1 lg:grid-cols-2 gap-4`, `min-h` equivalentes por linha, padding padronizado via `PanelCard`.
- Nenhum card 100% width (exceto KPIs, alertas e IA final).

### 3. Widgets a evoluir (sem alterar KPIs nem alert bar)
- **Saúde dos clientes**: adicionar badges compactos (atrasadas, aprovações, briefings pendentes, sem agenda, última atividade, risco). Ordenação por criticidade.
- **Funil editorial**: manter gráfico; adicionar rodapé compacto com Lead Time, Conversão, Tempo médio/etapa, Taxa de publicação, Backlog.
- **IA**: expandir com custo por cliente, custo por agente, execuções, tokens, economia estimada, agente mais utilizado — todos no range.

### 4. Widgets novos (dados reais ou empty state elegante)
- Distribuição de tarefas (donut): abertas / andamento / revisão / concluídas / atrasadas.
- Publicações por canal (barras h): IG/FB/LinkedIn/TikTok/Threads/GBP/Pinterest a partir de `social_posts`.
- Aprovações por cliente (barras h): agrega `post_approvals` no range.
- Evolução da saúde (linha): série diária do score no range.
- Produção de conteúdo (área): criados/aprovados/publicados/rejeitados.
- Tempo médio de aprovação (linha): série no range.
- Gargalos do pipeline (funnel): concentração por etapa no range.
- Heatmap editorial (dia × hora): publicações reais no range.
- Produtividade da equipe (ranking): por `assignee` no range.
- Ranking operacional (4 tabs pequenas): produção / atraso / volume / backlog.

### 5. Componentes existentes a polir
- **Fila de aprovações**: adicionar chips de prioridade, responsável, tempo aguardando, cliente; ordenação por SLA.
- **Próximas entregas**: virar agenda operacional (prioridade, cliente, responsável, horário, status), obedecendo range.

### 6. Backend
- `dashboard.functions.ts`: adicionar server fns (ou estender `getAgencyDashboardFn`) que devolvem os agregados novos em UMA chamada, evitando N+1. Todas SQL passam a receber `range`.
- `customer-dashboard.functions.ts`: idem, escopado por `client_id`.
- Substituir qualquer `Math.random`, mock ou array temporário nos componentes visitados por leituras reais + empty states.

### 7. Cores padronizadas
Mapear via tokens já existentes: verde=sucesso, azul=info, laranja=atenção, vermelho=erro, roxo=IA, cinza=neutro. Zero cores ad-hoc.

### 8. Performance
- Consolidar múltiplos `useQuery` em uma única server fn por dashboard (retorno em bundle).
- `useMemo` em séries derivadas; `React.memo` nos widgets pesados (heatmap, funil).
- Skeletons e empty states em todos os widgets (padrão `PanelSkeletonList` / `PanelEmptyState`).

### 9. Responsividade
Validar breakpoints 360→1920: KPIs colapsam 4→2→1; grid 2-col vira 1-col em <lg. Nenhum overflow horizontal.

## Arquivos impactados
- `src/routes/_authenticated/dashboard.tsx` (reorganização de layout + wiring de range)
- `src/components/customer/customer-dashboard.tsx` (idem escopo cliente)
- `src/components/dashboard/client-health-panel.tsx` (badges operacionais)
- `src/lib/dashboard.functions.ts` (novos agregados no range)
- `src/lib/customer-dashboard.functions.ts` (novos agregados no range)
- Novos: `src/components/dashboard/widgets/*` — `task-distribution-donut`, `channel-mix-bars`, `approvals-by-client`, `health-trend-line`, `production-area`, `approval-time-line`, `pipeline-bottleneck-funnel`, `editorial-heatmap`, `team-productivity-rank`, `operational-rank`.

## Critérios de aceite
- Zero string de período fixo em qualquer widget.
- Todo widget recebe/reage ao Date Picker global.
- Grid 2-col consistente abaixo dos KPIs, alturas equivalentes por linha.
- Nenhum mock/hardcode/`Math.random`.
- Empty state elegante quando não há dados.
- Tokens de cor/tipografia inalterados; DS preservado.
