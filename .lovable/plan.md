## Problema

A resposta do LLM está falhando com:
> `Invalid prompt: System messages are not allowed in the prompt or messages fields. Use the instructions option instead.`

Causa: em `src/lib/chat.functions.ts`, a função `callLlmWithBrainContext` monta o array `messages` começando com `{ role: "system", content: ... }`. O upstream do gateway (para este modelo/rota) está rejeitando mensagens com `role: "system"` dentro de `messages` e pedindo para usar o parâmetro dedicado.

O AI SDK (`generateText`) já aceita um parâmetro `system` separado justamente para isso — ele é enviado no formato certo para cada provider, evitando o conflito.

## Correção

Em `src/lib/chat.functions.ts`, dentro de `callLlmWithBrainContext`:

1. Remover o item `{ role: "system", content: system }` do array `messages`.
2. Passar o mesmo conteúdo via parâmetro `system` no `generateText`:
   ```ts
   const result = await generateText({
     model,
     system,           // ← novo
     messages,         // ← agora só user/assistant
     temperature: 0.4,
   });
   ```
3. Manter `system` como a string já construída (identidade + regras + `brain.markdown`).
4. Ajustar o tipo do array `messages` para conter apenas `"user" | "assistant"` (remover o cast que incluía `system`).

Nada mais muda: histórico, anexos, fallback de erro e persistência da resposta permanecem iguais.

## Verificação

- Enviar a mesma pergunta ("Quais clientes tiveram mais atividade essa semana?") e confirmar que a resposta do LLM chega sem o erro.
- Checar `ai_gateway_logs` do request para garantir status 200.
