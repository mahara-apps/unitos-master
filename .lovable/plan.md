## Objetivo

Reestruturar o app do zero em torno do modelo do MD (brand → clients → projects → tasks/posts → briefings/portais) e entregar um Dashboard contextual (Agência ↔ Cliente) mais rico que o descrito no doc, com IA, real-time, command palette e visualizações densas.

## 1. Reset do modelo de dados (Supabase)

Uma migration única, drop das tabelas atuais que não encaixam (`campaigns`, `posts`, `ai_agents`, `conversations`, `leads`, `post_approvals`) e criação da nova estrutura. `user_profiles` é aproveitado (renomeado se necessário).

**Enums:** `app_role` (owner, manager, editor, designer, client), `project_status` (planning, in_progress, active, paused, done), `task_status` (todo, in_progress, review, done), `task_priority` (low, medium, high, urgent), `post_stage` (idea, production, review, approved, scheduled, published), `post_channel` (instagram, tiktok, linkedin, x, youtube, blog), `alert_severity` (info, warning, critical), `notification_kind` (mention, assignment, approval_requested, approval_decision, deadline, system).

**Tabelas (todas com `id uuid`, `created_at`, `updated_at` + trigger):**
- `brands` — workspace da agência (name, slug, color, logo_url).
- `brand_members` — (brand_id, user_id, role) — junction com role.
- `user_roles` — (user_id, brand_id, role) padrão seguro para `has_role()` SECURITY DEFINER.
- `clients` — brand_id, name, niche, color, contact_name, contact_email, contact_phone, tone_of_voice, palette jsonb, socials jsonb, archived_at.
- `client_briefings` — client_id, personas jsonb, target_audience, hashtags text[], monthly_volume int, guidelines, updated_by.
- `projects` — brand_id, client_id, name, description, status, progress int, due_at, owner_id.
- `tasks` — brand_id, client_id, project_id?, title, description, status, priority, assignee_id, due_at, done bool, done_at.
- `posts` — brand_id, client_id, project_id?, title, copy, channels post_channel[], stage, scheduled_at, published_at, assignee_id, cover_url.
- `post_approvals` — post_id, decided_by?, status (pending/approved/changes_requested), notes, decided_at.
- `portal_tokens` — client_id, token (unique), label, revoked_at, expires_at, last_seen_at.
- `notifications` — user_id, brand_id, kind, title, body, href, read_at, payload jsonb.
- `activity_events` — brand_id, actor_id, entity_type, entity_id, verb, payload jsonb (feed + auditoria + fonte do heatmap).

**Segurança:** RLS on em tudo. `has_role(user_id, brand_id, role)` SECURITY DEFINER. Policies escopadas por `brand_id ∈ user's brands` para authenticated; `portal_tokens` liberam SELECT anônimo apenas em `posts` do cliente correspondente via server function (token → RLS check), nunca policy `TO anon` ampla. GRANTs explícitos por tabela conforme o guia.

**Realtime:** `ALTER PUBLICATION supabase_realtime ADD TABLE` para `tasks`, `posts`, `post_approvals`, `notifications`, `activity_events`.

## 2. Reorganização de rotas

Substitui a estrutura atual por:

```text
src/routes/
  __root.tsx
  index.tsx                         → landing pública
  auth/login.tsx, forgot-password.tsx, reset-password.tsx
  _authenticated/route.tsx          → gate ssr:false (Supabase)
  _authenticated/app/route.tsx      → shell (sidebar + header + brand/client switcher + ⌘K)
  _authenticated/app/dashboard.tsx  → Dashboard contextual
  _authenticated/app/work.tsx       → Tarefas
  _authenticated/app/calendar.tsx
  _authenticated/app/projects.tsx / projects.$id.tsx
  _authenticated/app/clients.tsx / clients.$id.(briefing|planning|calendar|approvals).tsx
  _authenticated/app/notifications.tsx
  api/public/portal.$token.tsx      → leitura pública do portal
  portal.$token.tsx                 → UI pública consumindo o endpoint
```

Sidebar ganha **Brand Switcher** (topo) e **Client Switcher** (abaixo). Cliente ativo persiste em `localStorage` + query param `?client=<id>` para deep-link. Sem cliente ⇒ Dashboard entra em modo Agência.

## 3. Camada de dados (server functions)

Novo `src/lib/dashboard.functions.ts` com:
- `getDashboardStats({ brandId, clientId? })` — 8 queries paralelas tolerantes a falha (counts, tasksByStatus, postsByStage, recent*, upcoming*, myTasks). Retorna DTO plano.
- `getAgencyDashboard({ brandId })` — mesmo + join client name nas tarefas, agenda unificada (tasks+posts próximos 7d), alertas computados server-side.
- `getDashboardInsights({ brandId, clientId? })` — chama Lovable AI Gateway (`google/gemini-2.5-flash`) com resumo compacto do estado atual e devolve JSON `{ headline, actions: [{ title, why, href }], risks: [...] }` (schema pequeno, sem bounds). Cacheado 5 min por (brand,client).
- Fetchers auxiliares para command palette: `searchWorkspace({ brandId, q })` (clients, projects, tasks, posts) via `ilike` + limit.

Todas usam `requireSupabaseAuth`. Nada de admin client fora de webhooks. `activity_events` grava via triggers Postgres a cada `INSERT/UPDATE` relevante — heatmap e feed vêm daí sem código de app.

## 4. Dashboard superior

