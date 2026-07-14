## Comparativo — Painel de Produção vs. Kiiru

Legenda: ✅ existe · 🟡 parcial · ❌ falta

| Área | Situação |
|---|---|
| Seletor de pipeline ("Painel de Produção ▾") | ✅ topo do header |
| Botão "+ Criar novo quadro" no seletor | 🟡 existe como "Novo pipeline" separado — falta unificar no dropdown |
| "Minhas tarefas" (filtra cards do usuário atual) | ❌ |
| "Filtros" (canal, formato, prioridade, prazo, tags, responsável) | ❌ |
| Toggle Board / Lista | ❌ |
| Botão "Colunas" (modal de configuração) | 🟡 renome/cor/exclusão inline, sem modal unificado com reorder D&D, "Link Aprovação", "Sumir do portal", "Replicar para outros quadros" |
| Toggles `enables_approval_link` / `hide_in_portal` | 🟡 já no schema, sem UI |
| Botão "Tags" (paleta de tags do quadro) | ❌ (campo `tags` existe no post, sem gestão central) |
| Avatar-filtro (responsável rápido) | ❌ |
| Botão global "+ Nova" | 🟡 só existe "+" por coluna |
| Header de coluna com gradiente topo + nome + contagem + info + ⋯ | 🟡 hoje só um bullet colorido |
| Menu ⋯ da coluna: Adicionar publicação, Renomear, Configurar SLA, Mudar cor, Excluir | 🟡 falta "Configurar SLA" |
| Modal "Nova tarefa" (Título, Canal, Formato, 4 blocos de briefing, Mídia, Etapa, Painel, Projeto, Responsáveis, Autor, Prazo, Lembrete, Prioridade, Tags, Recorrente, Visível no portal) | ❌ hoje só um input de título inline; todos os campos já existem no schema `posts` e são editáveis apenas no drawer de detalhe |
| Drag & drop entre colunas | ✅ |
| Realtime sync | ✅ |

## O que vai ser construído

### 1. Toolbar do quadro (`src/routes/_authenticated/content.tsx` + novo `content-toolbar.tsx`)

Substitui as ações atuais do header por uma toolbar acima do board, espelhando o layout Kiiru:

- **Esquerda**: seletor de pipeline com item "+ Criar novo quadro" no fim (remove botão separado); botão "Minhas tarefas" (toggle); botão "Filtros" (popover).
- **Direita**: toggle Board/Lista; botão "Colunas" (abre modal); botão "Tags" (abre modal); chip de responsável (avatar do usuário atual, toggle rápido); botão "+ Nova" (abre modal de criação completo).

Estado do filtro fica em `useState` local do `ContentReady` e é aplicado no `postsByStage` do `ContentBoard` via prop `filter`.

### 2. Modal "Configurar Colunas" (`column-config-dialog.tsx`)

- Lista de estágios com handle de arrastar (dnd-kit `useSortable`) para reordenar → chama `updateStageFn` com `position`.
- Nome editável inline, seletor de cor (paleta `STAGE_COLORS`), switches `Link Aprovação` (`enables_approval_link`) e `Sumir do portal` (`hide_in_portal`).
- Botão "+ Adicionar Coluna" e "Excluir" por linha (respeita `protect_pipeline_delete`).
- Rodapé: "Replicar para outros quadros" (multi-select de pipelines do mesmo cliente) → nova server fn `replicateStagesFn` que apaga stages não-terminais e recria a partir do template.
- "Salvar Alterações" e "Cancelar".

### 3. Modal "Nova tarefa" (`new-post-dialog.tsx`)

Substitui o input inline por um dialog completo, alimentado pelos campos já existentes no `posts`:

