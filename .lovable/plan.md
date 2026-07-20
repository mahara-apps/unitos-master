# Reestruturação: Conexões vs. Canais do Cliente

Sua leitura está correta — não está complicando. Vamos separar dois níveis com responsabilidades distintas.

## Modelo mental

```text
┌─────────────────────────────────────────────────────────────┐
│ /connections  (ADMIN-ONLY)                                  │
│ Integrações "pesadas" de workspace                          │
│ • Business Manager, Ads Accounts, Pixels, Catálogos         │
│ • Credenciais de API (OpenAI, Resend, Meta App, tokens)     │
│ • Webhooks, sistemas globais                                │
│ • Dashboard read-only: todas as conexões × clientes         │
└─────────────────────────────────────────────────────────────┘
                            ▼ abastece
┌─────────────────────────────────────────────────────────────┐
│ /customers/:id → aba "Canais"  (TODOS os papéis)            │
│ Conexão operacional dentro do escopo do cliente             │
│ • Toggle das contas globais já conectadas (sem re-OAuth)    │
│ • Botões "Conectar" para novas contas: IG/FB/TikTok/        │
│   LinkedIn/YouTube/Threads/X                                │
│ • Vínculo automático em client_social_accounts              │
└─────────────────────────────────────────────────────────────┘
```

## O que muda

### 1. Controle de acesso em `/connections`
- Gate no `beforeLoad` da rota: só `super_admin` e `admin` da agência entram.
- Item some do sidebar para os demais papéis (usa `hasAnyRole` no `app-sidebar.tsx`).
- Membros sem permissão que tentarem a URL vão para `/unauthorized`.

### 2. `/connections` redesenhada como hub de workspace
Três seções (tabs):
- **Integrações Globais** — Meta Business Manager, Ads Accounts, Pixels, Catálogos. Fica onde já está a lógica de OAuth atual, sem vínculo direto a cliente.
- **Credenciais de API** — UI para gerir chaves de sistema (leitura via `fetch_secrets`, edição via `add_secret` / `update_secret`). Inclui Meta App, futuros provedores.
- **Mapa de Conexões** — tabela read-only listando cada `social_connections` × clientes vinculados (via `client_social_accounts`), com status/saúde do token. Sem ação de vincular aqui.

### 3. Aba `Canais` do Cliente expandida para todos os canais
- Layout único com um card por rede social (IG, FB, TikTok, LinkedIn, YouTube, Threads, X).
- Cada card mostra:
  - Contas globais **do workspace** naquela rede, com **Switch** para ativar/desativar o vínculo (fluxo atual da Meta, replicado).
  - Botão **"Conectar nova conta"** que dispara o OAuth do provider correspondente, já passando `clientId` para vínculo automático.
- Contas não integradas ainda ("em breve") mostram badge desabilitado, sem quebrar layout.

### 4. Providers de canais (backend)
- Registrar cada rede em `src/lib/social/registry.server.ts` (hoje só Meta).
- Providers novos (TikTok, LinkedIn, YouTube, Threads, X) entram como stubs implementando a `SocialProvider` interface com `buildAuthorizeUrl`, callback e captura de conta.
- Callbacks públicos em `src/routes/api/public/{provider}/callback.ts`, todos usando o mesmo padrão cache-first já validado com Meta (só troca code por token, sem scan agressivo na Graph/API).
- `linkAccount` de cada provider aceita `clientId` opcional e grava em `client_social_accounts`.
- OAuth real de cada rede exige App/credenciais próprias — vamos deixar cada provider "pronto para plugar" (endpoint + UI funcionais) e habilitar conforme o usuário fornecer as credenciais via `add_secret` (Client ID/Secret de cada plataforma).

### 5. Fluxo de criação de cliente
- Sem mudança na criação em si (nada é pré-vinculado).
- Ao abrir o cliente recém-criado, a aba **Canais** já lista todas as contas globais do workspace com toggle desligado + CTAs de nova conexão. Isso já é o comportamento após esta refatoração.

### 6. Banco de dados
Nenhuma mudança de schema necessária. `client_social_accounts` e `social_connections` já suportam N:N e o campo `provider` distingue as redes. Só entram novos valores de `provider` conforme adicionarmos APIs.

## Escopo desta entrega

**Nesta iteração (build imediato):**
- Gate admin em `/connections` + sidebar condicional.
- Redesenho de `/connections` nas 3 tabs (Integrações Globais / Credenciais / Mapa read-only).
- Expansão da aba `Canais` do cliente para renderizar todas as redes, com fluxo Meta 100% funcional e placeholders visuais para as demais.
- Registry pronto para receber novos providers.

**Iterações seguintes (uma rede por vez, sob demanda):**
- Implementar OAuth real de TikTok, LinkedIn, YouTube, Threads, X — cada uma precisa de credenciais do usuário e ativa individualmente.

## Detalhes técnicos

- **Permissão**: adicionar `beforeLoad` em `src/routes/_authenticated/connections.tsx` chamando `hasAnyRole(['super_admin','admin'])` do `use-access-role`. Sidebar (`app-sidebar.tsx`) esconde o link com o mesmo helper.
- **Mapa read-only**: server fn `listWorkspaceConnectionsWithClientsFn` faz join `social_connections` ⨝ `client_social_accounts` ⨝ `clients`, retorna tabela plana.
- **Credenciais UI**: usa tools `fetch_secrets` no server (nunca expõe valor), edição sempre via `update_secret`/`add_secret` (abre form seguro).
- **Aba Canais**: refatorar `channels-tab.tsx` para agrupar por `channel` em vez de listar tudo plano; cada seção usa o mesmo componente reaproveitável `ChannelSection` com Switch + botão conectar.
- **Provider registry**: adicionar entradas com metadados (label, ícone, `oauthAvailable: boolean`) em `registry.server.ts` para o front renderizar cards mesmo antes do OAuth existir.
