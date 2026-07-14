## Objetivo

Separar o fluxo atual em **duas fases distintas com gate de revisão humana** entre elas:

1. **Fase Estratégia** (IA): gera briefing estruturado, voice card, personas, cohorts e SWOT. **NÃO gera pautas/ideias.**
2. **Gate de Revisão**: usuário revisa e edita (CRUD) o que a IA produziu.
3. **Fase Ideias** (IA, disparo manual): gera as pautas e injeta como cards "idea" no pipeline.

## Mudanças

### 1. Backend — `src/routes/api/jobs/customer-pipeline.ts`
- Renomear job para `customer_strategy` (kind + título "Estratégia do cliente").
- Remover das etapas: geração de `pautas`, persistência em `brand_pautas`, resolução de pipeline/stage e injeção em `posts`.
- Ao concluir, marcar `status='succeeded'` com `result.title = "Estratégia pronta para revisão"`, `target_route = /app/customers/{id}/briefing` (aba Estratégia) e progresso 100.
- Disparar `notifications` (INSERT via user client) com tipo `strategy_ready`, título "Estratégia gerada — revise antes de criar ideias", link para a rota acima. Isso alimenta o sino já existente em tempo real.

### 2. Backend — Nova rota `src/routes/api/jobs/generate-ideas.ts`
- Novo `createFileRoute("/api/jobs/generate-ideas")` (POST, bearer + `auth.getClaims`).
- Body: `{ brandId, clientId, pipelineId?, quantidade, periodo }`.
- Carrega os artefatos ativos mais recentes: `brand_briefings`, `brand_voice_cards`, `brand_personas`, `brand_cohorts`, `brand_swot` do par `(brand_id, client_id)`.
- Se **qualquer um estiver ausente**, retorna 409 com mensagem "Gere a estratégia antes de criar ideias".
- Roda apenas o step de pautas (mesmo `PautasSchema`/prompt de hoje) usando os artefatos como contexto.
- Persiste em `brand_pautas` + injeta cards em `posts` (mesma lógica de resolução de pipeline/stage/position que existe hoje em `runPhase1`).
- Emite `ai_jobs` do tipo `generate_ideas` para aparecer no indicador global. Ao final, `notifications` "N ideias adicionadas ao pipeline" com `target_route=/content`.

### 3. Frontend — `src/components/brand-hub/briefing-workspace.tsx`
- Renomear o botão atual "Gerar estratégia com IA" (mantém o `AlertDialog` de confirmação) — já dispara o endpoint acima.
- Adicionar **novo botão "Gerar ideias de conteúdo"** ao lado, com estados:
  - **Disabled** (com tooltip "Gere a estratégia primeiro") quando qualquer artefato estratégico estiver faltando.
  - **Enabled** quando existem: voice_card + personas + cohorts + swot ativos.
- Ao clicar: `AlertDialog` "Isso vai criar N pautas no pipeline em /content. Confirmar?" com input de quantidade (default 8) e período (default "próximos 15 dias"). Dispara a nova rota.
- Ambos os botões abrem o indicador de jobs para acompanhamento.

### 4. Frontend — `src/components/customer/customer-dashboard.tsx`
- Ajustar o CTA "Gerar Plano do Mês" para respeitar o mesmo gate: exige artefatos estratégicos (não apenas briefing preenchido).
- Adicionar um card/banner discreto quando estratégia foi gerada mas ainda não houve ideias: "Estratégia pronta — revise em Briefing → Estratégia e clique em Gerar ideias".

### 5. Frontend — Strategy Panel (`src/components/ai-agents/strategy-panel.tsx`)
- Já tem leitores tolerantes. Confirmar que cada aba (Voice, Personas, Cohorts, SWOT) expõe ação **Editar** que persiste via as functions existentes em `src/lib/ai-agents.functions.ts` (ou criar `updateVoiceFn`/`updatePersonasFn`/`updateCohortsFn`/`updateSwotFn` caso ainda não existam, gravando `data` + `is_active=true` e desativando o anterior).

### 6. Notificações
- Nenhuma migração necessária — a tabela `notifications` e o realtime já estão ativos. Apenas usar os tipos novos `strategy_ready` e `ideas_ready` no payload.

## O que **não** muda

- Schema do banco.
- Fluxo de aprovação de posts (`/content`).
- Monthly plan (`monthly-plan.ts`) continua independente para o plano mensal automatizado por volumetria.

## Resultado

- Clique 1 → IA monta a estratégia → notificação → usuário revisa/edita.
- Clique 2 (manual, após revisão) → IA gera ideias já contextualizadas pela versão editada da estratégia → cards aparecem em `/content` para aprovação.
