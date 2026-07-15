# NexusFlow — Auditoria Completa (2026-07-15)

Escopo priorizado pelo usuário: **Runtime & erros · Performance · UX / consistência · Segurança**. Formato: relatório primeiro, correção depois. Cada item traz **severidade**, **evidência** e **ação recomendada**.

Legenda: `P0` bloqueia usuário · `P1` degrada experiência/segurança · `P2` polimento.

---

## 1. Runtime & erros

### P0 — Realtime: `postgres_changes` registrado depois de `subscribe()`
- **Evidência (console):** `cannot add "postgres_changes" callbacks for realtime:notif:<uid> after "subscribe()".` disparado em `src/components/notifications/notifications-drawer.tsx:112`.
- **Causa:** o `.on(...)` é encadeado dentro de `supabase.auth.getUser().then(...)` — a Promise resolve **após** o React commit; o efeito também pode remontar (StrictMode / re-render) e reatar um listener num canal já assinado.
- **Impacto:** notificações em tempo real param de chegar após o primeiro erro; ruído no rastreio de erros do usuário.
- **Ação:** obter `userId` de forma síncrona (usar sessão já carregada / hook `useAuth`), criar canal e `.on(...).subscribe()` numa única transação, e garantir cleanup com `supabase.removeChannel(channel)`.

### P1 — TanStack Router: `Cannot read properties of undefined (reading '_nonReactive')`
- **Evidência:** `RouterCore.preloadRoute` em `@tanstack_router-core.js`. Dispara em navegação hover (`defaultPreload: "intent"`).
- **Causa provável:** rota com `loader` que retorna `undefined` / objeto sem shape esperado, ou `queryClient` context não injetado no preload path (loader chamando `context.queryClient.ensureQueryData` numa rota que não recebe context).
- **Ação:** auditar rotas com prefetch on-intent; garantir todo loader `return`-ar objeto serializável ou `null`, nunca `undefined`.

### P1 — Acessibilidade: `DialogContent` sem `DialogTitle` / `Description`
- **Evidência:** dois erros Radix repetidos após abrir menus/command palette.
- **Local:** `CommandDialog` em `src/components/ui/command.tsx` não injeta `DialogTitle`/`Description` invisíveis; o único consumidor (`src/components/command-menu.tsx`) também não define.
- **Ação:** dentro do `CommandDialog`, adicionar `VisuallyHidden` com `<DialogTitle>Comandos</DialogTitle>` e `<DialogDescription>` — resolve todos os call sites de uma vez.

### P2 — Ruído no console
- `Unknown message type: RESET_BLANK_CHECK` — origem `cdn.gpteng.co/lovable.js` (harness). Ignorar.

---

## 2. Segurança

Scan Supabase: **29 findings** (1 ERROR, 28 warn).

### P0 — Storage policy quebrada em `brand-assets` / `brand-documents`
- **Finding:** `STORAGE_POLICY_LOGIC_BROKEN` — `portal_anon_read_brand_assets` **não correlaciona** `storage.objects.name` ao caminho do cliente. Qualquer token de portal válido concede leitura anônima a **qualquer arquivo** dos buckets.
- **Ação (migração):** reescrever a policy comparando `storage.foldername(name)[1]` (ou padrão `client_id/...`) ao `client_id` resolvido via `portal_tokens`. Reduzir para SELECT-only e escopar por caminho.

### P1 — `agent_prompts` legível por qualquer usuário autenticado
- **Finding:** `PUBLIC_USER_DATA` — policy `agent_prompts_authenticated_read USING (true)`.
- **Decisão pendente:** prompts globais compartilhados **ou** por brand?
  - Se globais: aceitar risco e documentar em `mem://` / security-memory.
  - Se sensíveis: escopar por `brand_id` (add coluna + policy `is_brand_member`).

### P1 — 27 funções `SECURITY DEFINER` executáveis por `anon`/`authenticated`
- 9 públicas (`anon`): a maioria são as `portal_*` — **precisam** ficar acessíveis a `anon` porque o portal white-label não tem sessão. Ação: revogar apenas as **não-portal** de `anon` (ex.: `has_role`, `has_brand_role`, `is_brand_member`, `is_super_admin`, `reap_stuck_ai_jobs`, `accept_brand_invite`, `handle_new_user`, `notify_task_*`, `log_*_activity`, triggers).
- 18 `authenticated`: revisar caso a caso. Triggers (`log_*`, `notify_*`, `add_brand_owner`, `handle_new_user`, `protect_pipeline_delete`, `update_updated_at_column`) **não** precisam de EXECUTE por role — só o dono. Revogar EXECUTE de `PUBLIC`, `anon`, `authenticated` para funções de trigger.

