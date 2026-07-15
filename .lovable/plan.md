# Portal do Cliente — white-label multi-abas

Transformar `/portal/$token` (hoje um mock de um único post) num **portal completo do cliente** com as 6 abas das referências (Início · Aprovações · Calendário · Feed · Arquivos · Briefings), 100% escopado pelo `portal_tokens.token` já existente, e integrado ao fluxo de emissão/revogação que a agência já usa em `Dashboard` e `Settings › Time`.

## Escopo

### 1. Camada pública (server functions sem auth, validadas por token)

Novo arquivo `src/lib/portal-public.functions.ts` com uma função de resolução do token + funções por aba, todas chamando `supabaseAdmin` internamente e filtrando por `client_id` derivado do token. Cada uma valida: `token` existe, `revoked_at IS NULL`, `expires_at` no futuro (ou nulo) e grava `last_seen_at`.

- `resolvePortalTokenFn({ token })` → `{ clientId, brandId, client: { name, color, socials } }`
- `listPortalPendingApprovalsFn({ token })` → posts com aprovação `pending` (join `post_approvals` + `posts` + `reference_media`)
- `listPortalApprovalsFn({ token, status })` → todas / pendentes / aprovadas / ajustes
- `listPortalCalendarFn({ token, month })` → posts agendados/publicados no mês
- `listPortalFeedFn({ token })` → posts publicados/aprovados com `cover_url` (grade 3xN estilo Instagram)
- `listPortalFilesFn({ token, search })` → arquivos de `brand_documents` + `reference_media` públicos do cliente
- `listPortalBriefingsFn({ token })` → `client_briefing_tokens` ativos do cliente
- `decidePortalApprovalFn({ token, postId, decision, note, identity })` → grava em `post_approvals` (approve/reject/adjust/comment) + `activity_events` + notifica agência

Reaproveita a lógica de `approval.functions.ts` (mesma tabela `post_approvals`) e o padrão de `briefing-tokens.functions.ts` para o handshake por token.

### 2. Rota pública `/portal/$token` (refatoração completa)

Substituir `src/routes/portal.$token.tsx` por um shell white-label:

- **Sidebar fixa** (240px) colorida com `client.color` (fallback rosa/roxo conforme referência): avatar 2 letras, nome do cliente, 6 links de aba (Home, CheckSquare, Calendar, Grid3x3, Folder, ClipboardList do lucide).
- **Conteúdo** com header título/subtítulo + ações à direita, seguindo os primitives do design system: `DashboardPageShell`, `DashboardPanelSurface`, `KpiCard`, `PanelEmptyState` (aplicando **tons pastel** dos KPIs conforme screenshots: âmbar/emerald/sky).
- Estado do token guardado num contexto local (`PortalContext`) para não repetir prop drilling; abre modal de identificação uma única vez (nome obrigatório, salvo em `sessionStorage` por token).

Sub-rotas via **abas internas** (sem rotas filhas — mantém `/portal/$token` como URL única, mais fácil para compartilhar; state controlado por `?tab=`):

1. **Início** — 3 KPIs (Aguardando aprovação / Aprovadas no mês / Agendadas) + painel "Pendentes de aprovação" (lista dos posts com um clique abrindo o mesmo drawer de decisão que já existe hoje na página portal atual, com carrossel, zoom, aprovar/ajustar/rejeitar/comentar).
2. **Aprovações** — barra de status pill (Todas · Pendentes · Aprovadas · Ajustes) + toggle grid/lista + botão refresh. Cards com miniatura, canal, data prevista.
3. **Calendário** — mês/semana/dia reaproveitando o componente do `/calendar` da agência em modo read-only, filtrado por cliente.
4. **Feed** — grid 3 colunas estilo Instagram, `cover_url` derivado (mesma lógica já implementada em `listBoardPostsFn`), placeholder "Aguardando publicações" quando vazio.
5. **Arquivos** — busca por nome, lista `brand_documents` do cliente + refs de posts, download via signed URL.
6. **Briefings** — cards com os briefings pendentes que o cliente pode responder, apontando para `/p/briefing/$token` (fluxo público que já existe).

### 3. Integração com o painel da agência

O emissor/revogador **já existe** (`createPortalTokenFn` + `revokePortalTokenFromTeam`), usado em:
- `src/routes/_authenticated/dashboard.tsx` (bloco "Acessos do cliente")
- `src/routes/_authenticated/settings.team.tsx` ("Acessos do portal do cliente")

Ajustes mínimos nesses dois locais:
- **Novo botão "Abrir portal"** ao lado de "Copiar link" que abre `/portal/$token` em nova aba.
- **Indicador "Último acesso"** lendo `last_seen_at` (já persistido pelas novas funções públicas) — usa `formatDistanceToNow`.
- **Aviso de expiração** (badge âmbar quando faltam <3 dias, vermelho quando expirado) reutilizando `Badge` do design system.

Quando o cliente decide um post via portal, `decidePortalApprovalFn` grava em `activity_events` + insere `notifications` para todos os membros ativos da brand — a agência vê no `NotificationsDrawer` que já existe.

### 4. Segurança

- RLS em `portal_tokens` já bloqueia leitura por `anon`. As funções públicas usam `supabaseAdmin` (server-only) e nunca vazam `brand_id` cru para o cliente.
- Nenhum campo de outros clientes é exposto — todos os filtros usam o `client_id` resolvido do token.
- Token revogado ou expirado → função retorna 401 e a rota mostra tela "Link expirado — solicite um novo à agência".
- `identity` do cliente (nome digitado no primeiro acesso) é anexado a cada decisão em `post_approvals.decided_by_name` (adicionar coluna se não existir — migração pequena).

## Arquivos afetados

**Novos**
- `src/lib/portal-public.functions.ts`
- `src/components/portal/portal-shell.tsx` (sidebar + header)
- `src/components/portal/portal-context.tsx`
- `src/components/portal/tabs/{home,approvals,calendar,feed,files,briefings}.tsx`
- `src/components/portal/approval-drawer.tsx` (extrai o carrossel/decisão do arquivo atual)

**Editados**
- `src/routes/portal.$token.tsx` — vira shell + roteamento por `?tab=`
- `src/routes/_authenticated/dashboard.tsx` — botão "Abrir portal" + last_seen
- `src/routes/_authenticated/settings.team.tsx` — botão "Abrir portal" + last_seen + badge expiração

**Migração**
- Adicionar `decided_by_name text` em `post_approvals` (nullable, backfill vazio).

## Fora do escopo (não faço agora)

- Chat em tempo real cliente↔agência
- Notificações por e-mail para o cliente
- Personalização de tema por cliente além da cor primária
