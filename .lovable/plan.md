# Melhorias no SLA de Tarefas

Evoluir o indicador de SLA existente em três frentes: **tooltip explicativo**, **configuração granular em horas por etapa** e **filtros por status de SLA** (em dia / próximo de vencer / atrasadas) nos boards de Conteúdo e Tarefas.

## Situação atual

- SLA vive em `content_pipeline_stages.sla_days` (dias inteiros).
- Cálculo em `src/lib/content.functions.ts` deriva `is_overdue` / `days_overdue` a partir de `stage_entered_at`.
- Configuração em `/settings/sla` já permite definir dias por etapa.
- Board de Conteúdo (`content-board.tsx`) mostra badge `AlarmClock` com contagem e tooltip básico ("N tarefa(s) atrasada(s)").
- Kanban de Tarefas (`tasks/task-kanban.tsx`) marca `overdue` mas sem SLA por coluna configurável.

## O que muda

### 1. Tooltip explicativo do indicador
- Substituir o `TooltipContent` atual do badge por um bloco estruturado:
  - Título: "SLA da etapa: {label}"
  - Corpo: "Cada card pode permanecer no máximo **{sla}** nesta etapa. As {n} tarefas exibidas aqui ultrapassaram esse prazo."
  - Rodapé com link "Configurar SLA" apontando para `/settings/sla` (apenas para gestores).
- Aplicar o mesmo componente reutilizável (`SlaBadge`) no card individual (hoje `title="Atrasado há Xd"`) e no header da coluna.

### 2. SLA em horas por etapa
- Migrar unidade para horas (mais flexível). Manter compat com valores existentes.
- Nova coluna `sla_hours` em `content_pipeline_stages`; backfill = `sla_days * 24`. Mantemos `sla_days` como coluna legada de leitura por um ciclo, mas escrita passa a ser em `sla_hours`.
- Ajustar cálculo em `computeOverdue()` para trabalhar em horas.
- Tela `/settings/sla`:
  - Input numérico + seletor de unidade (h / d), persistindo sempre em horas.
  - Presets rápidos (12h, 24h, 48h, 72h, 7d) ao lado do input.
  - Exemplo visual: "Ideia · 24h · Aprovação · 48h · Design · 72h".
- Aplicar o mesmo modelo em Tarefas: nova coluna `sla_hours` em `task_stages` (ou equivalente atual) + config na mesma tela `/settings/sla`, aba "Tarefas".

### 3. Status de SLA e filtros
Introduzir três estados derivados:

| Estado | Regra |
|---|---|
| `on_track` | tempo em etapa < 80% do SLA |
| `at_risk` | 80% ≤ tempo em etapa < 100% do SLA |
| `overdue` | tempo em etapa ≥ 100% do SLA |

- Enriquecer o retorno de posts/tasks com `sla_status` e `sla_progress` (0–1).
- Adicionar filtro na toolbar (`task-toolbar.tsx` e `content-toolbar.tsx`):
  - Chips segmentados: **Todos · Em dia · Próximo de vencer · Atrasadas**.
  - Persistir no search param `sla=on_track|at_risk|overdue|all` (padrão `all`).
- Badge do card ganha variante visual:
  - Verde discreto (on_track, opcional/ocultável).
  - Âmbar (at_risk) com texto "Vence em {Xh}".
  - Vermelho (overdue) mantendo "Atrasado há {X}".
- Contagem por status no header da coluna (não só overdue): `{on} · {risk} · {late}`.

## Detalhes técnicos

**Schema**
- Migração:
  - `ALTER TABLE public.content_pipeline_stages ADD COLUMN sla_hours integer;`
  - `UPDATE ... SET sla_hours = sla_days * 24 WHERE sla_days IS NOT NULL;`
  - Idem para tabela de estágios de tasks, se aplicável.
  - Sem CHECK constraint (usa validação no server fn: 0–8760).
- RLS e GRANTs seguem o modelo já existente das tabelas.

**Server functions** (`src/lib/content.functions.ts`, `src/lib/tasks.functions.ts`)
- `computeOverdue()` → `computeSla()` retornando `{ sla_status, sla_progress, hours_in_stage, hours_over }`.
- `slaSnapshotFn` agrega por status (não só overdue).
- `updateStageSlaFn` (em `sla.functions.ts`) aceita `slaHours` em vez de `slaDays`.

**Frontend**
- Novo componente `src/components/tasks/sla-badge.tsx` reutilizado por Conteúdo e Tarefas.
- `content-toolbar.tsx` e `task-toolbar.tsx`: chips de filtro + integração com search params via `zodValidator` (`fallback(z.string(), "all")`).
- Filtros aplicados em memória sobre os arrays já retornados (mantém latência baixa).
- `settings.sla.tsx`: substituir input de dias por input+unidade com presets; exibir tabela final em formato "Xh (Yd)".

**i18n**
- Textos em pt-BR: "Em dia", "Próximo de vencer", "Atrasadas", "Vence em Xh", "Atrasado há X".

## Fora de escopo

- Notificações no bell (já existem via `cron/sla-check`); apenas se ajusta a fonte para `sla_hours`.
- SLA por cliente/projeto (`sla_rules`) — permanece como está.
- Alterar o cron de checagem além da migração de unidade.

## Entregáveis

1. Migração de schema com `sla_hours` e backfill.
2. Server fns atualizadas retornando `sla_status`/`sla_progress`.
3. Página `/settings/sla` com input em horas + presets.
4. `SlaBadge` reutilizável com tooltip explicativo.
5. Filtros segmentados na toolbar de Conteúdo e Tarefas com persistência no URL.
6. Contagem por status no header das colunas do Kanban.
