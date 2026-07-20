## Objetivo

Uma tela única onde o gestor da agência define e monitora **quanto de IA pode ser consumido**, em três camadas hierárquicas:

1. **Agência (brand)** — teto global mensal.
2. **Cliente** — teto por cliente, sempre ≤ teto da agência.
3. **Usuário** — teto por membro do time, sempre ≤ teto do cliente em que ele opera (ou geral quando não vinculado).

Cada linha mostra: gasto no período, limite configurado, % consumido e ação (editar/remover limite).

## Base de dados

Já existe `brand_ai_usage` (brand_id, agent, model, tokens, cost_usd, actor_id, created_at). Falta apenas o vínculo com cliente e a tabela de configuração de limites.

**Alteração 1 — `brand_ai_usage`**
- Adicionar `client_id uuid null references public.clients(id) on delete set null`.
- Índices: `(brand_id, created_at)`, `(brand_id, client_id, created_at)`, `(brand_id, actor_id, created_at)`.
- Todos os pontos de execução de IA (`ai-agents.functions.ts`, `monthly-plan`, chat, mídia, hook/headline) passam a gravar `client_id` quando disponível.

**Alteração 2 — nova `ai_usage_limits`**
- Colunas: `id`, `brand_id`, `scope` (`'brand' | 'client' | 'user'`), `client_id` (obrigatório quando `scope='client'` ou quando o limite de usuário é escopado por cliente), `user_id` (obrigatório quando `scope='user'`), `period` (`'monthly'` v1), `limit_usd numeric(12,4)`, `hard_stop boolean default true` (bloqueia execução ao atingir 100%; se `false` apenas alerta), `notify_at_pct int default 80`, `created_by`, timestamps.
- Uniques: `(brand_id) where scope='brand'`, `(brand_id, client_id) where scope='client'`, `(brand_id, client_id, user_id) where scope='user'` (client_id pode ser NULL para "usuário na agência inteira").
- GRANTS + RLS: leitura/edição para owner/manager da marca ou super admin (mesmo padrão de `team.functions.ts`).

**Alteração 3 — função SQL `check_ai_usage_budget(brand, client, user, period_start)`**
- Retorna, para o par (marca/cliente/usuário) que está prestes a rodar, um JSON: `{ allowed, blocked_by, spent_usd, limit_usd, pct }` avaliando na ordem **user → client → brand**. Fica em `SECURITY DEFINER` e é chamada pelas server functions de IA antes de disparar o modelo.

## Server functions (`src/lib/ai-limits.functions.ts`)

- `listAiUsageOverview({ brandId, period })` — retorna a árvore:
  - Nó agência: `spent`, `limit`, `pct`.
  - Nós de cliente: um por cliente ativo da marca com `spent`, `limit`, `pct`.
  - Nós de usuário: agrupados por cliente (ou "Sem cliente vinculado") com `spent`, `limit`, `pct`.
- `upsertAiUsageLimit({ scope, brandId, clientId?, userId?, limitUsd, hardStop, notifyAtPct })` — valida hierarquia (client ≤ brand; user ≤ client se houver).
- `deleteAiUsageLimit({ id })`.
- Todas com `requireSupabaseAuth` + gate padrão (membro/dono/super admin, replicando o padrão que acabamos de aplicar em `getAnalytics`).

## Enforcement

Introduzir helper `assertAiBudget({ supabase, brandId, clientId, userId })` chamado no início de cada handler de IA (agentes, chat, geração de mídia, hook/headline, monthly-plan). Se `hard_stop` estourou, `throw new Error("ai_budget_exceeded:<scope>")`. O front trata o erro com toast: "Limite de IA atingido para <escopo>. Ajuste em Configurações → IA → Limites."

## UI — `/settings/ai/limits`

Nova rota autenticada, com o padrão `DashboardPageShell` e a estética Geek Sleek já definida no DESIGN_SYSTEM.md.

Layout: um card "Uso da Agência" no topo (KPI grande + barra de progresso + botão "Definir limite") e, abaixo, uma **tabela hierárquica expansível** com colunas: **Escopo · Gasto no período · Limite · % · Ação**.

```text
▼ Agência — Studio XPTO                 $ 128,40 / $ 500,00   26%   [Editar]
  ▼ Cliente — Padaria Central           $  62,10 / $ 150,00   41%   [Editar]
        Usuário — Ana Souza             $  40,20 / $  60,00   67%   [Editar]
        Usuário — João Lima             $  21,90 /    —              [Definir]
  ▶ Cliente — Loja Verde                $  30,00 /    —              [Definir]
  ▶ Sem cliente vinculado               $  36,30 / $ 100,00   36%   [Editar]
```

Interações:
- Seletor de período (Este mês / Últimos 30 dias / Mês passado).
- Dialog "Definir limite" com valor em USD, toggle "Bloquear execução ao estourar" e slider "Notificar em %".
- Validação inline impedindo salvar limite de cliente maior que o da agência (mesma regra no servidor).
- Badge de status: "Dentro do orçamento" (< notify_at_pct), "Atenção" (≥ notify_at_pct), "Bloqueado" (≥ 100% com hard_stop).

Entrada na navegação: item **"Limites de IA"** dentro do grupo **GESTÃO & CONFIG** do sidebar, ao lado de **Configurações → IA**.

## Validação

1. Definir limite de agência = $ 10; rodar uma pauta pesada e confirmar bloqueio com toast + evento em `activity_events`.
2. Definir limite de cliente > limite de marca → servidor rejeita.
3. Ana Souza consome até 100% do próprio limite → dela é bloqueada, João continua rodando.
4. Super admin de outra workspace não vê os limites desta marca (RLS).
5. Registros antigos de `brand_ai_usage` continuam somando no total da agência mesmo sem `client_id`.
