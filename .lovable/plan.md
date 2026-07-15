
# Módulo de Plano de Mídia Paga

Dois pontos de convenção que ajustei do brief para casar com o projeto:

- A rota interna usa o padrão atual `customers/$customerId`, não `clients/:id`. Fica `/customers/$customerId/media-plan`.
- A rota pública fica `/plano/$planId` e o token vai como query string (`?token=...`), lido via RPC `security definer` — mesmo padrão que já usamos em `/portal/$token` e `/approval/$token`, sem exigir login.

## 1. Schema (migração Supabase)

Duas tabelas novas em `public`, escopadas por `brand_id + client_id` (multi-tenant), com RLS por membership da marca e `GRANT` completo.

`public.media_plans`
- `id uuid pk`, `brand_id uuid fk brands`, `client_id uuid fk clients`
- `title text` (ex.: "Plano Q1 2026")
- `period_start date`, `period_end date` (representa o campo `period` de forma consultável)
- `monthly_budget numeric(14,2) not null default 0`
- `status text not null default 'draft'` — enum lógico `draft | approved | archived`
- `share_token text unique` (gerado on-demand via RPC ao publicar/compartilhar)
- `share_expires_at timestamptz null`
- `created_by`, `created_at`, `updated_at`

`public.media_plan_items`
- `id uuid pk`, `plan_id uuid fk media_plans on delete cascade`
- `position int not null default 0` (drag-to-reorder)
- `product_service text`, `campaign_type text`, `funnel_stage text check in ('topo','meio','fundo')`
- `objective text`, `main_kpi text`, `channel text`
- `audience text`, `budget_pct numeric(5,2) default 0`, `budget_amount numeric(14,2) default 0`
- `keywords text[]`, `benchmark text`, `other_refs text`
- timestamps

RPCs `security definer` para o portal público (não expõem outros planos):
- `media_plan_public_resolve(_token text)` → dados do plano + cliente + marca (só campos safe)
- `media_plan_public_items(_token text)` → items ordenados

Triggers:
- `log_media_plan_activity` opcional em `activity_events` para auditoria da mudança de status.
- Trigger `update_updated_at_column` nas duas tabelas.

RLS:
- `media_plans` / `media_plan_items`: SELECT/INSERT/UPDATE/DELETE apenas para `is_brand_member(brand_id, auth.uid())` ou super admin.
- Acesso público é feito **exclusivamente** pelas RPCs `security definer` acima (validam token + expiração), nunca por policy `TO anon` nas tabelas.

## 2. Server functions (`src/lib/media-plans.functions.ts`)

Todas com `requireSupabaseAuth`, escopadas por brand/client:
- `listMediaPlans({ clientId })`
- `getMediaPlan({ planId })` → header + items
- `createMediaPlan({ clientId, title, period_start, period_end, monthly_budget })`
- `updateMediaPlan({ planId, patch })` — inclui `status` e `monthly_budget`
- `deleteMediaPlan({ planId })`
- `upsertMediaPlanItem({ planId, item })`
- `deleteMediaPlanItem({ itemId })`
- `reorderMediaPlanItems({ planId, orderedIds })`
- `issueMediaPlanShareToken({ planId, expiresInDays })` / `revokeMediaPlanShareToken({ planId })`

Público (`src/lib/media-plan-public.functions.ts`, sem middleware, chamando as RPCs `security definer`):
- `resolveMediaPlanPublic({ planId, token })`
- `listMediaPlanItemsPublic({ planId, token })`

Regra de negócio: `budget_amount = round(budget_pct/100 * monthly_budget, 2)` é calculado **no server** em `upsertMediaPlanItem` e recalculado em massa quando `monthly_budget` muda no `updateMediaPlan`, para garantir consistência entre views.

## 3. View 1 — Operação (interna)

Arquivo: `src/routes/_authenticated/customers.$customerId.media-plan.tsx`

Layout no padrão `DashboardPageShell` + `usePageHeader` (título "Plano de mídia paga" + botões no header do app: `Novo plano`, seletor de plano ativo, `Compartilhar`, `Aprovar/Reabrir`).

Estrutura:
- **Barra de alocação** fixa no topo do conteúdo: progress bar do somatório de `budget_pct`. Verde <=100%, âmbar 95–100%, vermelho >100%. Mostra `R$ alocado / R$ orçamento` e `X% distribuído`.
- **Filtros**: `Select` por `funnel_stage` (Topo/Meio/Fundo/Todos) e por `channel` (dinâmico a partir dos items). Estado em search params (`validateSearch` + `Route.useSearch`), não `useState`.
- **Tabela editável inline** (`@dnd-kit/sortable` já disponível no projeto): uma linha por item, com handle de drag à esquerda.
  - Colunas: Produto/Serviço, Tipo de campanha (Select), Etapa do funil (Select topo/meio/fundo), Objetivo, KPI principal, Canal (Select com opções pré-definidas + custom), Público, `% orçamento` (Input numérico), `R$` (readonly, calculado), Palavras-chave (chips), Benchmark, Outras refs, botão excluir.
  - Selects são `<select>` nativo estilizado (dropdown nativo, conforme pedido).
  - Persistência: debounce de 500ms por linha chamando `upsertMediaPlanItem`; ao terminar drag, `reorderMediaPlanItems`.
  - Optimistic updates via TanStack Query.
