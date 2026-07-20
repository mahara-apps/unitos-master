## Diagnóstico

O `MetaPortfolioDialog` mostra "Nenhuma conta do Instagram Business" porque o backend só encontra IG a partir das **Páginas do Facebook selecionadas** durante o consent screen da Meta. Sua conta pessoal Meta tem dezenas de IGs, mas o fluxo atual só os enxerga se:

1. o IG for **Business/Creator** (não Pessoal), **E**
2. estiver **vinculado a uma Página do Facebook**, **E**
3. o usuário **marcou aquela Página** na tela de "Choose what you allow" da Meta.

Três causas prováveis (não confirmadas ainda — a UI hoje não expõe o resultado bruto pra diagnosticar):

- **Consent granular da Meta (2024+)**: por padrão o modal da Meta vem com "Opt in to current and future Pages" desmarcado. Se o usuário clicou "Continue" sem marcar Páginas, `/me/accounts` retorna **zero Páginas** → zero IGs.
- **Escopo `instagram_basic` negado**: `instagram_business_account` volta como `null` nas páginas mesmo autorizadas.
- **Bug de paginação em `graphAbsolute`** (`src/lib/meta/provider.server.ts:363-365`): o `next` cursor não anexa `appsecret_proof`. Com App Secret Proof ativado no App Meta, chamadas paginadas quebram silenciosamente e páginas > 100 nunca são lidas.

Além disso, existe um caminho **totalmente ausente**: contas IG conectadas via "Instagram Login" direto (sem Página FB) — Meta hoje permite IG Business sem FB Page, exposto por outro produto (`instagram_business_basic`).

## Plano

**Fase 1 — Diagnóstico visível** (imprescindível pra saber qual das 3 causas está batendo)

1. `getMetaPortfolio` passa a expor no `PortfolioResponse`:
   - `pagesCount` total, `pagesWithIgCount`, `pagesWithoutIgCount`
   - lista `pages` já contém nomes — só usar na UI
2. `MetaPortfolioDialog`, aba Instagram, quando `igPages.length === 0`:
   - Substituir texto genérico por um painel diagnóstico:
     - "A Meta retornou **N Páginas** para esta autorização. **Nenhuma** tem Instagram Business vinculado."
     - Lista das Páginas retornadas (nome + ID) para o usuário conferir se falta alguma.
     - Se `N === 0`: mensagem "A Meta não devolveu nenhuma Página. Você provavelmente não marcou nenhuma na tela de permissões."
     - Se `instagram_basic` estiver em `missingScopes`: destacar em vermelho "Permissão `instagram_basic` foi negada."
   - Botão primário **"Autorizar novamente e liberar todas as Páginas"** que dispara `startMetaOAuth` de novo com `channel=instagram` e `authType=reauthenticate`.

**Fase 2 — Correções no fetch**

3. Corrigir `graphAbsolute` em `src/lib/meta/provider.server.ts`: reinjetar `appsecret_proof` (e `access_token` se ausente) ao seguir o `paging.next`. Sem isto, portfólios grandes perdem páginas.
4. `listPagesWithInstagram`: quando `instagram_business_account.id` vem mas `username`/`profile_picture_url` estão ausentes (acontece em contas privadas), fazer fallback por `/{ig_id}?fields=username,profile_picture_url` com o `page_access_token`, para o card não ficar vazio.

**Fase 3 — Cobertura de IGs sem FB Page (opcional, avisar antes)**

5. Adicionar caminho "Instagram Login direto": nova rota OAuth `channel=instagram_direct` usando `https://www.instagram.com/oauth/authorize` com escopos `instagram_business_basic,instagram_business_content_publish,instagram_business_manage_insights`. Requer adicionar o produto "Instagram" (Instagram API with Instagram Login) no App Meta Dashboard — só implementar após o usuário confirmar que o produto está habilitado.

## Detalhes técnicos

- Arquivos alterados: `src/lib/meta/provider.server.ts` (fix paginação + fallback IG fields), `src/lib/meta/portfolio.functions.ts` (expor contagens/lista), `src/components/connections/meta-portfolio-dialog.tsx` (painel diagnóstico + botão reauth), `src/components/connections/social-channel-card.tsx` (nenhuma mudança — reautorização vem do próprio dialog).
- Nenhuma migração de banco: os dados já estão em `meta_oauth_sessions.pages` (JSONB).
- Não altera `linkMetaAccount` nem o schema `social_connections`.
- Fase 3 fica bloqueada por config do App Meta — confirmar antes de codar.

## O que fica de fora deste plano

- Não adicionar retry automático de OAuth: o botão de reautorização é manual, para o usuário poder revisar a lista de Páginas antes.
- Não alterar escopos padrão em `META_DEFAULT_SCOPES` — já pedem `instagram_basic`.
