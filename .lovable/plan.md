# Auditoria READ-ONLY — WhatsApp via Evolution API no Unitos

Nada foi alterado. Diagnóstico funcional baseado somente no que existe no repositório.

## Veredito imediato

**QR Code da Evolution dentro do Unitos: NÃO EXISTE.** Não há uma única referência a
`qrcode`, `qr`, `instanceName`, `connectionState`, `instance`, base URL da Evolution em
env, cliente HTTP, webhook da Evolution ou tabela de instâncias/conversas de WhatsApp.
A busca por `EVOLUTION` em todo o projeto (fora de node_modules) retorna apenas o rótulo
de UI `whatsapp_evolution` em 5 arquivos.

Hoje o "WhatsApp Evolution" no Unitos é **apenas um slot de credencial cifrada + rótulo de
canal em KPIs/templates**. Não há integração operacional de nenhum tipo.

## Fluxo atual real (o que existe de fato)

Inventário completo dos artefatos relacionados:

- `src/routes/_authenticated/connections.tsx` — aba "Mensageria"; `whatsapp_evolution` e
  `whatsapp_cloud` aparecem em `ChannelId` e no card `ToolCredentialCard` (linhas ~109,
  ~191, ~817). O card só coleta uma API key + um "handle" e chama
  `saveToolCredential`/`removeToolCredential`. Gate de rota: `ensureFeatureEnabled("connections")`.
- `src/components/messaging/messaging-center.tsx` — define `PROVIDERS` com
  `whatsapp_evolution` (label "Base URL da instância", placeholder `https://evo.dominio.com`)
  e `whatsapp_cloud`. O campo "Base URL" é gravado **como texto livre em `metadata.handle`**;
  nada no servidor consome esse valor.
- `src/lib/connections.functions.ts` — `ToolProvider = ["resend","whatsapp_evolution","whatsapp_cloud"]`;
  `saveToolCredential` cifra a chave (AES-256-GCM) em `brand_api_credentials` e espelha
  `channels[provider] = { connected: true, handle }` em `brand_connections`.
  "Conectado" aqui significa apenas "existe uma chave salva" — não há teste contra a
  Evolution (ao contrário dos provedores de IA, que têm `verifyProviderKey`).
  `upsertChannel` também aceita `whatsapp_evolution`/`whatsapp_cloud` como canal manual.
- `src/lib/credentials-crypto.server.ts` — cifra/decifra com `BRAND_CREDENTIALS_SECRET`
  (SHA-256 → AES-256-GCM, IV aleatório, base64). Existe `decryptCredential`, mas **nenhum
  consumidor de WhatsApp** o usa (só provedores de IA).
- `src/lib/messaging-kpis.functions.ts` — KPIs de mensageria por canal, com
  `whatsapp_evolution` na lista de rótulos; lê `message_logs` com escopo por cliente.
- `src/lib/message-templates.catalog.ts` / `message-templates.functions.ts` — templates com
  canal `whatsapp`. `sendTestMessage`: e-mail sai de fato via Resend; **WhatsApp retorna
  `{ sent: false, error: "whatsapp_provider_nao_configurado" }`** e só devolve preview.
- `src/lib/messaging-log.server.ts` — ponto único de escrita em `message_logs`, com escopo
  workspace/cliente validado. Nenhum produtor de WhatsApp o chama.
- Tabelas: `public.brand_api_credentials` (migration 20260715115107, RLS
  `is_brand_member` OR super admin), `public.brand_connections` (JSON `providers`/`channels`),
  `public.message_logs` (20260715121031 + 10B 20260824225125: `client_id`, trigger
  `message_logs_guard_scope`, RLS `client_in_scope`), `public.message_templates`.
  **Não existe** tabela de instâncias, sessões, contatos, conversas ou mensagens de WhatsApp.
- Webhooks existentes (`src/routes/api/public/hooks/*`, `api/public/meta/*`) cobrem Brain,
  métricas sociais e Meta. **Nenhum endpoint da Evolution.**
- `src/components/chat/*` + `src/routes/api/chat.stream.ts` — chat é o **Brain (LLM)**,
  não caixa de entrada de WhatsApp. Zero relação com Evolution.
- `user_profiles.whatsapp` e `notification_prefs.whatsapp_client_portal` existem, mas
  nenhum código de notificação envia por WhatsApp.

### Respostas item a item

| # | Pergunta | Resposta |
|---|---|---|
| 2 | URL/base da Evolution | Só como string livre em `metadata.handle` digitada na UI. Sem env var, sem validação, sem uso no servidor. |
| 3 | API key | Cifrada em `brand_api_credentials.ciphertext` (AES-256-GCM / `BRAND_CREDENTIALS_SECRET`), `masked` para UI. Recuperação existe (`decryptCredential`) mas nunca é chamada para WhatsApp. |
| 4 | Modelo de isolamento | Chave real = `(brand_id, provider)` UNIQUE → **1 credencial por workspace por provedor**. Não há instância por cliente nem por número. `message_logs` já suporta `client_id`. |
| 5 | Criação de instância | **NÃO EXISTE.** Nenhum código cria instância na Evolution. |
| 6 | Endpoints create/QR/connectionState/logout/restart | **NÃO EXISTEM** — nenhum. |
| 7 | QR Code no sistema | **NÃO EXISTE.** Hoje o operador teria que abrir a Evolution externamente; o Unitos só guarda a chave. |
| 8 | Webhook da Evolution | **NÃO EXISTE** (sem rota, sem verificação, sem resolução de workspace/cliente/instância). |
| 9 | Envio/recebimento | Envio: **NÃO EXISTE** (só preview). Recebimento: **NÃO EXISTE**. |
| 10 | Relação com o chat atual | Nenhuma. Chat = Brain/LLM. Sem contatos, conversas, mídia ou status de WhatsApp. |
| 11 | Múltiplas instâncias simultâneas | **NÃO** — o UNIQUE `(brand_id, provider)` permite uma única credencial por workspace. |
| 12 | RBAC | Rota `/connections` é gated só por feature flag; `saveToolCredential`/`removeToolCredential` **não chamam `assertBrandMember` nem checam papel** — dependem apenas da RLS `is_brand_member`, ou seja **qualquer membro (inclusive USER) pode gravar/remover a credencial do workspace**. Pelo RBAC canônico deveria ser ADMIN (owner do workspace) e, no máximo, leitura para MANAGER. |
| 13 | Pontos genéricos / prontos p/ Cloud | `whatsapp_cloud` presente em `ToolProvider`, `ChannelId`, `PROVIDERS`, `MESSAGING_TOOLS` e `CHANNEL_LABELS`. Deve ficar fora da fase inicial (hoje é inerte, apenas ocupa UI e KPI). |

