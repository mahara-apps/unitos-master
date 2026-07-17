## Problema
1. O chat responde "não tenho seu nome" apesar de o usuário estar logado — o `userId` já está no `brainCtx`, mas o nome nunca é buscado nem injetado nas `instructions` do LLM.
2. As respostas parecem engessadas: prompt atual pede "markdown, bullets quando ajudar", o modelo abusa de **negrito**, listas longas e enumera todas as capacidades a cada turno.

## Mudanças

### 1. Injetar identidade do usuário (`src/routes/api/chat.stream.ts`)
- Após resolver `userId`, buscar em paralelo com o resto do contexto:
  ```ts
  supabase.from("user_profiles").select("full_name, display_name").eq("id", userId).maybeSingle()
  ```
- Derivar `userName` (primeiro nome de `display_name` → `full_name` → `email` antes do `@` como fallback).
- Passar `user: { id, name, email }` para `streamAnswer(...)`.

### 2. Prompt novo (`src/lib/brain/chat-gateway/llm.server.ts` → `buildInstructions`)
Reescrever para tom conversacional, curto e cadenciado:

- Adicionar bloco "Usuário atual: {name} ({email})" no topo → o modelo passa a chamar pelo nome naturalmente e nunca mais responde "não sei seu nome".
- Diretrizes de estilo (substituem as atuais):
  - Fale como um copiloto humano, não como um FAQ.
  - Respostas curtas por padrão (1–3 frases). Só expanda quando o usuário pedir detalhe ou a pergunta exigir.
  - Nada de listar todas as capacidades a cada resposta. Só mencione uma ação quando fizer sentido para a pergunta atual.
  - Evitar excesso de **negrito** e bullets. Bullets só com 3+ itens realmente paralelos.
  - Saudações (oi, olá, tudo bem?) → responder curto e devolver a bola ("Oi, {nome}. No que te ajudo?"), sem menu.
  - Perguntas sobre o próprio usuário → responder direto usando o nome/email conhecidos.
  - Só usar ferramentas quando a pergunta pedir dado real (clientes, tarefas, posts, memória do Brain).

### 3. Assinatura de `streamAnswer` e `callLlm`
Adicionar campo opcional `user?: { name?: string; email?: string }` em `StreamAnswerArgs` e nos args de `callLlm`, propagado para `buildInstructions(brain, user)`.

## Detalhes técnicos
- `user_profiles` já é lida em outros pontos autenticados; usa RLS do próprio usuário — sem risco de vazamento.
- Nenhuma mudança de schema, migration ou UI. Só backend do chat.
- Sem alteração no modelo (`google/gemini-3.5-flash`) nem no pipeline de tools/Reasoning Engine.
- `temperature` mantida em 0.4; a cadência vem do prompt, não do sampling.

## Fora de escopo
- Persistir preferências de estilo por usuário.
- Streaming de "digitando…" ou pausas artificiais entre frases (o streaming de tokens já cadencia naturalmente).
