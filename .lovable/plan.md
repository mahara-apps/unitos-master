## Diagnóstico confirmado

- **Nenhuma conta Meta foi realmente criada em `social_connections`**: a tabela está vazia para `provider='meta'`.
- **Nenhum vínculo cliente ↔ conta existe em `client_social_accounts`**: por isso a aba **Canais** do cliente mostra “Nenhuma conta social conectada”.
- **O cache atual de OAuth está inconsistente**: a sessão mais recente tem `pages_count=0`, enquanto sessões anteriores chegaram a ter `91/119` páginas e `75` contas Ads.
- **O fluxo ainda pode consumir Graph API em excesso** porque cache vazio (`[]`) é tratado como “precisa buscar de novo”. Isso gera novo scan em cada abertura quando a Meta retorna vazio/rate limit.
- **O link atual não atende multi-conta por canal**: `linkMetaAccount` apaga outras conexões do mesmo `brand + channel` antes de salvar a nova, o que explica comportamento de “página errada” e perda de seleção.

## Do I know what the issue is?

Sim. O problema não é só UI: o fluxo precisa ser refeito porque mistura três responsabilidades que devem ser separadas:

```text
OAuth Meta
  apenas autentica e salva token

Portfólio Meta
  carrega/cacheia contas com proteção anti-rate-limit

Vínculo do cliente
  atribui social_connection ao client_id ativo
```

Hoje o app abre o seletor com sessão vazia, tenta varrer a Graph API repetidamente, não reaproveita corretamente o último portfólio válido, e ao selecionar uma conta cria vínculo global — não vínculo com o cliente.

## Plano de correção 100% estrutural

1. **Congelar o consumo da Graph API por padrão**
   - O modal não fará scan automático quando abrir.
   - Se existir portfólio válido anterior para o mesmo `brand_id + meta_user_id`, ele será reutilizado.
   - A Graph API só será chamada por ação explícita: **Sincronizar portfólio**.
   - Em rate limit, salvar um estado de cooldown no banco para bloquear novas tentativas automáticas por alguns minutos.

2. **Adicionar metadados de cache na sessão Meta**
   - Criar campos de controle em `meta_oauth_sessions`, por exemplo:
     - `portfolio_loaded_at`
     - `portfolio_load_status`
     - `portfolio_error`
     - `portfolio_rate_limited_until`
   - Isso diferencia:
     - “nunca carregou”
     - “carregou e veio vazio”
     - “falhou por rate limit”
   - Assim `[]` deixa de ser gatilho para loop infinito.

3. **Reutilizar último portfólio válido**
   - Ao finalizar OAuth, salvar só o token e identidade.
   - Ao abrir o seletor, antes de consultar a Graph API, copiar/reaproveitar o último cache válido do mesmo usuário Meta e mesma marca.
   - Isso evita perder as `91/119` páginas já descobertas em sessões anteriores.

4. **Refatorar `linkMetaAccount` para multi-tenant real**
   - Remover a lógica que apaga outras contas do mesmo canal.
   - Permitir múltiplas contas Instagram/Facebook/Threads por marca.
   - Corrigir o identificador usado para Instagram:
     - Facebook usa `pageId`.
     - Instagram usa `instagramBusinessId`.
     - O payload de seleção precisa deixar isso explícito para não salvar a página errada.

5. **Conectar e atribuir em uma única ação contextual**
   - Quando o usuário estiver no perfil do cliente, selecionar uma conta deve:
     1. criar/atualizar `social_connections`;
     2. criar o vínculo em `client_social_accounts` para o `client_id` ativo.
   - Quando o usuário estiver em `/connections`, selecionar uma conta cria apenas conexão global, sem cliente.
   - A UI deve deixar isso claro: “Conectar ao workspace” vs “Atribuir a este cliente”.

6. **Corrigir a aba Canais do cliente**
   - A aba deve listar todas as `social_connections` reais do workspace.
   - O toggle deve operar apenas em `client_social_accounts`.
   - Depois de conectar uma conta pelo seletor contextual, a lista deve invalidar/refazer a query e mostrar a conta imediatamente.

7. **Corrigir o Calendário**
   - O wizard **Novo agendamento** deve ler somente `client_social_accounts` do cliente ativo.
   - Validar que o `connection_id` ainda existe e está `active`.
   - Se não houver canais atribuídos, mostrar CTA direto para a aba **Perfil > Canais** do cliente.

8. **Reduzir drasticamente chamadas da Graph API**
   - Para Instagram, buscar só páginas com `instagram_business_account`.
   - Não varrer Ads/Business/Threads no fluxo de Instagram.
   - Não fazer chamadas extras por perfil para imagem/nome quando esses dados já vierem no edge principal.
   - Remover scan amplo do `business_management` do fluxo padrão; deixar como ação avançada/manual se necessário.

9. **Validação final**
   - Confirmar que clicar em **Conectar Instagram** não dispara loop.
   - Confirmar que selecionar a página/IG cria linha em `social_connections`.
   - Confirmar que atribuir no cliente cria linha em `client_social_accounts`.
   - Confirmar que a aba **Canais** do cliente exibe a conta.
   - Confirmar que o wizard do Calendário lista a conta atribuída.
   - Confirmar que reabrir modal não aumenta consumo da Graph API sem clique em **Sincronizar**.

## Observação importante

Como o app já estourou o limite da Meta novamente, a correção deve priorizar **não chamar a Graph API automaticamente**. A primeira versão funcional deve operar sobre cache já salvo e só permitir nova varredura quando o usuário clicar conscientemente em sincronizar.

<presentation-actions>
  <presentation-open-history>View History</presentation-open-history>
</presentation-actions>

<presentation-actions>
<presentation-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</presentation-link>
</presentation-actions>