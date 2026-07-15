## Objetivo

Popular a marca **Pitada Digital** com **+2 clientes demo** de nichos distintos, prontos para uma apresentação comercial. Toda tela do sistema (dashboards agência/cliente, Conteúdo, Calendário, Analytics, Portal, Brain, Mídia Paga, Notificações, Auditoria) precisa aparecer com dados realistas e coerentes entre si — nada de listas vazias e nada de números que se contradizem entre dashboards.

## Clientes que serão criados

1. **Estúdio Lumina** — Estúdio de fotografia editorial e branding visual. Paleta grafite/dourado. Tom sofisticado. Foco Instagram + LinkedIn.
2. **Verde Vivo Nutrição** — Clínica de nutrição funcional. Paleta verde/creme. Tom acolhedor e educativo. Foco Instagram + TikTok.

Café Aurora é mantido como está. Os dois novos entram no mesmo padrão de riqueza dele.

## O que cada cliente vai receber

### Fundação estratégica (Cérebro da marca)
- Registro em `clients` (nicho, contato, tom, paleta, socials, `brand_hub` com missão/valores/USP).
- Pipeline padrão de 6 estágios via trigger existente (não precisa inserir manualmente).
- `brand_briefings` (briefing consolidado + campos `data` estruturados, completude 85–95%).
- 3 `brand_personas` distintas com dores, canais, jornada.
- SWOT em `brand_swot`.
- Voice card em `brand_voice_cards` (tom, do/don't, exemplos).
- 3 `brand_competitors` com snapshot e pautas inspiradas.
- 6–8 `brand_pautas` (pilares de conteúdo).
- 3 `client_documents` "analisados" (briefing PDF, manual de marca, pesquisa) com `ai_summary` e `analyzed_at` preenchidos — sem upload real no Storage (apenas metadata; o `storage_path` aponta para caminho fictício, e a UI já lida com download opcional).

### Produção de conteúdo (Kanban `/content` + Calendário)
Cerca de **28–34 posts por cliente**, distribuídos:
- 4–5 em `briefing` (Ideia)
- 4–5 em `writing` (Produção)
- 3–4 em `design` (Design)
- 3–4 em `review` (Revisão) — com `post_approvals` status `pending`
- 4–5 em `approved` (Aprovado) — approvals `approved`
- 8–10 em `scheduled` (Agendado) — datas espalhadas nas próximas 4 semanas
- 3–4 já `published` (histórico dos últimos 30 dias)

Cada post terá: `title`, `copy`, `channels`, `format`, `cover_url` (Unsplash), `reference_media`, `tags`, `hook`/`headline` em `script`, `assignees`, `visible_in_portal=true`, `priority`. Alguns posts terão `post_placements` extras (Feed + Story do mesmo conceito, com scheduling independente).

### Aprovações e ciclo cliente
- Mistura realista de `post_approvals`: pendentes, aprovados, e **2–3 com status `adjust`** e nota "pode aumentar o CTA?", "trocar foto de capa", etc. — com `decided_by_name` "Cliente".
- `activity_events` correspondentes (`portal_approved`, `portal_adjust`, `stage_changed`, `created`) para popular o feed de Atividade recente do dashboard.

### Portal do cliente (`/portal/$token`)
- 1 `portal_tokens` ativo por cliente (sem expiração) → link publicável na apresentação.
- Como os posts têm `visible_in_portal=true` + approvals mistos + `scheduled_at` no mês corrente, o portal renderiza automaticamente: métricas (pendentes / aprovados no mês / agendados / total), aba Aprovações com 3 status, Calendário mensal, Feed dos publicados, Arquivos (via `client_documents`), Briefings.

### Projetos e tarefas
- 2–3 `projects` por cliente (ex.: "Campanha de Inverno", "Lançamento Ebook") com progress 20–80%, cores e goals.
- 8–12 `tasks` por cliente distribuídas entre projetos, com status/prioridade variados, alguns `done` recentes, alguns vencendo em 24h (alimenta KPI "Prazos próximos").
- 3–4 `task_comments` com `mentions` para o super admin logado (alimenta bell/menções).

### Mídia paga
- 1 `media_plans` ativo por cliente (mês corrente, `share_token` público) com 4–5 `media_plan_items` (Meta Ads topo/meio/fundo + Google Search + TikTok) somando 100% do budget. O trigger `recalc_media_plan_item_amount` faz o cálculo dos valores.

### IA — histórico visível
- 15–20 `brand_ai_usage` por cliente nos últimos 14 dias (agent mix: strategist, copywriter, planner, media-planner; modelos gemini-2.5-flash e claude), com `cost_usd` pequeno, `input_tokens`/`output_tokens`, mostly `success=true` + 1 falha.
- 3–4 `ai_jobs` finalizados (`status='succeeded'`, `progress=100`) representando geração de plano editorial e briefing — para o header/histórico.

### Brain
- 20–30 `brain_events` por cliente (source_module mix: content, portal, analytics, ai) com `outcome_score`.
- 4–6 `brain_insights` ativos (`insight_type`: performance, timing, audience, risk) com `confidence` 0.6–0.92 e `expires_at` no futuro.
- 12–16 `brain_metrics_snapshots` (Instagram/TikTok/LinkedIn × 4 semanas) para alimentar gráficos.

### Analytics (`/analytics`)
Os cards de Analytics leem `posts.published_at` + campos de métrica; para os posts `published` já geramos `impressions`, `reach`, `engagements` em `payload`/colunas se houver. (Se a tela lê apenas contagens agregadas de `posts`/`activity_events`, o volume acima já basta — nenhum insert extra é necessário; se ler tabela dedicada, o seed acrescenta.)

### Mensageria
- 8–12 `message_logs` por cliente (whatsapp/email) misturando `sent`, `delivered`, 1 `failed` — para os 4 KPIs de Mensageria (Enviadas, Entrega, Falhas, Cobertura).

### Notificações do super admin
- 6–8 `notifications` recentes para cada super admin (`apitadadigital@gmail.com` e `jose@mahara.marketing`) com mix: `mention`, `approval_requested`, `portal_approved`, `deadline`, `system`. Algumas com `read_at=null` para o sino mostrar contador.

## Como será executado

Um único **`supabase--insert`** grande, transacional na prática (Postgres roda o bloco todo), em ordem topológica:

```text
clients → brand_briefings → brand_personas → brand_swot → brand_voice_cards
       → brand_competitors → brand_pautas → client_documents
       → projects → tasks → task_comments
       → posts (deixando pipeline_id/stage_id resolvidos por CTE contra content_pipeline_stages)
       → post_placements (para 4–6 posts) → post_approvals
       → activity_events (mirror dos eventos-chave)
       → portal_tokens
       → media_plans → media_plan_items
       → brand_ai_usage → ai_jobs
       → brain_events → brain_insights → brain_metrics_snapshots
       → message_logs
       → notifications (para os 2 super admins)
```

Uso de `WITH cliente_lumina AS (INSERT ... RETURNING id)` para encadear FKs sem UUIDs hardcoded, e subqueries contra `content_pipeline_stages` (filtrando por `pipeline_id` do cliente novo, que já foi criado pelo trigger existente do pipeline default) para preencher `stage_id`. Datas usam `now() + interval` para ficar sempre relativas.

Nenhuma alteração de schema, RLS, trigger ou policy — puro seed de dados. O super admin já enxerga tudo por causa das políticas atuais (`is_super_admin`).

## Fora de escopo
- Upload real de imagens ao Storage (`brand-assets`/`brand-documents`). Uso Unsplash URLs em `cover_url`/`reference_media` e `storage_path` fictício em `client_documents` — se algum download for tentado ele falha graciosamente, mas a listagem/summary de IA aparece.
- Criar novos usuários de equipe. Assignees usam o super admin logado.
- Alterar Café Aurora.

## Detalhes técnicos

- Brand alvo: `60fce5a7-1859-4bbd-a887-9018ed7f17b5` (Pitada Digital).
- `created_by` dos artefatos = `90f7c29f-31ea-4b36-a337-9123b0127f8f` (owner atual da brand).
- `assignee_id` das tasks / `assignees` dos posts = mesmo id; notifications também miram os 2 super admins (id via subquery em `user_profiles` por email).
- Pipeline default é criado por trigger no momento do `INSERT INTO clients`, então o seed lê `content_pipeline_stages` via CTE após a inserção do cliente e mapeia `key` (`briefing`/`writing`/`design`/`review`/`approved`/`scheduled`) para o `stage_id`. `stage` (enum) espelha o mesmo valor.
- Todos os inserts respeitam `NOT NULL` verificados no schema atual e usam `ON CONFLICT DO NOTHING` onde há unique constraints para permitir re-run seguro do seed.

Ao final: 3 clientes ativos, dashboards com números diferentes de zero, portal navegável, Brain com insights, Mídia Paga com plano público — pronto para apresentar.
