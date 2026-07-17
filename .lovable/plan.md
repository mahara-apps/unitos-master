## Plano de correção do Chat do Brain

### Diagnóstico confirmado
- O chat ainda está chamando o LLM via `generateText` com `system` separado de `messages` em `src/lib/brain/chat-gateway/llm.server.ts`.
- O erro exibido na tela indica que o gateway/modelo rejeita mensagens de sistema no payload atual: `System messages are not allowed in the prompt or messages fields`.
- O histórico enviado ao modelo inclui mensagens do banco sem filtrar papel `system`, mesmo o tipo do banco permitindo `role: "system"`.
- Os logs do AI Gateway não registraram chamadas recentes com erro, então a primeira correção deve ser no contrato do payload antes de investigar infra/créditos.

### Correção proposta
1. **Reescrever o payload do LLM no Chat Gateway**
   - Trocar a chamada atual por um formato compatível com o AI SDK/Gateway: usar `instructions` para o contexto do Brain, em vez de `system`/mensagem system.
   - Manter a pergunta e o histórico como mensagens `user`/`assistant` apenas.
   - Filtrar qualquer mensagem `system` do histórico antes de enviar ao modelo.

2. **Atualizar o modelo do chat para geração atual**
   - Substituir `google/gemini-2.5-flash` por um modelo atual suportado, preferencialmente `google/gemini-3.5-flash`, mantendo baixo atrito e boa latência.
   - Atualizar o rótulo persistido em `chat_messages.model` para refletir o modelo real.

3. **Blindar anexos e perguntas vazias**
   - Garantir que, quando houver anexos, a pergunta final enviada ao modelo seja uma mensagem `user` simples e não introduza nenhum papel inválido.
   - Preservar a regra atual: anexos permitem pergunta sem texto; sem anexos continua bloqueando “Mensagem vazia”.

4. **Melhorar fallback de erro sem mascarar problema real**
   - Manter resposta de fallback com contexto do Brain se o LLM falhar.
   - Remover exposição bruta excessiva do erro ao usuário final ou deixar em formato mais limpo, mantendo log técnico no servidor.

5. **Validar fluxo completo**
   - Verificar envio de nova mensagem em `/chat/:conversationId`.
   - Confirmar que a resposta não contém mais o erro `System messages are not allowed...`.
   - Confirmar que a mensagem do usuário e a resposta do assistente persistem e aparecem na conversa.
   - Conferir logs do AI Gateway após o teste para garantir chamada bem-sucedida ou diagnosticar erro externo se ainda houver falha.

### Arquivos previstos
- `src/lib/brain/chat-gateway/llm.server.ts`
- `src/lib/chat.functions.ts` somente se necessário para filtrar/normalizar histórico antes da chamada

### Fora do escopo
- Não alterar UI do chat.
- Não criar novas funcionalidades no Brain.
- Não alterar arquitetura de memória, diagnósticos, eventos ou banco de dados.