## Diagnóstico (confirmado no banco)

O Instagram **está sim conectado** na marca (`social_connections`: `leodaacademia_`, status `active`), mas o Analytics do cliente aparece vazio porque **nenhum registro existe em `client_social_accounts`** para o cliente "Vereador Léo da Academia" (nem para nenhum outro cliente da marca).

Como o Analytics agora é escopado por cliente ativo (mudança anterior), ele filtra as conexões via a junction `client_social_accounts` — vazia → empty state "Esta marca ainda não tem canais sociais conectados". A mensagem induz ao erro: sugere ir em **Integrações**, quando o problema é o **vínculo com o cliente**, feito em **Perfil do Cliente → Canais**.

Além disso o print da tela de Integrações mostra "Facebook · 1 conta", mas no banco só existe 1 conexão de canal `instagram`. O contador do card de Facebook está lendo `metadata.page_*` da conexão de Instagram, o que é enganoso.

## Escopo do fix

1. **Corrigir a mensagem de empty state do Analytics do cliente** (`social-analytics-dashboard.tsx` no bloco em que não há canais):
   - Detectar `clientId` ativo e trocar o texto para: "Este cliente ainda não tem canais atribuídos. Abra **Perfil → Canais** para vincular contas já conectadas na marca."
   - Botão primário "Ir para Canais" → navega para `/app/customers/$customerId?tab=channels`.
   - Botão secundário "Conectar nova conta" → `/app/connections` (fluxo atual).

2. **Auto-vincular ao cliente ativo na conexão nova** (`src/lib/meta/*` handler do callback OAuth / finalização do Portfolio):
   - Após criar/atualizar linhas em `social_connections`, se o usuário disparou o OAuth a partir de um contexto de cliente (passar `clientId` no `state` do OAuth já suportado pelo `startMetaOAuth`), inserir automaticamente em `client_social_accounts` (upsert por `client_id,connection_id`).
   - Quando não houver `clientId` no state (conexão feita no hub global `/connections`), manter comportamento atual (sem vínculo automático) e apenas mostrar toast "Conta conectada — atribua a um cliente em Perfil → Canais".

3. **Corrigir contadores da tela `/connections`** (`connections/*` — card por rede):
   - Contar por `channel` (`instagram`, `facebook`, `tiktok`…) em vez de derivar de metadata; se não há linha com `channel='facebook'` e status ativo, mostrar "Desconectado" mesmo que exista Instagram na mesma sessão Meta.
   - Um botão "Ativar Facebook" no card, que reabre o `MetaPortfolioDialog` filtrado para páginas do Facebook (o Portfolio já traz as páginas — só falta persistir a linha `channel='facebook'`).

4. **Atalho de "Atribuir a cliente" no card conectado em `/connections`**:
   - Dropdown com clientes da marca; toggle usa o mesmo `toggleClientChannelFn`.
   - Mesma ação já existe em Canais do cliente — reaproveitar `useServerFn(toggleClientChannelFn)`.

5. **Invalidação de cache**:
   - Após vincular/desvincular (`toggleClientChannelFn`), invalidar as chaves `["brand-social-dashboard", brandId, period, clientId]` e `["brand-social-top", ...]` (hoje só invalida `client-channels`), para o Analytics recarregar sem F5.

## Detalhes técnicos

- Arquivos alterados:
  - `src/components/analytics/social-analytics-dashboard.tsx` — empty state contextual.
  - `src/components/customer/channels-tab.tsx` — nada estrutural; garantir invalidate cruzado.
  - `src/lib/meta/meta.functions.ts` / `portfolio.functions.ts` — auto-link quando `state.clientId` presente; persistir `channel='facebook'` separado do `instagram`.
  - `src/routes/_authenticated/connections.tsx` (ou equivalente) — contadores por `channel`; dropdown de atribuição a cliente.
- **Sem migração** — schema já suporta tudo (`client_social_accounts` com `onConflict client_id,connection_id`; `social_connections.channel` já existe).
- Sem mudança de RLS — políticas atuais em `client_social_accounts` já cobrem insert/delete via `has_workspace_access`.

## Fora do escopo
- Novos providers (TikTok/LinkedIn/YouTube) continuam "em breve".
- Refactor visual da tela `/connections` — só ajuste de contador + dropdown.
