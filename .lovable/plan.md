# Meta Integration Multi-Tenant

Hoje o callback do OAuth já pede os escopos corretos e lista todas as Páginas via `listPagesWithInstagram`, **mas** salva automaticamente apenas `pages[0]`. Vamos separar consentimento (captura do portfólio) da vinculação (seleção explícita por canal), e adicionar um endpoint de webhook que roteia eventos FB × IG para o `brand` correto.

## 1. Backend — captura do portfólio no callback

- Alterar `src/routes/api/public/meta/callback.ts`: em vez de gravar em `social_connections`, persistir uma **sessão temporária** com o token de longa duração, o `me` do usuário, escopos concedidos e o array completo de Pages+IG.
- Nova tabela `meta_oauth_sessions` (id, brand_id, user_id, user_token_ciphertext, expires_at, scopes, pages jsonb, consumed_at) com RLS por `brand_id` (via `brand_members`) e TTL curto (ex. 30 min).
- Callback redireciona o popup para `/connections?meta_session=<id>` (postMessage inclui `sessionId`).

## 2. Backend — server functions do seletor

Novo arquivo `src/lib/meta/portfolio.functions.ts`:
- `getMetaPortfolio({ brandId, sessionId })` → retorna Pages/IG + estado "já conectado" cruzando com `social_connections`.
- `linkMetaAccount({ brandId, sessionId, pageId, channel })` → grava/atualiza uma linha em `social_connections` para o canal escolhido (`facebook` ou `instagram`), reusa o page access token da sessão, cifra e faz upsert por `(brand_id, provider, external_id)` respeitando a regra "1 conta ativa por canal por brand".
- `unlinkMetaAccount({ brandId, connectionId })` → delete (reaproveita `disconnectMeta` existente).

## 3. Frontend — Seletor de Contas

Novo componente `src/components/connections/meta-portfolio-dialog.tsx` (dark, minimalista, alto contraste, bordas sutis — padrão Vercel/Supabase):
- Abre automaticamente quando o postMessage do OAuth traz `sessionId`.
- Tabs `Páginas do Facebook` e `Contas do Instagram` (Radix Tabs já usado no projeto).
- Cada item: avatar (`picture`/`profile_picture_url`), nome, handle (IG), badge do estado ("Conectada" / "Disponível") e `Switch` chamando `linkMetaAccount`/`unlinkMetaAccount` com feedback via `sonner`.
- Ajustar `meta-integration-card.tsx` para (a) abrir o dialog após conectar, (b) exibir todas as linhas ativas agrupadas por canal.

## 4. Backend — Webhooks

Novo endpoint `src/routes/api/public/meta/webhook.ts` (público, verificação própria):
- `GET`: verificação de subscrição (`hub.mode=subscribe`, valida `hub.verify_token` contra `META_WEBHOOK_VERIFY_TOKEN`, retorna `hub.challenge`).
- `POST`: valida assinatura `X-Hub-Signature-256` com HMAC-SHA256(body, `META_APP_SECRET`) em tempo constante.
- Roteador:
  - `object === "page"` → cada `entry.id` é um Page ID → busca `social_connections` por `channel='facebook'` + `external_id`.
  - `object === "instagram"` → `entry.id` é o IG Business ID → busca por `channel='instagram'` + `external_id`.
  - Ignora entries sem match (log estruturado, retorna 200 rapidamente conforme exigência Meta).
- Persiste evento em `brain_events` (`kind='meta_webhook'`, `brand_id` derivado) para processamento assíncrono. Retorna `200 OK` em < 500ms.

## 5. Migração

Uma migration criando:
- `public.meta_oauth_sessions` + GRANTs + RLS (SELECT/DELETE próprios via `user_id = auth.uid()` e membership; `service_role` full).
- Índice em `social_connections(channel, external_id)` para lookup de webhook.

## 6. Secrets

- Verificar `META_WEBHOOK_VERIFY_TOKEN` (gerar via `generate_secret` se ausente) — o usuário só precisa configurar a URL de webhook e o verify token no App Dashboard da Meta.

## Detalhes técnicos

- Reaproveita `MetaProvider`, `encryptCredential`/`decryptCredential`, `signOAuthState`/`verifyOAuthState` já existentes.
- `listPagesWithInstagram` já traz `picture` e `profile_picture_url` — nenhum campo novo na Graph API.
- Regra de idempotência mantida: `(brand_id, provider, external_id)` unique upsert; troca de conta no mesmo canal apaga a antiga (mesmo helper `upsertChannel` extraído para função reutilizável).
- Webhook nunca faz chamadas pesadas inline; apenas classifica + enfileira em `brain_events`.

## Arquivos afetados

- `supabase/migrations/*` (nova migration)
- `src/routes/api/public/meta/callback.ts` (grava sessão em vez de conexão)
- `src/routes/api/public/meta/webhook.ts` (novo)
- `src/lib/meta/portfolio.functions.ts` (novo)
- `src/lib/meta/provider.server.ts` (helpers de verify signature, se necessário)
- `src/components/connections/meta-portfolio-dialog.tsx` (novo)
- `src/components/connections/meta-integration-card.tsx` (integração com o dialog + listagem por canal)
