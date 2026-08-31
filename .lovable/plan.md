# Auditoria (read-only) — RBAC, autorização Meta/OAuth e Administração do Cliente

Fonte de verdade: código e banco atuais (consultados nesta auditoria). As auditorias antigas foram usadas apenas como contexto.

## 1. O que já está CORRETO (não mexer)

- `is_super_admin(_user_id)` lê apenas `user_profiles.is_super_admin OR role='super_admin'`. **Não existe hardcode por e-mail/ID** em nenhum ponto do código (busca por e-mail/allowlist não retornou nada; a única menção a `jose@` é comentário). Qualquer novo super admin funciona igual ao MASTER.
- `app_access_role`: super admin → `super_admin` sem precisar de membership; `owner`/`admin` → `admin`; `manager` → `manager`.
- `is_global_admin()` já retorna `false` (admin global extinto). Não há privilégio cross-workspace para ADMIN — coerente com a regra 5.
- `my_access` devolve para super admin **todos** os `brand_ids`; `can_access_client_row` retorna `true` para super admin.
- Administração do Cliente (Recursos/Identidade/Ambiente): escrita protegida no servidor por `assertSuperAdmin` (`admin-environment.functions.ts`, `feature-flags.functions.ts`, `branding.functions.ts`) e no banco (`brand_features`, `feature_catalog`, `installation` só escrevem com `is_super_admin(auth.uid())`). ADMIN realmente não escreve.

Hoje existe **1 único super admin** e ele tem **0 memberships ativas** em `brand_members` — importante para os testes (todo acesso dele depende exclusivamente do caminho super admin).

## 2. Lacunas de RBAC encontradas

1. **Guard de rota da Administração do Cliente é fail-open**: em `src/routes/_authenticated/admin.tsx`, o `beforeLoad` faz `try { amISuperAdmin() } catch { return }` — qualquer erro de rede/401 transitório libera o render da área. Mesmo problema em `settings.branding.tsx`.
2. **Leitura das três telas não exige super admin**: `listBrandFeatures` e as leituras de identidade/ambiente são acessíveis a membros (`brand_features` SELECT = `is_brand_member`), então ADMIN que force a URL/RPC ainda consegue *ler* dados dessas telas. A regra 3 pede bloqueio de UI + rota + servidor também na leitura.
3. **Divergência ADMIN × MANAGER**: no código `isBrandAdmin` = `super_admin|admin`; na RLS `is_brand_admin_level` = `super_admin|admin|manager`. Logo MANAGER pode escrever `social_connections`, `client_social_accounts` e **atualizar `brands`** direto pela RLS, contrariando a matriz de papéis.
4. `useAccessRole` colapsa `manager` em `role: "admin"` para a UI; menus de gestão aparecem para manager. Não bloqueia servidor, mas confunde a regra.
5. `src/lib/permissions.ts` mantém matriz legada (`resolveAccessRole` trata `manager` como admin, `SIDEBAR_ALLOWED_URLS` sem noção de super admin) — hoje o sidebar compensa com `isSuper`, mas a fonte dupla é a origem das divergências.

## 3. Causa raiz do problema Meta (não é RBAC de aplicação — é RLS)

`meta_oauth_sessions` tem **apenas** estas policies: SELECT/UPDATE/DELETE com `user_id = auth.uid()`. **Não existe policy de INSERT, nem de super admin, nem de administrador do workspace.**

Consequências, confirmadas pelo código:

- O callback grava a sessão com `supabaseAdmin` (bypassa RLS) e a atribui a `user_id = state.userId`.
- Todo o resto (`meta.functions.ts:getActiveMetaSession`, `portfolio.functions.ts:getMetaPortfolio` e suas escritas de cache, `discovery.functions.ts`, `discovery.server.ts`, `portfolio-admin.functions.ts:getMetaPortfolioStatus`, `authorization.server.ts:revoke*`) usa o client **autenticado**. Resultado: quem não criou a sessão vê zero linhas → "Sessão da Meta não encontrada ou revogada", nenhuma conta/portfólio listado, e as escritas de cache do portfólio afetam 0 linhas silenciosamente.
- Isso vale **inclusive para o SUPER ADMIN**, e para o ADMIN que deveria reutilizar a autorização do workspace — exatamente o contrário do que os comentários do código afirmam ("a autorização pertence ao WORKSPACE").
- `revokeMetaPortfolio`/`revokeMetaAuthorization` também não conseguem revogar sessões de outro usuário.

Portanto: **a arquitetura Meta está correta no código e quebrada na RLS.**

## 4. `This app needs at least one supported permission`

Não é RBAC. Em `MetaProvider.buildAuthorizeUrl`, quando `META_BUSINESS_CONFIG_ID` existe o código envia `config_id` e **omite `scope`** (comportamento correto do Facebook Login for Business). A Meta emite essa mensagem quando o diálogo não consegue derivar nenhuma permissão, ou seja:

- `config_id` inexistente/pertencente a outro App ID, ou de tipo errado (precisa ser configuração de *Facebook Login for Business*), ou
- a configuração de login não tem permissões/ativos selecionados, ou
- as permissões pedidas não estão disponíveis para o App (produto não adicionado / não aprovado — ex.: Threads, `business_management`).

O que o código deve fazer: validar o `config_id` no boot da autorização (Graph `GET /{config_id}` com app access token), e em caso de configuração inválida **cair para o modo legado com `scope`** em vez de gerar uma URL que a Meta rejeita, registrando o motivo e expondo-o no diagnóstico já existente (`getMetaOAuthModeFn`). A correção final da lista de permissões é de configuração no App Meta, não de código.

## 5. Plano de correção (ordem segura)