- **Botão "Adicionar linha"** cria item vazio com `position = last+1`.
- Ação **Aprovar plano** (`status=approved`) só aparece nesta view.

## 4. View 2 — Apresentação (pública)

Arquivo: `src/routes/plano.$planId.tsx` (rota pública, `noindex`, sem gate `_authenticated`).

Design da identidade Pitada, **escopado ao arquivo** (mesma exceção que já aplicamos ao `/portal`): CSS variables locais + classes utilitárias inline no componente, sem tocar em `src/styles.css` global.

- Fonts: `<link>` no `head()` da rota carregando **Bebas Neue** e **DM Sans** (Google Fonts). Nunca via `@import` em `src/styles.css`.
- Paleta local (via style inline / wrapper `div style`): `--pitada-bg #080808`, `--pitada-lime #C8FF00`, `--pitada-ink #F5F5F5`, `--pitada-mute #8A8A8A`.
- Mobile-first: grid `1 col` no mobile, `2 col` em md, `3 col` em lg.

Seções:
1. **Hero**: nome do cliente, período formatado (`ptBR`), orçamento total gigante em Bebas Neue lime. Selo "Plano de mídia · {mês/ano}".
2. **Funil visual**: três blocos empilhados no mobile e lado-a-lado em desktop (Topo / Meio / Fundo). Largura/altura proporcional ao `sum(budget_amount)` do estágio vs. total. Cada bloco lista os cards do estágio dentro.
3. **Cards de campanha** (um por item): ícone do canal (Instagram/Meta/Google/TikTok/YouTube/LinkedIn/Outros — mapa em `channel-styles.ts`), tipo + objetivo em linguagem direta, valor em destaque, `%` do total, KPI principal, benchmark quando presente. Sem colunas de tabela.
4. **Donut de distribuição por canal** usando `Recharts` (`PieChart` com `innerRadius`), já em uso no `/analytics`.
5. **Footer** com marca "Pitada" e data de geração.

Interações:
- Botão **Exportar PDF**: chama `window.print()`. Adiciono `@media print` no wrapper para: ocultar header/footer do app, remover shadows, forçar cores (`-webkit-print-color-adjust: exact`), paginar cards com `break-inside: avoid`. Sem lib externa.
- **Sem** botões de edição, aprovação ou navegação interna do app.
- Loader do route chama `resolveMediaPlanPublic` + `listMediaPlanItemsPublic` em paralelo. Erros de token expirado/invalido mostram tela pública "Link indisponível".

## 5. Integração de navegação

- Adicionar aba **"Plano de mídia"** dentro de `customers.$customerId.tsx` (nova entrada em `TABS` que faz `navigate` para a subrota).
- No header da view interna, botão "Compartilhar" abre `Dialog` com URL pública (`${origin}/plano/${planId}?token=${share_token}`) + copy-to-clipboard + toggle "expira em 30 dias".
- Aprovação do plano dispara `notifications` para membros da marca (padrão já usado em `notify_task_assigned`).

## 6. Detalhes técnicos

- Ordem no cálculo do `budget_amount`: server (fonte de verdade) + eco no cliente para feedback imediato. Um `useMutation` por linha com `onMutate` optimista.
- Search params via `zodValidator` na rota interna: `{ stage?: 'topo'|'meio'|'fundo', channel?: string, planId?: string }`.
- `head()` da rota pública: título "{cliente} · Plano de mídia", `og:title`/`og:description` derivados do loader, `robots: noindex`.
- Não uso `TO anon` policies nas tabelas — apenas as RPCs `security definer` acessam publicamente.
- Toda mutação na view de operação invalida `["media-plan", planId]`, o que reflete na view pública em navegações subsequentes (a pública não precisa de realtime; refetch a cada carregamento basta).

## 7. Ordem de execução

1. Migração (tabelas + RLS + RPCs + triggers).
2. `media-plans.functions.ts` e `media-plan-public.functions.ts`.
3. Rota interna com tabela editável, drag, alocação e filtros.
4. Rota pública com identidade Pitada, funil, cards, donut e print-to-PDF.
5. Aba "Plano de mídia" no `customers.$customerId` e botão "Compartilhar".

## Pontos que valem confirmar antes de eu implementar

- **Exportar PDF via `window.print()`** com CSS de impressão está OK, ou você prefere um PDF renderizado (jspdf/html2canvas) com layout fixo?
- **Token de compartilhamento por plano** com expiração opcional (padrão 30 dias) e possibilidade de revogar — combina?
- **Fontes Bebas Neue + DM Sans via Google Fonts** na rota pública (não afeta o resto do app) — pode?
