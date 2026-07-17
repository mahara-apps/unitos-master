# Refatoração completa — Módulo de Tarefas

O escopo da mensagem é grande demais para uma única entrega segura (17 seções, novas tabelas, virtualização, drag&drop, campos customizados). Proponho entregar em **4 fases incrementais**, cada uma testável, mantendo 100% do Design System UNITOS (`DashboardPageShell`, `KpiCard`, `StatCard`, paleta semântica).

---

## Fase 1 — Fundação de UI (sem schema novo)

**Entregas**
- Novo shell `/tasks` com **Views**: `Lista`, `Kanban`, `Calendário`, `Minhas tarefas` (Timeline entra na Fase 4).
- Estado das views/filtros na URL via `validateSearch` (compartilhado entre views).
- **TaskToolbar**: Nova tarefa · Filtro · Ordenar · Agrupar · Ocultar campos · Pesquisar · Exportar CSV · Mais.
- **TaskTable** com cabeçalhos fixos, colunas: ✓, Nome, Responsável, Projeto, Cliente, Prioridade, Status, Prazo, Criado em, Comentários, Anexos, Ações.
- **Agrupamento colapsável** por Status/Projeto/Responsável/Cliente/Prioridade/Data.
- **KPIs superiores refeitos**: Total · Em andamento · Atrasadas · Concluídas · Minha carga · Prazo hoje (KpiCard canônico, tons semânticos).
- Hover, seleção múltipla (checkbox no header), edição inline de título/status/prioridade/prazo, ordenação por clique.
- Componentes: `TaskToolbar`, `TaskFilters`, `TaskTable`, `TaskHeader`, `TaskRow`, `TaskStatus`, `TaskPriority`, `TaskAssignee`, `TaskProject`, `TaskBulkActions`, `TaskViews`.

**Fora desta fase**: virtualização (só se >200 tarefas por brand — decido baseado em uso).

---

## Fase 2 — Painel lateral (Drawer)

- Clique na linha abre **`TaskDrawer` (Sheet 560px direita)** — substitui o modal atual.
- Drawer permanece aberto ao navegar entre tarefas (prev/next com `J/K`).
- Seções: Título · Descrição · Status · Prioridade · Responsável · Projeto · Cliente · Datas · **Comentários** (já existe) · **Histórico/Atividade** (novo — reutiliza `activity_events`) · Anexos (placeholder Fase 3).

---

## Fase 3 — Kanban + Checklist + Subtarefas (requer schema)

**Migração Supabase**
- `task_checklist_items(id, task_id, brand_id, title, done, position, created_at)` — RLS via `brand_members`.
- `tasks.parent_task_id uuid null references tasks(id) on delete cascade` — subtarefas.
- `tasks.attachments jsonb default '[]'` — anexos leves (url + name + size).
- GRANTs + policies conforme padrão UNITOS.

**UI**
- **TaskKanban** com 5 colunas (`todo`, `in_progress`, `review`, `waiting`, `done`) — adiciono status `waiting` no enum TS.
- Drag & drop com `@dnd-kit` (já usado em `/content`), update otimista.
- `TaskChecklist` com progresso `n/m` + %.
- `TaskSubtasks` recolhíveis dentro do drawer e badge de "Nx subtarefas" na linha.

---

## Fase 4 — Extras avançados

- **TaskCalendar** (view de calendário — reusa layout de `/calendar`).
- **TaskTimeline** (roadmap simples com barras por prazo).
- **Campos personalizados** por brand: nova tabela `task_custom_fields` + `task_custom_values`, coluna dinâmica na tabela.
- Virtualização (`@tanstack/react-virtual`) se lista >200.
- Atalhos globais (`?` abre lista), colunas redimensionáveis persistidas em `user_profiles.prefs`.

---

## Design System (todas as fases)

- `DashboardPageShell` + `KpiCard` + `StatCard` canônicos.
- Prioridade: `low=sky` · `medium=neutral` · `high=amber` · `urgent=rose`.
- Status: `todo=neutral` · `in_progress=sky` · `review=amber` · `waiting=violet` · `done=emerald`.
- Overdue: badge `rose` "Atrasada" (já existe padrão em `/content`).
- Padrão de chip: `border-<color>/30 bg-<color>/10 text-<color>-700 dark:text-<color>-300`.

---

## Responsividade

- Desktop: tabela completa.
- Tablet (`md:`): oculta Criado em, Anexos, Tempo.
- Mobile (`sm:`): cards (reuso do `PostCard` como base visual).

---

## Confirmação necessária

**Pergunta:** posso começar pela **Fase 1** (fundação de UI, sem migração), entregar, e só então avançar para as fases seguintes conforme seu feedback?

Isso evita uma entrega gigante em um único turno (que tende a quebrar coisas) e te dá pontos de validação a cada fase.