### P2 — Proteção contra senhas vazadas desativada
- `SUPA_auth_leaked_password_protection`. Ativar em Supabase Auth → Password Protection.

---

## 3. Performance

### Top queries (pg_stat_statements — últimas 24h)
| Total ms | Calls | Query |
|---|---|---|
| 1438 | 430 | `activity_events` por `brand_id` + `created_at >= ?` |
| 1293 | 874 | `brand_members` por `user_id` |
| 1038 | 400 | `activity_events` por `brand_id + client_id` |
| 1003 | 411 | `user_profiles.requires_password_change` |
| 990 | 365 | `posts.id` por `brand_id + client_id` |
| 935 | 660 | listagem `clients` por `brand_id` |
| 797 | 387 | `posts` por `brand_id + client_id` (dashboard) |
| 781 | 874 | `brand_briefings` por brand + client IN (...) |
| 604 | 533 | `ai_jobs` por `user_id` ORDER BY created_at |

### Observações & ações
- **P1 — `user_profiles.requires_password_change` 411 chamadas:** o gate `MandatoryPasswordReset` refaz a query a cada mount/rota. Cachear via `useQuery` com `staleTime: Infinity` (invalidar só ao trocar de sessão).
- **P1 — `brand_members` 874 chamadas:** switcher/permissions lê a cada render. Consolidar num `useQuery` global (`['brand-memberships']`, `staleTime: 5min`).
- **P1 — `activity_events` acumula 3s+:** falta índice composto `(brand_id, created_at DESC)` e `(brand_id, client_id, created_at DESC)`. Ação: `CREATE INDEX` via migração.
- **P1 — `ai_jobs` por user 600ms:** índice `(user_id, created_at DESC)`.
- **P2 — payloads inflados:** `clients` list traz 15 colunas (inclusive `palette`, `socials`, `tone_of_voice`) só pro switcher. Criar view/`select` slim para sidebar.
- **P2 — `brand_briefings` só pra saber "tem briefing?"** — 874 chamadas. Cachear ou materializar `has_briefing boolean` em `clients`.

### Front-end
- `defaultPreload: "intent"` ativo — bom, mas o TypeError acima está gerando preloads perdidos. Corrigir loaders (item runtime).
- Realtime: 3 arquivos usam `supabase.channel`. Todos devem ter `removeChannel` no cleanup (verificar `use-realtime-invalidate.tsx` e `ai-jobs-provider.tsx`).

---

## 4. UX / consistência

### P1
- **Acessibilidade global de diálogos:** consequência do item runtime — telas com command palette e alguns modais quebram leitor de tela.
- **PT-BR incompleto:** o audit anterior localizou o dashboard, mas ainda há strings inglesas em modais menos usados (verificar `agent-drawer`, `column-config-dialog`, `strategy-editors`).
- **Header dinâmico:** confirmar que todas as rotas registram título/subtítulo via `PageHeaderProvider`; rotas de settings ainda usam heading local em alguns lugares.

### P2
- **Estados vazios:** listas (`customers`, `projects`, `tasks`) precisam de empty-state com CTA + ilustração leve, não apenas "nenhum item".
- **Skeletons:** rotas de detalhe do cliente já usam Suspense — validar que analytics e connections também têm fallback.
- **Dark mode:** revisar contraste dos badges de estágio dinâmicos (agora vindos do DB — cores livres podem ficar ilegíveis no dark).
- **Mobile:** sidebar/header não foi auditado; solicitação futura.

---

## Plano de correção sugerido (ordem)

1. **P0 realtime notifications** — 10 min, arquivo único.
2. **P0 storage policy portal** — migração + teste anon.
3. **P1 CommandDialog a11y** — patch em `ui/command.tsx`.
4. **P1 TanStack preload TypeError** — reproduzir e corrigir loader ofensor.
5. **P1 Índices Postgres** (`activity_events`, `ai_jobs`) + `staleTime` no `requires_password_change` e `brand_members`.
6. **P1 SECURITY DEFINER hardening** (revogar EXECUTE de funções de trigger e non-portal).
7. **P1 `agent_prompts` decisão de escopo** (perguntar antes).
8. **P2 senha vazada, empty states, PT-BR remanescente, dark-mode badges.**

Quer que eu comece pelos P0/P1 nessa ordem, ou reordenar?