# Dashboard geral da agência — Visão operacional consolidada

Hoje o `/dashboard` em modo Agência já mostra saúde por cliente e KPIs sociais. Falta uma camada **operacional cross-client** para quem gerencia várias contas ao mesmo tempo. Este plano adiciona essa camada sem quebrar o que existe: novos widgets aparecem apenas no modo Agência (sem cliente ativo) e reutilizam as tabelas `tasks`, `posts`, `content_pipeline_stages`, `post_approvals` e `sla_rules`.

## O que muda na tela

Nova seção **"Operação da agência"** logo abaixo dos KPIs sociais, com 6 widgets organizados em grid de 2 colunas (mesmo padrão masonry atual):

1. **Tarefas atrasadas** — KPI + lista top 10 (título, cliente, responsável, horas em atraso). Clique navega para `/tasks?status=overdue`.
2. **Conteúdos em produção** — total + breakdown por etapa (Ideia, Roteiro, Design…). Clique em etapa filtra `/content`.
3. **Aguardando aprovação** — total + tempo médio parado + lista dos 10 mais antigos com botão "Abrir".
4. **SLA médio da operação** — % on-track / at-risk / overdue nas últimas 30 dias, com sparkline diário e delta vs. período anterior.
5. **Gargalos por etapa** — barras horizontais das etapas com maior lead time médio e maior taxa de overdue. Identifica onde o fluxo trava.
6. **Volume de produção da equipe** — por membro: tarefas concluídas, posts aprovados, horas registradas (timesheet), no range selecionado. Ordenável.

O `DateRangePicker` já existente no header controla todos os widgets. Filtros por cliente (multi-select opcional) ficam num popover "Filtros" ao lado, para focar em um subconjunto de contas quando necessário.

## Regras de escopo

- Visível **apenas no modo Agência** (`activeContext.clientId === null`). No modo Cliente, o dashboard continua idêntico ao atual.
- Todos os dados respeitam `brand_id` do workspace ativo e RLS existente.
- SLA usa a mesma fórmula do Kanban (`sla_hours` em `content_pipeline_stages` + `stage_entered_at` em `posts`), garantindo consistência com o que aparece em `/content`.

## Detalhes técnicos

**Backend** — novo arquivo `src/lib/agency-ops.functions.ts` com uma única server function `getAgencyOpsDashboardFn({ brandId, from, to, clientIds? })` que retorna:

```ts
{
  overdueTasks: { total: number; items: TaskLite[] };        // top 10
  contentInProduction: { total: number; byStage: StageCount[] };
  pendingApproval: { total: number; avgWaitHours: number; items: PostLite[] };
  slaSummary: { onTrack: number; atRisk: number; overdue: number; daily: DailyPoint[]; deltaPct: number };
  bottlenecks: Array<{ stageId: string; stageName: string; avgLeadHours: number; overduePct: number }>;
  teamThroughput: Array<{ userId: string; name: string; avatar: string|null; tasksDone: number; postsApproved: number; hoursLogged: number }>;
}
```

Uma query paralela por bloco (`Promise.all`), com `.middleware([requireSupabaseAuth])` e agregações no cliente Supabase (evita RPC nova). SLA e gargalos reutilizam `computeSlaStatus` já existente.

**Frontend** — novo componente `src/components/dashboard/agency-ops-section.tsx` importado por `dashboard.tsx`, renderizado condicionalmente quando `!clientId`. Cada widget é um `PanelCard` com skeleton (`PanelSkeletonList`) e `EmptyState`. Uso de `useSuspenseQuery` com `queryKey: ["agency-ops", brandId, range, clientIds]`.

**Sem migração de banco.** Todas as colunas necessárias já existem: `tasks.due_at/done/done_at/assignee_id`, `posts.stage/stage_entered_at/updated_at`, `content_pipeline_stages.sla_hours`, `task_time_entries.duration_minutes`, `post_approvals`.

## Fora do escopo

- Não altera dashboard em modo Cliente.
- Não cria novo módulo "Gestão" (essa consolidação vive no próprio Dashboard).
- Não mexe em métricas sociais (Meta/Analytics) — já são multi-conta em modo Agência.