- Coluna esquerda: Título, seletor de Canal (multi-chip Instagram/TikTok/YouTube/LinkedIn/X/Facebook/Threads/Blog/Material Gráfico), Formato (Feed/Reels/Story/Carrossel), 4 tabs de briefing (Legenda→`copy`, Briefing interno→`internal_briefing`, Briefing do cliente→`client_briefing`, Roteiro→`script`), upload de Mídia (`reference_media`).
- Coluna direita: Etapa (`stage_id`), Painel (`pipeline_id`), Projeto (`project_id`, opcional), Responsáveis, Autor (auto), Prazo (`scheduled_at`), Lembrete (novo campo `remind_at` — precisa migration), Prioridade (`priority`), Tags (multi), Recorrente (novo campo `recurrence` jsonb — migration), toggle "Visível no portal" (`visible_in_portal`).
- Reaproveita `createPostFn` estendido com os campos novos + upload posterior via `uploadPostReferenceMediaFn`.

### 4. Modal "Tags do quadro" (`tags-manager-dialog.tsx`)

- Lista de tags únicas usadas nos posts do pipeline (agregação client-side sobre `board.posts.tags`).
- Permite renomear/excluir em massa (nova server fn `renameTagFn` / `deleteTagFn` que atualiza `posts.tags` do pipeline).

### 5. Coluna do board (`content-board.tsx`)

- Substitui o bullet colorido por uma **faixa de gradiente no topo** (2–3 px, cor do estágio) preservando a UX Vercel/Stripe do projeto.
- Adiciona ícone `Info` com tooltip mostrando SLA e flags (`Portal oculto` / `Aprovação ativa`).
- Menu ⋯: adiciona "Configurar SLA" (abre popover: dias-limite → armazenado em `content_pipeline_stages.sla_days`, migration abaixo).
- Card exibe badge de prioridade + primeiras tags + avatar do responsável.

### 6. Vista Lista

- Componente `content-list-view.tsx`: tabela virtualizada (título, canal, formato, prazo, responsável, etapa, prioridade, tags), ordenável, com clique abrindo o mesmo `PostDetailDialog`.

## Detalhes técnicos

**Migração Supabase** (`supabase--migration`):

```sql
ALTER TABLE public.content_pipeline_stages
  ADD COLUMN IF NOT EXISTS sla_days integer;

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS remind_at timestamptz,
  ADD COLUMN IF NOT EXISTS recurrence jsonb,
  ADD COLUMN IF NOT EXISTS assignees uuid[] DEFAULT '{}'::uuid[];
```

RLS já herdada de brand/client scope; sem novas policies.

**Server functions novas em `src/lib/content.functions.ts`**:
- `reorderStagesFn({ pipelineId, order: stageId[] })`
- `replicateStagesFn({ sourcePipelineId, targetPipelineIds })`
- `updateStageFn` — aceitar `sla_days`, `enables_approval_link`, `hide_in_portal` no patch (validador já parcialmente existe).
- `createPostFn` — aceitar todos os campos do modal (priority, format, tags, briefings, script, references, project_id, remind_at, assignees, visible_in_portal, scheduled_at).
- `renameTagFn` / `deleteTagFn` — bulk update em `posts.tags` do pipeline.

**Filtros e "Minhas tarefas"**: aplicados client-side no `ContentBoard` sobre `postsByStage` sem re-fetch (mantém realtime). Estado persistido em `sessionStorage` por pipeline.

**Padrão visual**: mantém tokens semânticos OKLCH do design system; gradientes de coluna via `bg-[linear-gradient(...)]` derivados de `COLOR_MAP`; nada hardcoded.

**Fora do escopo**: reformulação do `PostDetailDialog` (segue funcional), tela de list-view sem virtualização (tanstack-table simples), analytics agregados por pipeline.

## Ordem de execução

1. Migration Supabase (colunas novas).
2. Estender server functions (`content.functions.ts`).
3. `column-config-dialog.tsx` + integração no toolbar.
4. `new-post-dialog.tsx` + integração no toolbar e botão "+ Nova".
5. Filtros + "Minhas tarefas" + chip de responsável.
6. Gradiente e SLA nas colunas.
7. Toggle Board/Lista + `content-list-view.tsx`.
8. Modal de Tags.
9. Validação end-to-end com Playwright (criar tarefa → mover → filtrar → aprovar).
