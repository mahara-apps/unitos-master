# Meta App compartilhado entre instalações do Unitos

Cada instalação (agência) tem **domínio próprio + Supabase próprio** e pode usar o
**mesmo Meta App**. Não existe Control Plane, gateway nem banco central: tokens,
conexões e eventos nunca saem do Supabase da própria instalação.

## 1. Variáveis de ambiente por instalação

Compartilhadas entre todas as instalações (mesmo Meta App):

```
META_APP_ID=<app id>
META_APP_SECRET=<app secret>
# Configuração do Facebook Login for Business (Login Configuration ID do App)
META_BUSINESS_CONFIG_ID=1066582585595980
```

Exclusivas de cada instalação:

```
PUBLIC_APP_URL=https://dominio-da-instalacao
META_REDIRECT_URI=https://dominio-da-instalacao/api/public/meta/callback
META_WEBHOOK_VERIFY_TOKEN=<token único da instalação>
META_STATE_SECRET=<segredo aleatório único da instalação>
BRAND_CREDENTIALS_SECRET=<segredo aleatório único>
CRON_SECRET=<segredo aleatório único>
SUPABASE_* / VITE_SUPABASE_*=<projeto Supabase da instalação>

# opcionais
META_EXTRA_REDIRECT_HOSTS=preview.dominio-da-instalacao
META_WEBHOOK_PEERS=https://outra-instalacao.com,https://terceira-instalacao.com
```

`META_APP_SECRET` é compartilhado, por isso o `state` do OAuth passou a ser
assinado com `META_STATE_SECRET`: um `state` emitido pela instalação A não é
válido na B.

## 2. Meta App Dashboard

- **Facebook Login → Valid OAuth Redirect URIs**: adicionar
  `https://<domínio>/api/public/meta/callback` de **cada** instalação.
- **App Domains**: adicionar o domínio de cada instalação.
- **Webhooks (Page / Instagram) → Callback URL**: a Meta aceita **uma URL por
  produto**. Aponte para a instalação "principal":
  `https://<domínio principal>/api/public/meta/webhook`, com o
  `META_WEBHOOK_VERIFY_TOKEN` dessa instalação.
- **Data Deletion / Deauthorize**: também uma URL só; aponte para a instalação
  principal (a limpeza nas demais continua sendo por instalação).

## 3. Webhook: forward entre instalações

```
Meta → https://principal/api/public/meta/webhook
        ├─ assina válida? (X-Hub-Signature-256 + META_APP_SECRET)
        ├─ entry[].id encontrado em social_connections local → brain_events (Supabase local)
        └─ entry[].id desconhecido → repassa o body cru + assinatura para META_WEBHOOK_PEERS
                                     → cada peer revalida a assinatura e resolve no SEU Supabase
```

Garantias:

- destino vem **apenas** de `META_WEBHOOK_PEERS` (infra), nunca do request → sem SSRF;
- só origens `https://` absolutas, sem credenciais; a própria origem é descartada;
- o body cru e o header de assinatura são preservados — o peer revalida;
- header `x-unitos-meta-forward: 1` impede loops (uma instalação nunca repassa uma cópia);
- timeout de 4 s por peer, falhas apenas logadas — a Meta sempre recebe 200;
- nenhum token, cookie ou credencial Supabase é enviado no forward;
- um evento sem `entry[].id` reconhecido em nenhuma instalação é simplesmente descartado.

Se webhooks não forem usados no produto, basta não definir `META_WEBHOOK_PEERS`.

## 4. Nova instalação (checklist)

1. Novo domínio + novo projeto Supabase (rodar migrations do repo).
2. Definir as env vars da seção 1 (App id/secret compartilhados, o resto único).
3. Registrar o redirect URI e o App Domain da nova instalação no App Dashboard.
4. Se usar webhooks: acrescentar a origem da nova instalação em
   `META_WEBHOOK_PEERS` da instalação que possui a Callback URL (e vice-versa se
   houver mais de um sentido).
5. Conectar as contas Meta da agência normalmente em **Canais**.