## Fluxo esperado × situação no código (item 14/15)

| Etapa esperada | Status |
|---|---|
| ADMIN entra e abre Conexões → Mensageria | FUNCIONA NO CÓDIGO (mas sem restrição de papel) |
| Configura Evolution (base URL + API key) | PARCIAL — grava chave cifrada; base URL é texto livre não usado |
| Cria/associa instância | NÃO EXISTE |
| Sistema solicita QR à Evolution | NÃO EXISTE |
| QR aparece dentro do Unitos | NÃO EXISTE |
| Usuário escaneia / `connectionState` = open | NÃO EXISTE |
| Número fica conectado (estado real persistido) | NÃO EXISTE — "conectado" = chave salva |
| Webhook configurado na Evolution | NÃO EXISTE |
| Mensagem recebida aparece no chat | NÃO EXISTE |
| Mensagem enviada pelo Unitos chega ao WhatsApp | NÃO EXISTE (`whatsapp_provider_nao_configurado`) |
| Status/log atualizado | PARCIAL — infra `message_logs` + `logMessage` pronta, sem produtor |
| Desconectar/reconectar | PARCIAL — "desconectar" apaga a credencial local; não faz logout na Evolution |

## Gaps que impedem produção

1. Sem cliente HTTP da Evolution (`baseUrl` + header `apikey`) e sem timeout/retry.
2. Sem modelo de dados de instância (nome, estado, número, `client_id`, webhook, timestamps).
3. Sem ciclo de vida: create instance, fetch QR (`/instance/connect`), `connectionState`,
   `logout`, `delete`, `restart`.
4. Sem UI de QR (polling + expiração + re-render do QR) e sem estado real na tela.
5. Sem webhook de entrada: rota `api/public/...`, verificação de autenticidade,
   resolução instância → brand/cliente, idempotência por `provider_message_id`.
6. Sem persistência de conversas/contatos/mensagens/mídia; chat atual não é inbox.
7. Sem envio real (`/message/sendText`, mídia) e sem gravação via `logMessage`.
8. Sem múltiplas instâncias (UNIQUE `(brand_id, provider)` bloqueia; base URL global do
   workspace é ambígua para várias instâncias/números).
9. Sem validação de credencial ("Testar conexão") — status "Conectado" é falso-positivo.
10. RBAC frouxo: falta guard de papel ADMIN nas funções de credencial.
11. Base URL da Evolution sem allowlist/validação → risco de SSRF quando houver chamadas
    server-side.
12. `whatsapp_cloud` exposto na UI sem implementação; deve sair do escopo inicial.

## O que já funciona (reaproveitável)

- Armazenamento cifrado por workspace (`brand_api_credentials` + AES-256-GCM).
- `message_logs` com isolamento por cliente (trigger + RLS) e o gravador canônico
  `logMessage`.
- KPIs de mensageria já segmentados por canal, incluindo `whatsapp_evolution`.
- Catálogo/editor de templates com canal `whatsapp` e renderização de variáveis.

## O que precisa ser implementado (fase Evolution-only)

- Tabela `whatsapp_instances` (brand_id, client_id nullable, instance_name único,
  base_url, estado, número, webhook token) + RLS por escopo.
- Camada server-only `evolution/*.server.ts`: create, connect/QR, state, logout, delete,
  sendText/sendMedia — sempre com credencial decifrada no handler.
- Server functions + UI: wizard "Conectar número" com QR renderizado no Unitos e polling
  de `connectionState`.
- Webhook `api/public/whatsapp/evolution` com token por instância, idempotência e
  gravação de mensagens/status.
- Inbox de WhatsApp (conversas/contatos/mensagens/mídia) separada do chat do Brain.
- Guard de papel ADMIN nas operações de conexão/desconexão + allowlist de base URL.
- Ocultar/desabilitar `whatsapp_cloud` até a fase futura.

## Checklist de teste real (quando implementado)

1. ADMIN salva base URL + API key → botão "Testar conexão" responde da Evolution.
2. Criar instância → registro persistido com `instance_name` único.
3. Solicitar QR → QR renderizado dentro do Unitos, com expiração e refresh.
4. Escanear → `connectionState` = `open` e número exibido na UI.
5. Webhook registrado na Evolution → payload de teste chega e é autenticado.
6. Mensagem recebida → aparece no inbox com brand/cliente correto (sem vazamento).
7. Envio pelo Unitos → chega no WhatsApp e gera `message_logs` com escopo certo.
8. Logout na Evolution → estado vira `close` no Unitos; reconectar gera novo QR.
9. Delete → instância removida na Evolution e no banco.
10. MANAGER/USER não conseguem conectar/desconectar; ADMIN consegue.
11. Duas instâncias simultâneas no mesmo workspace funcionam isoladas.
