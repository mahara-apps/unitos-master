## Objetivo

Elevar o Chat da Unitos para paridade com assistentes premium: entender imagens/PDFs enviados, transmitir a resposta token a token, e executar ações reais no sistema via tool-calling — mantendo a arquitetura Brain-first (contexto sempre consolidado antes do LLM).

---

## 1. Visão multimodal real (imagens + PDFs + áudio)

Hoje `callLlm` só envia **metadados** dos anexos. Vou passar o conteúdo real ao modelo.

- **Storage → URL assinada**: no `sendChatMessageFn`, para cada anexo em `chat-attachments`, gerar `createSignedUrl(path, 3600)` antes de chamar o LLM.
- **Bloco por tipo** (formato OpenAI-compatible que o Gateway aceita):
  - `image/*` → `{ type: "image_url", image_url: { url } }`
  - `application/pdf` e outros documentos → `{ type: "file", file: { filename, file_data: "data:<mime>;base64,..." } }` (download + base64 no server, pois `file` não aceita URL)
  - `audio/*` (webm/mp4/mp3/wav) → `{ type: "input_audio", input_audio: { data: base64, format } }`
- **Refator do `callLlm`**: mudar `messages` do `ModelMessage[]` para o formato bruto de chat-completions com `content: Array<block>` e fazer `fetch` direto ao Gateway quando houver anexos (o AI SDK não suporta `audio/webm`). Sem anexos, mantém `generateText`.
- **Modelo**: continuar em `google/gemini-3.5-flash` (aceita T, I, A, V → T).
- Registrar no `brain_context.attachments_processed` quantos foram enviados ao modelo.

## 2. Streaming token a token

Hoje `generateText` bufferiza toda a resposta.

- **Novo endpoint HTTP**: `src/routes/api/chat.stream.ts` (server route, não server function) — recebe `{ conversationId, content, attachments }`, autentica via cookie Supabase, chama `streamText`, retorna `toUIMessageStreamResponse()` com header `X-Lovable-AIG-Run-ID`.
- **Persistência pós-stream**: usar `onFinish` do `streamText` para gravar `chat_messages` (assistant) + `brain.recordContextUsage` + `brain.events.publish` no final. O user message continua sendo persistido antes de abrir o stream.
- **Cliente**: substituir `useMutation(sendChatMessageFn)` em `chat-conversation.tsx` por leitor de stream (`fetch` + `getReader`) com placeholder do assistant crescendo em tempo real. Toast de erro em 429/402.
- **Fast-path direto (sem LLM)**: mantém rota atual — só entra streaming quando há chamada ao modelo.

## 3. Tool-calling (ações reais)

Dar ao chat acesso a ferramentas seguras, executadas server-side com RLS do usuário logado.

- **Toolkit inicial** (`src/lib/brain/chat-gateway/tools.server.ts`) usando `tool()` do AI SDK:
  - `search_customers({ query })` — busca em `customers` do brand ativo
  - `create_task({ title, description?, due_date?, assignee_id?, customer_id? })` — insere em `tasks` (com `needsApproval: true`)
  - `search_content({ query, stage? })` — busca posts/placements
  - `schedule_post({ post_id, scheduled_at, placement_ids[] })` — atualiza `post_placements` (`needsApproval: true`)
  - `list_overdue_tasks()` — retorna tarefas fora do SLA do brand
  - `brain_recall({ query, kind? })` — proxy explícito para `brain.query.semantic` (permite "cite a memória sobre X")
- **Loop**: `streamText({ tools, stopWhen: stepCountIs(50) })`.
- **Approval UI**: quando uma tool tem `needsApproval`, o stream emite tool-call parts com estado `input-available` → cliente renderiza cartão "Confirmar ação" com botões Aprovar/Cancelar; resposta do usuário é enviada como `addToolResult` no próximo turno.
- **Rendering**: `chat-conversation.tsx` passa a iterar `message.parts` e renderizar `type === "tool-*"` com cards distintos (executando, resultado, erro, aguardando aprovação).
- **Segurança**: cada handler roda sob `context.supabase` do usuário (RLS aplicada). Nenhuma tool importa `supabaseAdmin`.

---

## Detalhes técnicos

**Arquivos novos**
- `src/routes/api/chat.stream.ts` — endpoint SSE
- `src/lib/brain/chat-gateway/tools.server.ts` — catálogo de tools
- `src/lib/brain/chat-gateway/multimodal.server.ts` — helpers para signed URL / base64 / bloco por MIME

**Arquivos editados**
- `src/lib/brain/chat-gateway/llm.server.ts` — aceita `attachments` reais e `tools`, exporta `streamAnswer` além de `callLlm`
- `src/lib/chat.functions.ts` — `sendChatMessageFn` só cobre fast-path direto e persistência do user; caminho LLM sai para o endpoint HTTP
- `src/components/chat/chat-conversation.tsx` — troca mutation por stream reader, renderiza `parts` (text/tool-call/tool-result), UI de aprovação
- `src/integrations/supabase/*` — helper para ler sessão dentro do route handler

**Schema (migration)**
- Coluna `tool_calls jsonb` em `chat_messages` para persistir invocações e resultados de tools (auditoria + replay).

**Fora de escopo desta etapa**
- Geração de imagem pelo chat (deixar para depois — já existe pipeline separado em `/media`).
- Voice output (TTS).
- MCP externo (nossos usuários conectarem ChatGPT ao Unitos — separado).

---

## Ordem de execução

1. Migration `chat_messages.tool_calls`
2. Multimodal helpers + refator do `callLlm` com blocos tipados
3. Route `api/chat.stream.ts` com `streamText` + `onFinish` (sem tools ainda)
4. Cliente: stream reader + placeholder crescente
5. Catálogo de tools + `stopWhen` + persistência de `tool_calls`
6. UI de tool-parts + fluxo de approval
7. Validar via Playwright: enviar imagem, ver streaming, criar tarefa via chat aprovando o card

## Validação final

- Enviar foto de brief → chat descreve o conteúdo
- Enviar PDF → chat resume seções
- Perguntar "quais tarefas estão atrasadas?" → tool `list_overdue_tasks` roda e resposta cita os títulos
- Pedir "crie uma tarefa 'Revisar copy' para amanhã" → card de aprovação; ao aprovar, tarefa aparece em `/tasks`
- Verificar log do Gateway em cada caso (multimodal, streaming, tool-call)
