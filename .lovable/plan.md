# Content Board → Linear-grade pipeline engine

## Ponto a confirmar antes de codar

Você pediu **"strict English localization"** só para este board, mas a regra atual do projeto é **pt-BR em todos os níveis** (aplicada recentemente no dashboard, modal de boas-vindas, sidebar etc.). Vou assumir **pt-BR** para manter consistência do produto, a menos que você confirme que quer este módulo específico em inglês. Todos os rótulos do plano abaixo estão em pt-BR — se preferir inglês, troco na implementação.

---

## 1. Banco de dados (migration única)

### Novas tabelas

- `content_pipelines` — pipelines por cliente
  - `brand_id`, `client_id`, `name`, `slug`, `is_default`, `position`, `created_by`
- `content_pipeline_stages` — colunas customizáveis por pipeline
  - `pipeline_id`, `key` (slug interno), `label`, `color` (token semântico), `position`, `is_terminal`

### Alterações em `posts`

- Adicionar `pipeline_id uuid references content_pipelines(id)`.
- Adicionar `stage_id uuid references content_pipeline_stages(id)`.
- Adicionar `position int` (ordenação dentro da coluna, gaps de 1024 pra reordenar barato).
- Manter `stage` atual como fallback durante migração.

### Backfill

- Pra cada `client_id` existente com posts, criar 1 pipeline default "Pipeline principal" + 6 stages equivalentes ao enum atual (Ideia, Produção, Revisão, Aprovação, Agendado, Publicado) preservando cores.
- Mapear `posts.stage` → `stage_id` correspondente; setar `position` incremental.

### RLS + GRANTs

- `content_pipelines` / `content_pipeline_stages`: SELECT/INSERT/UPDATE/DELETE para membros da brand via `is_brand_member`.
- Grants: `authenticated` (CRUD) + `service_role` (ALL). Sem `anon`.
- Trigger `updated_at` nas duas.
- Estender `log_post_activity` para logar `pipeline_changed` e `stage_changed` usando `stage_id`.

## 2. Server functions (`src/lib/content.functions.ts`)

Todas com `requireSupabaseAuth`:

- `listPipelines({ clientId })` → pipelines + stages + contagem de posts por stage.
- `createPipeline({ clientId, name, template? })` → cria pipeline + stages default.
- `renamePipeline`, `deletePipeline` (bloqueia se for o único).
- `createStage({ pipelineId, label, color })`, `updateStage`, `deleteStage` (move posts pra stage vizinha antes), `reorderStages`.
- `movePost({ postId, toStageId, toPosition })` → recalcula `position` (rebalanceia se necessário).
- `getPostDetail({ postId })` → post + assignees + anexos + timeline (`activity_events` filtrado por `entity_id`).
- `updatePost({ postId, patch })` — patch parcial (title, copy, caption, scheduled_at, assignee, tags).

## 3. UI — `/content`

### Sub-header

```text
[Cliente] · [Pipeline ▼]  [+ Novo pipeline]           [Novo post] [Filtros]
```

- Dropdown de pipeline usa `Popover` + `Command`, com editar/excluir inline.
- Contador de posts por pipeline no dropdown.

### Board

- Colunas renderizadas a partir de `content_pipeline_stages`.
- Header da coluna: bolinha semântica + título + contador + menu `⋮` (renomear, mudar cor, excluir).
- Lane final "+ Adicionar coluna" com input inline.
- Cards ficam mais densos (título, canal, assignee avatar, data agendada, chips de status).

### DnD (performance)

- `@dnd-kit` com `PointerSensor` (activationConstraint 4px) + `KeyboardSensor`.
- `DragOverlay` renderiza clone leve (sem sombras pesadas nem sub-árvores caras).
- Coluna vira `SortableContext` isolado (`verticalListSortingStrategy`) — evita re-render global.
- `useMemo` das coleções de ids por coluna; cards em `React.memo`.
- Sem animação de layout no card arrastado (`transition: none` durante `isDragging`).
- Alvo 60 FPS: mede com Performance panel; se necessário, `will-change: transform` só no card ativo.

### Optimistic updates (TanStack Query)

- `useMutation(movePost)` com:
  - `onMutate`: `cancelQueries` + `setQueryData` atualizando a coluna localmente (move + reordena).
  - `onError`: rollback com snapshot.
  - `onSettled`: `invalidateQueries` da chave do board.
- Reordenação em lote coalescida (debounce 120ms) pra evitar N requests durante um arraste longo.

### Modal 1-click (`<PostDetailDialog />`)

- Abre no `onClick` do card (ignora se `isDragging`).
- Layout 2 colunas em desktop, stack em mobile:
  - Esquerda: título editável inline, copy/legenda (`Textarea` autoresize), anexos (upload em bucket `post-assets` — cria se necessário), agendamento.
  - Direita: pipeline/stage atuais (com trocador), assignee, canal, tags, timeline (`activity_events`), botão excluir com confirmação.
- Salvamento com autosave debounce 800ms + estado visual "Salvo".

### Column editor

- Popover no `⋮` da coluna com: input nome, `ColorPicker` de tokens semânticos (indigo/violeta/âmbar/verde/rosa/cinza), toggle "estágio terminal", ação excluir.
- Add column: input inline → cria stage com posição = último + 1024.

## 4. Estado e persistência

- Preferência de pipeline ativo por cliente salva em `localStorage` (`nf-pipeline:{clientId}` = pipelineId).
- Custom stages persistem no banco (não em localStorage).
- Realtime opcional (fase 2): channel Postgres em `posts` filtrado por `pipeline_id` pra sync entre abas.

## 5. Polimento

- Tokens semânticos existentes (sem hex hardcoded); dark/light validados.
- Skeletons por coluna enquanto o pipeline carrega.
- Badge de contagem no header de cada coluna com transição suave.
- Micro-shortcuts: `N` novo post, `Esc` fecha modal, `E` foca título.

## Arquivos

**Novos**
- `supabase/migrations/<ts>_content_pipelines.sql` (via migration tool)
- `src/lib/content.functions.ts`
- `src/components/content/pipeline-switcher.tsx`
- `src/components/content/board.tsx`
- `src/components/content/column.tsx`
- `src/components/content/card.tsx`
- `src/components/content/column-editor-popover.tsx`
- `src/components/content/post-detail-dialog.tsx`
- `src/components/content/color-dot.tsx`

**Alterados**
- `src/routes/_authenticated/content.tsx` — orquestra loader, header dinâmico e board.
- Header dinâmico (`usePageHeader`) recebe botão "Novo post".
- Possivelmente `src/lib/posts.functions.ts` para não conflitar com `movePost` legado.

## Riscos / decisões abertas

1. **Idioma** — confirmar pt-BR (recomendado) vs inglês só neste módulo.
2. **Backfill** — se houver posts em stages que não batem com o enum default, criar stage "Outros" no pipeline default.
3. **Realtime** fica pra fase 2 pra não estourar o escopo.
4. **Anexos** — assumo bucket novo `post-assets` privado com RLS por brand. Se você prefere não abrir storage agora, corto essa parte do modal.
