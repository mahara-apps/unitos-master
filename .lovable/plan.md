## Objetivo
Evoluir o módulo **Projetos** para gestão de agência: hierarquia real (Projeto → Jobs → Tarefas), templates de projetos e sistema de Timesheet com timer + apontamento manual.

## 1. Banco de dados (uma migração)
Novas tabelas em `public.` (todas com RLS por `brand_id` via `is_brand_member`, GRANTs para `authenticated`/`service_role`, `updated_at` trigger):

- **`project_jobs`** — agrupador dentro do projeto  
  `id, project_id, brand_id, name, description, color, position, created_at, updated_at`
- **`project_templates`** — modelo salvo pela agência  
  `id, brand_id, name, description, icon, is_system, created_by`
- **`project_template_jobs`** — jobs padrão do modelo  
  `id, template_id, name, description, color, position`
- **`project_template_tasks`** — tarefas padrão do job do modelo  
  `id, template_job_id, title, description, priority, estimated_minutes, position`
- **`task_time_entries`** — apontamento de horas por tarefa  
  `id, task_id, user_id, brand_id, started_at, ended_at, minutes (int, nullable enquanto timer roda), description, is_rework (bool), source ('timer'|'manual'), created_at, updated_at`
- Alterações:  
  `tasks`: adicionar `job_id uuid REFERENCES project_jobs`, `estimated_minutes int`, `total_minutes int` (cache).  
  Índices: `(project_id, job_id, position)`, `(task_id, user_id)`.

Regras: horas sempre em **minutos inteiros** no banco; formatação HH:MM apenas no front. RPC `close_time_entry(entry_id)` para calcular minutos e atualizar `tasks.total_minutes`.

## 2. Server functions
`src/lib/project-jobs.functions.ts` — list/create/update/delete/reorder de jobs.  
`src/lib/project-templates.functions.ts` — list templates, criar template a partir de projeto existente, **`instantiateTemplateFn`** que clona jobs+tarefas para um novo projeto (transação SQL via RPC).  
`src/lib/timesheet.functions.ts` — `startTimerFn`, `stopTimerFn`, `listActiveTimerFn` (apenas 1 timer ativo por usuário), `listTimeEntriesByTaskFn`, `createManualEntryFn`, `updateEntryFn`, `deleteEntryFn`, `sumProjectMinutesFn`.  
Todas com `requireSupabaseAuth` + Zod.

## 3. UI / Rotas
### `/projects` (index) — 2 abas no header
- **Projetos** (atual, mantido) — cards com progresso, agora exibindo `Σ minutos apontados / estimativa`.
- **Modelos** — grid de `ProjectTemplateCard` (nome, contagem de jobs/tarefas, botão "Usar modelo" que abre `UseTemplateDialog` para escolher cliente e nome do novo projeto).
- Botão header: dropdown "Novo" → `[Novo projeto]` `[Novo modelo]` `[A partir de modelo]`.

### `/projects/$projectId` — Overview do projeto (drill-down)
Refatoração da rota existente para split view:
- **Coluna esquerda (lista de Jobs)**: componente `JobsList` com cards de job (nome, cor, contagem de tarefas, minutos apontados). Botão "+ Novo job".
- **Coluna direita (tarefas do job selecionado)**: `JobTasksPanel` — lista das tarefas do job com:
  - Botão ▶ / ⏸ (timer) por linha, mostrando o timer ativo em vermelho pulsante.
  - Título, responsável (avatar), status, prioridade, `HH:MM apontado / estimativa`.
  - "+ Nova tarefa" inline.
- **Header do projeto** contém contador global `00:00 apontado / estimativa total` (soma reativa).
- Layout usando `ResizablePanelGroup` (shadcn resizable) — usuário pode ajustar 30/70.

### Task Detail Panel (`Sheet` à direita)
Ao clicar em uma tarefa, abre `TaskDetailSheet` com:
- Cabeçalho: título editável, status, prioridade, responsável, botão ▶.
- Tabs: **Comentários** | **Anexos** | **Timesheet** | **Histórico**
  - Comentários: reusar `task_comments` existente.
  - Anexos: placeholder inicial com upload básico (Supabase storage) — pode ser reduzido a "Em breve" se escopo apertar.
  - **Timesheet**: lista extrato (usuário/data/HH:MM/RT/descrição), soma total. Botão "+ Apontar horas" abre `TimeEntryDialog`.
  - Histórico: eventos existentes / stub.

### `TimeEntryDialog` (modal de apontamento)
Tabs no topo: **Apontamento Manual** | **Estimar**.  
Manual: Data (default hoje) · Horas HH:MM (input com máscara) · Toggle RT · Select de Tarefa (default = tarefa aberta) · Textarea descrição (obrigatório).  
Estimar: input `estimated_minutes` (HH:MM) para a tarefa selecionada.

### Timer global
Hook `useActiveTimer()` faz polling (5s) + `supabase.realtime` opcional em `task_time_entries`. Quando ativo, mostra badge fixa no header do projeto e ícone pulsante na linha da tarefa. Iniciar novo timer para outra tarefa fecha o anterior automaticamente (server-side).

## 4. Componentes novos
```
src/components/projects/
  jobs-list.tsx
  job-tasks-panel.tsx
  task-row.tsx           # com timer inline
  task-detail-sheet.tsx  # tabs (comments/attachments/timesheet/history)
  time-entry-dialog.tsx  # manual + estimar
  timesheet-list.tsx
  template-card.tsx
  templates-grid.tsx
  use-template-dialog.tsx
  timer-badge.tsx        # header global
```

## 5. Hooks
`src/hooks/use-active-timer.ts` · `src/hooks/use-timer-tick.ts` (setInterval 1s para atualizar UI enquanto rodando).

## 6. Utilidades
`src/lib/time-format.ts` — `minutesToHHMM`, `hhmmToMinutes`, `formatDuration`.

## 7. Escopo desta rodada
Entregar tudo acima **funcional**. Se algo precisar corte, cortar nesta ordem: (a) aba Anexos → placeholder; (b) aba Histórico → placeholder; (c) Realtime no timer → apenas polling.

## Detalhes técnicos-chave
- `task_time_entries`: `minutes` calculado no `stopTimerFn` como `EXTRACT(EPOCH FROM (ended_at - started_at))/60` arredondado.
- Constraint: **um único timer ativo por `user_id`** (parcial unique index onde `ended_at IS NULL`).
- `instantiateTemplateFn`: SQL RPC `SECURITY DEFINER` que faz `INSERT ... SELECT` em uma transação, respeitando `brand_id` do chamador.
- `templates` de sistema (`is_system=true`) visíveis a todas as brands; templates da brand visíveis apenas para membros.
- Botão ▶ na linha usa mutation otimista (feedback instantâneo).
