## Objetivo
Reordenar sidebar e habilitar criação de plano de mídia (manual e por IA) direto na tela `/media-plans`.

## Mudanças

### 1. Sidebar — reordenar `src/components/app-sidebar.tsx`
- Mover **Mídia paga** para logo abaixo de **Calendário** (nova ordem em "Operação"):
  Dashboard → Conteúdo → Calendário → **Mídia paga** → Tarefas → Projetos → Clientes → Analytics.

### 2. Tela `/media-plans` — botão "Novo plano" no header
Em `src/routes/_authenticated/media-plans.tsx`, injetar um botão primário `Novo plano` no `usePageHeader` (`rightSlot`), com menu (`DropdownMenu`) de duas ações:

- **Criar manualmente** → abre `CreateMediaPlanDialog` (novo componente).
- **Gerar com IA** → abre `AiMediaPlanDialog` (novo componente).

### 3. `CreateMediaPlanDialog` (novo)
Campos:
- Cliente (Select alimentado por `listCustomers` da workspace ativa)
- Título (default "Plano de mídia")
- Período (início/fim opcional)
- Orçamento mensal (R$)

Ao salvar chama `createMediaPlan`, invalida `["brand-media-plans", brandId]` e navega para `/customers/$customerId/media-plan?planId=…`.

### 4. `AiMediaPlanDialog` (novo)
Campos:
- Cliente (obrigatório)
- Título
- Orçamento mensal (obrigatório)
- Período (opcional)
- Objetivo/contexto do negócio (textarea, opcional — enriquece o prompt)
- Distribuição por funil (3 sliders opcionais: Topo / Meio / Fundo, default 30/40/30)

Fluxo:
1. Chama nova server function `generateMediaPlanWithAi` (ver §5).
2. Cria o plano (`createMediaPlan`) + insere itens gerados via `upsertMediaPlanItem` em lote.
3. Redireciona para o plano recém-criado.

Estado de loading premium com `Loader2` + mensagem "IA montando alocação por canal…".

### 5. Nova server function `src/lib/media-plans-ai.functions.ts`
`generateMediaPlanWithAi` (protegida por `requireSupabaseAuth`):
- Carrega contexto da marca/cliente do Supabase (nome, briefing/segmento se disponível em `brand_briefings`) para enriquecer o prompt.
- Usa **AI SDK + Lovable AI Gateway** (`createLovableAiGatewayProvider`) com `generateText` + `Output.object` (schema pequeno: `items[]` com `product_service`, `campaign_type`, `funnel_stage`, `channel`, `main_kpi`, `audience`, `budget_pct`, `keywords`).
- Modelo padrão: `google/gemini-2.5-flash` (rápido, ótimo custo/qualidade para planejamento estruturado).
- Prompt em pt-BR pede 6–10 iniciativas balanceando funil conforme distribuição informada; soma de `budget_pct` = 100.
- Retorna apenas o array de itens (a criação do plano fica no client para manter reuso do fluxo normal).

### 6. Permissões e tipagem
- `brand-media-plans` já usa `listBrandMediaPlans` — apenas invalidar após criação.
- Sem migrations. Sem mudanças de RLS.

## Detalhes técnicos
- IA segue as regras do guia: schema `Output` mínimo (sem `.min/.max`, sem enums grandes); limites textuais no prompt; try/catch com `NoObjectGeneratedError` para fallback de parsing.
- `LOVABLE_API_KEY` lido dentro do `.handler()`.
- Dropdown usa `@/components/ui/dropdown-menu` já presente.
- Dialogs seguem padrão visual "Geek Sleek" existente (headers com `Sparkles`/`Target`, botões `bg-indigo-600`).

## Fora do escopo
- Editor inline dos itens gerados antes de salvar (usuário edita depois em `/customers/$id/media-plan`).
- Streaming da geração (one-shot é suficiente para 6–10 itens).