### Estrutura visual

Grid 12 colunas responsivo. Modo é decidido em runtime pelo `activeClientId` do store.

**Header do Dashboard (comum aos dois modos):**
- Título contextual ("Visão da agência" vs "<Cliente> — hoje").
- Faixa densa de KPIs (6) com **sparkline de 14 dias** ao lado do número (vem de `activity_events`), não só o valor absoluto.
- Botão "Insights com IA" que expande painel lateral.

### Modo Agência
1. **Alertas prioritários** (topo, acionáveis, cada alerta tem CTA para a tela que resolve).
2. **Health score por cliente** — lista de clientes com barra 0-100 calculada de: % tarefas no prazo (40), % posts aprovados no ciclo (30), frescor de briefing (15), aderência ao calendário (15). Cliente vermelho = ação urgente. **Isto substitui a lista pura de KPIs por cliente**.
3. **Heatmap de publicações** — 7×N (dia da semana × semana) últimos 60 dias, colorido por volume publicado; identifica dias mortos.
4. **Fila global de aprovações** — cards horizontais (thumb, cliente, canais, tempo esperando). Clique → portal do cliente.
5. **Próximas atividades (7d)** — timeline unificada.
6. **Insights com IA** (painel lateral colapsável) — headline + 3 próximas ações + riscos.

### Modo Cliente
1. **Faixa de "próximo passo"** — 3 atalhos (briefing / plano do mês / calendário) mas cada um com **badge de status** ("briefing desatualizado há 45d", "sem plano para este mês", "3 dias sem post agendado").
2. **Funil de produção** — barras por stage com número + delta vs semana anterior. Clicar filtra a lista de posts.
3. **Minhas tarefas** (assignee = eu) com priority chip.
4. **Timeline do cliente** — feed de `activity_events` (quem fez o quê, quando) — auditoria + contexto.
5. **Perfil, Projetos, Portal Links** — como no MD original.
6. **Insights com IA** focado no cliente.

### Diferenciais transversais

- **Real-time:** hook `useRealtimeInvalidate([{ table: 'tasks', filter: `brand_id=eq.${brandId}` }, ...])` inscrito uma vez no shell autenticado. Ao evento, `queryClient.invalidateQueries` das keys afetadas. Toast discreto ("Ana aprovou 2 posts").
- **Command palette (⌘K / Ctrl K):** `cmdk` sobre `shadcn/ui`. Ações: trocar cliente, criar tarefa/post/projeto, abrir aprovações, ir a qualquer entidade encontrada por `searchWorkspace`. Atalhos: `g d` dashboard, `g w` work, `g c` calendar, `n t` nova tarefa, `n p` novo post, `?` mostra cheat sheet.
- **AI Insights:** server fn dedicada, prompt curto ("dado este JSON de estado, gere headline+3 ações+riscos"). Render com skeleton + botão "Regenerar". Falha degrada silenciosamente (bloco fica oculto).
- **Visualização rica:** sparklines inline (SVG puro, sem lib pesada), heatmap em grid CSS, health score com barra segmentada colorida por token semântico.

## 5. Design tokens & UX

- Tema mantido (violet/indigo já configurado), mas todos os acentos por token semântico em `src/styles.css` (`--severity-critical`, `--severity-warning`, `--severity-info`, `--stage-idea`…`--stage-published`, `--health-good/warn/bad`). Nada de `text-red-500` hardcoded.
- Skeletons em todos os blocos que consomem query.
- Estado vazio positivo com micro-ilustração + CTA em cada bloco.
- Responsivo: em <lg, KPIs viram carrossel horizontal; heatmap encolhe para 30 dias.

## 6. Ordem de entrega (uma PR só, mas em etapas verificáveis)

1. Migration Supabase (schema + RLS + grants + realtime publication + triggers de `activity_events`).
2. Seletores de brand/client + rota `_authenticated/app` shell + sidebar nova.
3. Server functions de dashboard (sem IA ainda).
4. Dashboard modo Agência + modo Cliente com dados reais.
5. Realtime hook + invalidate.
6. Command palette.
7. `getDashboardInsights` + painel IA (Lovable AI Gateway, `google/gemini-2.5-flash`).
8. Portal público via `api/public/portal.$token`.

## 7. Fora de escopo desta entrega

- Wizard de plano do mês (só o link/CTA fica pronto).
- Editor de briefing completo (só a rota + leitura).
- Kanban de produção detalhado (a página `/production` atual será migrada depois; o Dashboard já usa `posts.stage` diretamente).
- Templates de e-mail customizados para notificações.

## 8. Ação do usuário depois do deploy

- Confirmar Redirect URLs no Supabase (`/reset-password` e `/auth/callback` de produção).
- Criar a primeira `brand` e se auto-adicionar como `owner` (fluxo de onboarding aparece automaticamente quando o usuário não tem brand).

## Notas técnicas

- Todas as leituras do Dashboard passam por `createServerFn` + `requireSupabaseAuth`; loaders só chamam sob `_authenticated`.
- `activity_events` alimenta sparklines, heatmap e feed — evita N consultas por widget.
- Health score é calculado no cliente a partir de fields já retornados por `getAgencyDashboard` (nada extra no banco).
- `dashboard-stats` e `agency-dashboard` com `staleTime: 30s`; realtime invalida em tempo real.
- IA nunca bloqueia render do Dashboard (Suspense boundary próprio no painel de insights).