### Etapa 1 — Migration A: autorização Meta pertence ao workspace
- Substituir as três policies `user_id = auth.uid()` de `meta_oauth_sessions` por:
  - SELECT: `is_super_admin(auth.uid()) OR is_brand_owner_or_admin(brand_id, auth.uid())` (ver função nova abaixo) `OR user_id = auth.uid()`;
  - INSERT/UPDATE/DELETE: `is_super_admin(auth.uid()) OR is_brand_owner_or_admin(brand_id, auth.uid())`;
  - `GRANT SELECT, INSERT, UPDATE, DELETE ... TO authenticated` (revalidar grants existentes).
- Criar `public.is_brand_owner_or_admin(_brand_id uuid, _user_id uuid)` = `app_access_role(...) IN ('super_admin','admin')` — fonte canônica única para "autoridade de integração", espelhando `isBrandAdmin` do código (exclui MANAGER, ao contrário de `is_brand_admin_level`).
- Aceite: um ADMIN do workspace (que não autorizou) lista portfólios/contas; super admin lista em qualquer workspace; MANAGER/USER não leem nada; sessão de outro workspace nunca aparece.

### Etapa 2 — Migration B: coerência ADMIN × MANAGER nas integrações
- Trocar `is_brand_admin_level` por `is_brand_owner_or_admin` nas policies de escrita de `social_connections`, `client_social_accounts` e no UPDATE de `brands`.
- Manter `is_brand_admin_level` onde MANAGER realmente deve operar (não tocar nas demais tabelas nesta fase).
- Aceite: MANAGER não conecta/desconecta canal nem edita o workspace; ADMIN faz tudo isso.

### Etapa 3 — Migration C: leitura da Administração do Cliente
- `brand_features` SELECT passa a `is_super_admin(auth.uid())` + política separada de leitura mínima para o gate de features do app via função `SECURITY DEFINER` já existente (`listBrandFeatures` continua funcionando por RPC, sem expor a tabela a ADMIN), ou nova `public.my_brand_features(_brand_id)` retornando apenas `key/enabled`.
- Aceite: ADMIN continua com os módulos habilitados funcionando, mas não lê a tabela de configuração nem as telas.

### Etapa 4 — Servidor (sem UI)
- `src/lib/super-admin.ts`: manter única fonte; adicionar `assertSuperAdmin` nas **leituras** das três telas (`admin-environment.functions.ts` get*, `feature-flags.functions.ts` listagens de catálogo/ambiente, `branding.functions.ts` leitura administrativa).
- `src/lib/access-guard.ts`: adicionar `assertIntegrationAuthority(supabase, userId, brandId)` chamando a nova RPC `is_brand_owner_or_admin`, e substituir o import dinâmico de `isBrandAdmin` (hoje vindo de `monthly-plan-delete.server.ts`, acoplamento indevido) em `src/lib/meta/meta.functions.ts`, `portfolio-admin.functions.ts`, `schedule-approval.server.ts`.
- `src/lib/meta/portfolio.functions.ts`, `discovery.functions.ts`: aplicar `assertIntegrationAuthority` no início dos handlers (defesa em profundidade além da RLS).

### Etapa 5 — OAuth Meta
- `src/lib/meta/provider.server.ts`: função `validateBusinessConfig()` (Graph `GET /{config_id}` com `client_id|client_secret`); `metaOAuthModeDiagnostics()` passa a reportar `config_valid` e o motivo da rejeição.
- `meta.functions.ts:startMetaOAuth`: se o `config_id` for inválido, gerar a URL legada com `scope` e devolver aviso em pt-BR na resposta (sem quebrar o fluxo).
- Documentar em `docs/META_MULTI_INSTALACAO.md` a checklist do App Meta (produtos, permissões, configuração de login).

### Etapa 6 — Frontend (gating alinhado, sem redesenho)
- `admin.tsx` e `settings.branding.tsx`: `beforeLoad` **fail-closed** (erro → redirect `/dashboard`), mantendo o skip em SSR.
- `use-access-role.tsx` / `permissions.ts`: expor `canManageIntegrations` (super_admin|admin) e `canAccessClientAdmin` (super_admin) e usar esses flags no sidebar e na tela de Integrações, eliminando a matriz legada que confunde MANAGER com ADMIN.

### Etapa 7 — Testes
- Novo `tests/meta-authorization-workspace.integration.test.ts`: ADMIN reutiliza sessão criada por outro admin; super admin idem em workspace onde não é membro; MANAGER/USER bloqueados; sessão de outro workspace invisível.
- Novo `tests/client-admin-superadmin-only.integration.test.ts`: ADMIN recebe erro nas leituras/escritas de Recursos/Identidade/Ambiente; **segundo** super admin (criado no teste) tem acesso idêntico ao MASTER.
- Novo `tests/integration-authority.integration.test.ts`: MANAGER não escreve `social_connections`/`brands`; ADMIN escreve.
- `tests/meta-oauth-redirect-uri.unit.test.ts`: acrescentar casos de `config_id` válido/inválido e do fallback para `scope`.
- Revisar `tests/global-admin.integration.test.ts` e `tests/rbac-scope.integration.test.ts` para refletirem a matriz final.

## 6. Critérios de aceite globais

- Qualquer usuário com `is_super_admin` acessa tudo (as três telas + toda a operação/integração), sem membership e sem privilégio hardcoded.
- ADMIN opera toda a área de Integrações (conectar, listar portfólios/contas/ativos, sincronizar, vincular, desconectar) e é bloqueado nas três telas em UI, rota, server function e RLS.
- MANAGER/USER seguem restritos aos clientes atribuídos e sem autoridade de integração.
- Nenhuma migration destrutiva: apenas `CREATE OR REPLACE FUNCTION`, `DROP POLICY`/`CREATE POLICY` e `GRANT`.
