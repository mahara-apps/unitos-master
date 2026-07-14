# Painel de Produção Unificado — Kanban + Calendário + Cérebro de Agentes

## Diagnóstico do que já existe

- **Kanban** (`/content`): funcional, com 6 estágios, drag-and-drop, criação de posts, edição em drawer, aprovação (`review_status = approved`). Faltam ações explícitas de **refazer** e **excluir** no cartão, e o botão de aprovar dispara Fase 2 do pipeline mas não sinaliza claramente o estado.
- **Calendário** (`/calendar`): apenas placeholder "Em breve".
- **Agentes IA** (`/agents`): apenas placeholder. Já existem 9 prompts em `agent_prompts` e o orquestrador `monthly-plan` gera pauta, mas não há tela para visualizar/executar/monitorar os agentes nem para gerar pauta conforme volume mensal do cliente.
- **Volume mensal**: campo `brand_hub.volumetria` já existe no briefing, mas o Planner não recebe explicitamente "gerar N posts".
- **Posts** têm `scheduled_at` e `published_at` no schema — base pronta para o calendário.

## O que vou construir

### 1. Kanban de produção — reforço de ações
Adicionar ao `PostCard` e ao `PostDetailDialog`:
- **Aprovar** (já existe, tornar botão primário visível no cartão em hover).
- **Refazer**: reseta `review_status → 'rework'`, move card de volta ao estágio "Em revisão" e dispara nova execução do Copywriter+Art Director (Fase 2) com feedback opcional em campo de texto.
- **Excluir**: soft-delete com confirmação.
- Badge de status (`pending` / `approved` / `rework` / `published`) no canto do card.

### 2. Calendário editorial (`/calendar`)
Nova tela substituindo o placeholder:
- Visão **mês / semana / lista** (react-day-picker + grid custom).
- Fetch de posts com `scheduled_at` no intervalo visível, agrupados por dia.
- Filtros: cliente (usa switcher global), canal (Instagram/LinkedIn/etc.), status.
- Cada evento mostra: capa, título, canal, badge de status.
- Clique → abre o mesmo `PostDetailDialog` do Kanban (aprovar/refazer/excluir/editar `scheduled_at`).
- Arrastar evento entre dias → atualiza `scheduled_at` (mutation otimista).
- Botão "+ Agendar post" abre criação rápida no dia selecionado.

### 3. Cérebro de Agentes (`/agents`)
Nova tela consolidando o vault de `agent_prompts`:
- **Grid de agentes** (9 já cadastrados): card por agente com nome, descrição, modelo, últimas execuções (do `ai_jobs`).
- Cada card: ver prompt (read-only), ver histórico de runs, botão "Executar" para agentes standalone (Cérebro de Marca, Analista de Instagram, etc.) com seletor de cliente.
- **Painel "Sugerir pauta mensal"** no topo:
  - Seletor de cliente (ou usa contexto global).
  - Lê `brand_hub.volumetria` (posts/mês) — editável inline.
  - Distribui em canais conforme `brand_hub.canais`.
  - Botão **"✨ Gerar N posts do mês"** dispara `monthly-plan` já existente, agora passando `postsCount` explícito para o Planner (hoje é implícito).
  - Após execução: pauta aparece com propostas de `scheduled_at` sugeridas (distribuição uniforme no mês) → usuário aprova em lote e cards entram no Kanban + Calendário.

### 4. Ajustes de backend
- **Migration**: adicionar valor `'rework'` ao enum/coluna `review_status` (se ainda não existir) + coluna `deleted_at` para soft delete em `posts`.
- **Server fn** `reworkPost` em `content.functions.ts`: seta status, move de estágio, enfileira novo job Fase 2.
- **Server fn** `softDeletePost` (filtrar `deleted_at IS NULL` nos SELECTs existentes).
- **Server fn** `listScheduledPosts({ from, to, clientId? })` para o calendário.
- **Server fn** `runAgent({ agentId, clientId, input })` genérica que resolve prompt do vault + Brand Blueprint + roda via gateway.
- **Orquestrador** `monthly-plan`: aceitar `postsCount` e `distributionHint` (canais/frequência) no payload; distribuir `scheduled_at` sugeridos ao inserir posts.

### 5. Navegação (sidebar)
- Manter grupo **Operação**: Dashboard, Produção (Kanban), **Calendário** (ativo), Projetos, Tarefas.
- Manter grupo **Inteligência**: **Agentes IA** (ativo), Analytics, Relatórios.

## Detalhes técnicos

**Arquivos criados**
- `src/routes/_authenticated/calendar.tsx` — layout + tabs mês/semana/lista.
- `src/components/calendar/editorial-calendar.tsx` — grid + DnD.
- `src/components/calendar/day-cell.tsx` + `post-event-chip.tsx`.
- `src/routes/_authenticated/agents.tsx` — grid + painel de pauta mensal.
- `src/components/ai-agents/agent-card.tsx`, `agent-run-history.tsx`, `monthly-plan-generator.tsx`.
- `src/lib/calendar.functions.ts`, `src/lib/agents.functions.ts`.
- `supabase/migrations/*_posts_rework_and_softdelete.sql`.

**Arquivos editados**
- `src/components/content/content-board.tsx` — botões Aprovar/Refazer/Excluir no card + badge de status.
- `src/components/content/post-detail-dialog.tsx` — ação Refazer com campo de feedback + Excluir.
- `src/lib/content.functions.ts` — filtro `deleted_at IS NULL`, novas mutations `reworkPost`, `softDeletePost`, `updateScheduledAt`.
- `src/routes/api/jobs/monthly-plan.ts` — aceitar `postsCount` + gerar `scheduled_at`.
- `src/components/app-sidebar.tsx` — apenas garantir ícones/rótulos dos itens já existentes.

**Dependências**: nenhuma nova (usa `@dnd-kit`, `date-fns`, `react-day-picker`, shadcn já presentes).

**Segurança/RLS**: novas fns usam `requireSupabaseAuth` + `is_brand_member`; soft-delete e rework respeitam escopo por `client_id`.

## Fora do escopo (fica para próxima iteração)
- Publicação real em redes sociais (integração Meta/LinkedIn API).
- Notificações push por evento de calendário.
- Aprovação externa via portal do cliente (portal já foi removido conforme decisão anterior).

Posso implementar? Se sim, sigo pela ordem: migration → backend fns → calendário → ações do kanban → tela de agentes.