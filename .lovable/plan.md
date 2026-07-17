## Objetivo
Alinhar 100% a "Visão geral" de cada cliente (`src/components/customer/customer-dashboard.tsx`) à linguagem visual do Dashboard geral, reusando os 6 primitivos já publicados em `src/components/ui/` (`stat-card`, `alert-banner`, `score-list-row`, `funnel-stages`, `agent-usage-bar`, `activity-timeline-item`) — sem duplicar lógica.

## Escopo (arquivos)
- `src/components/customer/customer-dashboard.tsx` — refatoração visual.
- `src/lib/customer-dashboard.functions.ts` — apenas leituras adicionais para popular AlertBanner e breakdown por agente (sem mudar cálculo de custo existente).

## Mudanças por seção

### 1. Cards de KPI (StatCard)
Substituir o `MetricCard` local pelo `StatCard` (alias do `KpiCard`) já usado no Dashboard geral. Aplicar as mesmas regras de tom semântico:
- **Consumo de IA** — tom `violet`; sparkline no `spark` prop. Se `aiJobsCount === 0`, manter o estado vazio "Nenhuma geração ainda" mas envelopado num `StatCard` com tom `neutral` + botão CTA (preserva regra combinada no prompt anterior).
- **Aprovações pendentes** — tom `amber` se `pendingApprovals > 0`, `emerald` se `=== 0`.
- **Publicações agendadas** — tom `sky` (com fallback `neutral` quando 0), sub-texto igual ao dashboard geral.

Manter subtítulos explicativos de estado zero já em produção.

### 2. Pipeline de produção (FunnelStages)
Remover o `PipelineFunnel` local (grid de caixas) e a constante `STAGE_FALLBACK_ACCENT`. Renderizar `<FunnelStages stages={...} />` — as cores por estágio virão da `FUNNEL_STAGE_COLORS` (mesma paleta canônica do Dashboard geral). Cabeçalho do card (título + badge "Ao vivo · Sync do Kanban") permanece.

### 3. Breakdown de consumo por agente (AgentUsageBar) — novo card
Adicionar bloco "IA & performance" logo abaixo dos KPIs, com o mesmo layout do card correspondente no dashboard geral (`Card` + total 30d + sparkline + lista de `AgentUsageBar`).

Dados: novo array `aiUsageByAgent: Array<{ agent, cost, jobs }>` retornado pelo loader `loadCustomerDashboardFn`, populado a partir de `ai_jobs` filtrado por `brand_id + client_id` agrupado por `kind` (proxy de "agente"). Como `brand_ai_usage` não tem `client_id`, o custo por agente é **pro-rata** a partir do total já calculado (`costTotal30d * jobsAgente / totalJobsCliente`) — coerente com o valor exibido no StatCard e claramente rotulado como janela 30d. Se `totalJobsCliente === 0`, renderiza `EmptyState` reutilizado do dashboard.

### 4. Propriedades da conta (identidade visual dos ícones sociais)
Manter o card `AccountPropertiesCard` mas trocar o layout de linhas por instâncias de `<ScoreListRow>` uma por canal social, onde:
- `avatarLabel` = 2 primeiras letras do handle,
- `avatarColor` = cor de marca por rede (Instagram `#E1306C`, TikTok `#111`, LinkedIn `#0A66C2`, YouTube `#FF0000`),
- `name` = link para o perfil externo,
- `score` = 100 (canal ativo), sem barra dominante — usar `meta` para o `@handle`.

Como `ScoreListRow` é otimizado para score, apresentar contato principal (nome + email) num sub-bloco simples acima, usando o mesmo tipografia (`text-[10px] font-mono uppercase` para label + linha `text-sm`) — não é uma "score list".

### 5. Trilha de auditoria (ActivityTimelineItem)
Substituir `ActivityRow` (bolinha genérica) por `<ActivityTimelineItem>`. Adaptar `activityDescriptor` para retornar `{ tone, icon }` (ex.: `post.stage_changed → violet/Activity`, `post.approved → success/BadgeCheck`, `post.published → pink/Send`, `task.done → success/CheckCircle2`, alerta → `critical/AlertTriangle`).

Cabeçalho do card e comportamento de estado vazio (fallback para "Próximos passos") permanecem.

### 6. AlertBanner no topo
Antes da linha de KPIs (mas depois do `ClientHealthPanel`), renderizar uma pilha de `<AlertBanner>` com escopo do cliente. Regras (calculadas no loader):
- **critical** — cliente sem briefing preenchido há mais de 7 dias (usa `briefingRes.updated_at`).
- **warning** — aprovações pendentes há mais de 2 dias (comparar `post_approvals.created_at`).
- **warning** — tarefas atrasadas (`tasks.due_at < now() AND status !== 'done'`).
- **info** — pipeline vazio (nenhum post) se briefing já preenchido.

Nada é renderizado quando não há alertas.

## Contratos de dados adicionados ao loader
```ts
type CustomerDashboardData = {
  // ...campos atuais...
  aiUsageByAgent: Array<{ agent: string; cost: number; jobs: number }>;
  alerts: Array<{
    severity: "critical" | "warning" | "info";
    title: string;
    description?: string;
    count?: number;
    href?: string;
  }>;
};
```

## Fora de escopo
- Não alterar cálculo de `costTotal30d` nem introduzir migração em `brand_ai_usage`.
- Não mexer nas outras abas do cliente (Cadastro, Cérebro, Produção).
- Não redesenhar `ClientHealthPanel` (já compartilhado com o Dashboard geral).

## Critério de aceite
Alternar entre `/dashboard` e `/customers/$id?tab=overview` deve mostrar a mesma linguagem de card, mesma paleta por estágio de pipeline, mesmos ícones/cores por rede social, mesma estilística de banner de alerta e mesma timeline colorida por tipo de evento.