# Contadores e identificação de mensagens não lidas

## Objetivo
Tornar mensagens pendentes imediatamente visíveis no menu e na lista de conversas, com atualização automática e marcação confiável de leitura.

## O que será feito

1. **Confirmar a causa no ambiente afetado**
   - Verificar os registros de participação e o horário da última leitura da conversa mostrada.
   - Comparar esses dados com o contador calculado para o usuário atual.
   - Corrigir a origem do contador, sem criar um segundo mecanismo paralelo.

2. **Contador geral no menu Mensagens**
   - Exibir um bubble numérico ao lado de “Mensagens” quando houver pendências.
   - Atualizar o total ao receber mensagem, abrir conversa, enviar mensagem e trocar de workspace.
   - Limitar a exibição visual a `99+`, preservando o valor real internamente.

3. **Identificação na listagem de conversas**
   - Mostrar o contador em cada conversa não lida.
   - Destacar conversas não lidas com título e prévia em maior evidência.
   - Manter conversas lidas com aparência neutra, sem bubble.
   - Exibir os totais por aba “Clientes” e “Equipe”.

4. **Regra de leitura confiável**
   - Marcar como lida somente a conversa aberta pelo usuário atual.
   - Não contar mensagens enviadas pelo próprio usuário.
   - Atualizar a leitura após a conversa carregar com sucesso, evitando apagar pendências por abertura incompleta.
   - Preservar RBAC, RLS e isolamento entre workspace, cliente e Portal.

5. **Atualização em tempo real e consistência**
   - Atualizar lista, abas e menu quando chegar uma nova mensagem.
   - Sincronizar todos os contadores imediatamente após marcar uma conversa como lida.
   - Manter a atualização periódica como recuperação caso o evento em tempo real não chegue.

6. **Validação**
   - Cobrir contagem por conversa, total geral, mensagem própria, leitura e troca de workspace.
   - Validar visualmente em desktop e celular.
   - Testar duas sessões: uma envia e a outra recebe, vê o bubble e o remove ao abrir a conversa.

## Detalhes técnicos
- Reutilizar `message_thread_participants.last_read_at` e as funções canônicas `message_unread_counts`/`message_unread_total`, que já existem.
- Revisar a ordem entre carregamento, `markThreadRead`, atualização de cache e eventos Realtime; o código visual dos bubbles já existe, então a correção deve atacar a inconsistência que impede os valores de aparecerem.
- Se houver ajuste estrutural no banco, criar apenas uma migration nova, forward-only e idempotente; migrations históricas não serão alteradas.
- Aplicar no MASTER, regenerar o delta, sincronizar versão e verificador, executar `master:check` e a suíte global sem ampliar timeout ou mascarar falhas.
- Publicação e propagação somente após autorização explícita.
