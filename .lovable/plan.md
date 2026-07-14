
# Painel de Produção (Kiiru) — MVP incremental

Escopo desta rodada: transformar `/content` num painel multi-board por cliente, com colunas 100% personalizáveis, filtros laterais, "Minhas tarefas", busca global, geração inline por IA nos campos do card e link público de aprovação por tarefa. Fica de fora (roadmap): notificações email/WhatsApp, dashboard analítico dedicado, recorrência automática, versionamento de mídia, checklist com responsável/prazo, integração de publicação nativa nas redes.

## O que muda no banco (migration única)

Hoje já existem `content_pipelines`, `content_pipeline_stages`, `posts`, `activity_events`, `portal_tokens`, `post_approvals`. Vamos estender em vez de recriar:

1. `content_pipelines` (= "painéis")
   - adicionar `color text`, `description text`, `icon text` (para o seletor topo)
   - manter `client_id` + `is_default` + `position`
2. `content_pipeline_stages` (= "colunas do Kanban")
   - adicionar `hide_in_portal boolean default false`
   - adicionar `enables_approval_link boolean default false`
   - já tem `color`, `position`, `name`, `is_default`
3. `posts` (= "tarefas")
   - adicionar `priority text` (`low|normal|high|urgent`)
   - adicionar `format text` (feed/story/reels/carrossel/…)
   - adicionar `channels text[]` (instagram/facebook/tiktok/…)
   - adicionar `tags text[]`
   - adicionar `visible_in_portal boolean default true`
   - adicionar `internal_briefing text`, `client_briefing text`, `script jsonb` (cenas)
   - adicionar `references jsonb` (até 20 itens: url, título, descrição, imagem, portal)
   - manter `copy`, `design_brief`, `reference_media`, `stage_id`, `scheduled_at`, `review_status`
4. Nova tabela `card_approval_tokens`
   - `id uuid pk`, `post_id fk`, `token text unique`, `expires_at`, `revoked_at`, `created_by`, `created_at`
   - GRANTs + RLS: leitura por membro da brand; a rota pública valida token server-side e responde via server publishable client + policy `TO anon` estreita (apenas colunas seguras via view).
5. Nova tabela `card_approval_events`
   - `id uuid pk`, `post_id`, `token_id`, `verb` (`viewed|approved|rejected|changes_requested|commented`), `comment text`, `ip inet`, `user_agent text`, `created_at`

Realtime já habilitado em `posts` e `content_pipelines`; adicionar `card_approval_events` para atualizar o histórico ao vivo.

## Backend (server functions + server route público)

- `src/lib/boards.functions.ts` — CRUD de painéis (create/rename/duplicate/delete/reorder) e de colunas (com flags `hide_in_portal` e `enables_approval_link`). Reaproveita `content_pipelines`/`content_pipeline_stages` existentes.
- `src/lib/content.functions.ts` — estender com:
  - `listBoardTasksFn({ boardId, filters })` (responsável, tags, canal, formato, prioridade, data, portal, aprovação, "minhas tarefas", busca full-text)
  - `updateTaskFieldsFn` (autosave dos novos campos)
  - `createApprovalTokenFn({ postId, ttlDays })` / `revokeApprovalTokenFn`
- `src/lib/ai-copilot-inline.functions.ts` (novo) — 4 wrappers finos que reusam o motor atual (`ai-agents.functions.ts`) e o brand blueprint:
  - `generateCaption` → `copywriter_senior`
  - `generateHashtags` / `generateCTA` / `generateTitle` → prompts curtos derivados do mesmo agente
  - `generateScript` → novo prompt `roteirista_social` inserido em `agent_prompts`
  - `generateInternalBriefing` → `briefing_extractor`
  - Todos recebem `postId` + `mode` e devolvem string/JSON, injetando brand context via `buildBrandContextBlueprint`.
- `src/routes/api/public/approval.$token.ts` — GET (dados do card sanitizados), POST (approve/reject/changes/comment). Rate-limit simples por IP em memória do worker, log em `card_approval_events`, e escrita via `supabaseAdmin` carregado dentro do handler.

## Frontend

- `src/routes/_authenticated/content.tsx` — refactor:
  - Header com **BoardSwitcher** (Select com cor+nome, "+ Novo painel", "Gerenciar painéis").
  - Toolbar: busca global (debounced), botão "Minhas tarefas" (toggle), botão "Filtros" (abre Sheet lateral).
  - Kanban existente (@dnd-kit) passa a ler colunas dinâmicas do board ativo; sem hardcode das 6 stages.
- `src/components/content/board-manager-dialog.tsx` — CRUD de painéis + colunas (drag reorder, cor, flags portal/aprovação, "duplicar", "replicar para outros painéis do cliente").
- `src/components/content/filters-sheet.tsx` — filtros laterais persistidos em URL search params.
- `src/components/content/post-detail-dialog.tsx` — expandir para layout 2 colunas em tela cheia (Sheet full):
  - Esquerda: abas **Legenda / Briefing interno / Briefing cliente / Roteiro / Mídias / Referências / Comentários / Publicação**. Cada aba de texto tem `AiFieldButton` (✨) que abre popover com {objetivo, tom, persona, qtd, idioma} e insere o resultado no editor (streaming visual via job em background já existente).
  - Direita: painel de metadados (coluna, painel, projeto, responsáveis, autor, prazo, prioridade, tags, portal on/off, canais, formato, botão **Gerar link de aprovação** quando a coluna atual tem `enables_approval_link`).
  - Autosave por campo (debounce 600ms via `useMutation`).
- `src/components/content/references-manager.tsx` — modal com até 20 refs, flag "visível no portal".
- `src/routes/approval.$token.tsx` — rota pública (fora de `_authenticated`) que consome `/api/public/approval/$token`. Mostra legenda, briefing cliente, roteiro, mídias e refs marcadas como visíveis; ações Aprovar / Reprovar / Solicitar alterações + campo de comentário; registra IP/UA server-side.

## RBAC e multi-tenant
- Toda query nova filtra por `brand_id` + (quando aplicável) `client_id`, seguindo `use-active-context` e `use-access-role`.
- Usuários `user` só veem boards dos clientes que possuem (regra já existente em `permissions.ts`).
- Rota pública `/approval/{token}` é a única exceção: sem auth, mas escopada ao `post_id` do token e limitada a colunas seguras.

## Fora deste MVP (roadmap explícito)
- Recorrência automática de tarefas (cron + template).
- Notificações email/WhatsApp (hoje só in-app via `notifications` + realtime).
- Publicação nativa em redes sociais.
- Versionamento de mídia e comentários em mídia.
- Dashboard analítico dedicado a produtividade/tempo médio (o dashboard atual continua servindo agregados).
- Checklist com responsável+prazo (fica como checklist simples nesta rodada).

## Ordem de execução
1. Migration (extensões + 2 tabelas novas + GRANTs + RLS + realtime).
2. `boards.functions.ts` + `content.functions.ts` extensões + seed do prompt `roteirista_social` em `agent_prompts`.
3. Refactor de `content.tsx` (BoardSwitcher, toolbar, colunas dinâmicas) + `board-manager-dialog`.
4. `post-detail-dialog` novo layout 2 colunas com AiFieldButton inline e autosave.
5. `filters-sheet` + "Minhas tarefas" + busca global.
6. Rota pública `/approval/$token` + `card_approval_tokens` UI de geração no card.
7. Smoke test end-to-end via Playwright (criar board → mover card → gerar caption com IA → gerar link → aprovar como visitante).
