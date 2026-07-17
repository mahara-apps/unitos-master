## Objetivo

Consolidar o Brain como uma **plataforma interna independente** dentro da UNITOS, sem alterar comportamento externo nem remover funcionalidades. Apenas reorganização modular, com interfaces claras e um ponto único de entrada — a **Brain API**.

## Estado atual (verificado)

Hoje a lógica do Brain está espalhada em vários `*.functions.ts` que fazem SQL direto sobre as tabelas `brain_*`:

- `src/lib/brain-ingest.functions.ts` — ingestão de eventos
- `src/lib/brain-learning.functions.ts` — worker/fila de aprendizado
- `src/lib/brain-memory.functions.ts` — consulta de memórias
- `src/lib/brain-consolidate.functions.ts` — consolidação
- `src/lib/brain-graph.functions.ts` — grafo
- `src/lib/brain-retrieve.functions.ts` — busca semântica
- `src/lib/brain-stats.functions.ts` — métricas
- `src/lib/brain-intelligence.functions.ts` — agregações da tela Brain
- `src/lib/brain-infra.functions.ts` — infra
- `src/lib/brain-embed.server.ts` — embeddings
- `src/lib/chat.functions.ts` — chat lê `brain_events`, `brain_insights`, `brain_memory` diretamente
- Diversas rotas (`_authenticated/brain.tsx`, `brain.graph.tsx`, `chat.*`) consomem essas funções em ordem arbitrária.

**Nada será apagado.** Todos os `*.functions.ts` acima continuam existindo e continuam funcionando exatamente como hoje (compatibilidade total). Apenas passam a ser **fachadas finas** que delegam para os módulos internos.

## Nova arquitetura interna

Criar a pasta `src/lib/brain/` com módulos server-only desacoplados. Cada módulo expõe uma interface TypeScript, e nenhum consumidor externo importa esses módulos diretamente — só a Brain API.

```text
src/lib/brain/
├── core/               # Brain Core — bootstrap, config, tipos compartilhados, contexto
│   ├── types.ts
│   ├── context.ts      # BrainContext (supabase, userId, scope brand/client)
│   └── index.ts
├── event-bus/          # Event Bus — publicar/consumir eventos
│   ├── publisher.ts    # publish(event)
│   ├── subscriber.ts   # (leitura para telas ao vivo)
│   └── index.ts
├── learning/           # Learning Engine — fila + worker + WMA de confiança
│   ├── queue.ts
│   ├── worker.ts
│   └── index.ts
├── memory/             # Memory Store — CRUD/consulta de brain_memory
│   ├── store.ts        # list/search/filter/group/relate
│   ├── consolidation.ts
│   └── index.ts
├── graph/              # Knowledge Graph — nós/arestas + traversal
│   ├── edges.ts
│   ├── query.ts
│   └── index.ts
├── insights/           # Insight Engine — geração e leitura de brain_insights
│   ├── generator.ts
│   ├── reader.ts
│   └── index.ts
├── recommendations/    # Recommendation Engine — brain_recommendations
│   ├── generator.ts
│   ├── reader.ts
│   └── index.ts
├── query/              # Query Engine — busca semântica, retrieval, stats
│   ├── semantic.ts     # embeddings + match_brain_events (RPC)
│   ├── stats.ts        # counters de posts/tasks/projects escopo brand
│   └── index.ts
├── chat-gateway/       # Chat Gateway — orquestração Brain-first + LLM fallback
│   ├── consolidate.ts  # monta contexto (memória + insights + stats)
│   ├── direct-answer.ts
│   ├── llm.ts          # chamada ao AI Gateway
│   └── index.ts
└── api.ts              # Brain API — ÚNICO ponto público (namespace `brain`)
```

### Brain API (fachada única)

`src/lib/brain/api.ts` expõe um objeto `brain` com sub-namespaces:

```ts
export const brain = {
  events:          { publish, list, subscribe },
  memory:          { list, search, filter, group, relate, consolidate },
  graph:           { addEdge, traverse, neighbors, subgraph },
  insights:        { list, generate },
  recommendations: { list, generate },
  learning:        { enqueue, processQueue, status },
  query:           { semantic, stats, retrieve },
  chat:            { consolidateContext, tryDirectAnswer, callLlm },
};
```

Regras:
- **Somente `src/lib/brain/**` pode importar tabelas `brain_*` diretamente.**
- Todo consumidor externo (rotas, componentes, outros `*.functions.ts`) usa `brain.*`.
- Cada módulo interno recebe um `BrainContext` (supabase autenticado + scope) — nenhum lê `process.env` ou constrói cliente próprio (exceto `chat-gateway/llm.ts` que precisa do `LOVABLE_API_KEY`).

### Compatibilidade — nada quebra

Cada `*.functions.ts` atual permanece como **thin wrapper** sobre `brain.*`. Exemplo:

```ts
// src/lib/brain-memory.functions.ts (depois)
import { brain } from "./brain/api";
export const listBrainMemoriesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(...)
  .handler(async ({ data, context }) =>
    brain.memory.list({ supabase: context.supabase, userId: context.userId, ...data }),
  );
```

Assim:
- Assinaturas dos `createServerFn` **não mudam**.
- Rotas e componentes continuam importando exatamente os mesmos símbolos.
- Nenhuma migration de banco. Nenhuma mudança de RLS. Nenhuma mudança em `chat_*`, `posts`, `tasks`, etc.

### Regra de acesso ("Brain como plataforma")

Adicionar comentário-guardrail no topo de cada arquivo `brain_*.functions.ts`:

```ts
// ⚠️ Brain API boundary — não acessar tabelas brain_* fora de src/lib/brain/**
```

E documentar em `DESIGN_SYSTEM.md` (nova seção "Brain Platform"):
- Diagrama dos 9 componentes
- Regra: consumir sempre via `brain.*`
- Contrato de cada módulo

## Execução — fases (cada uma isolada e verificável)

1. **Core + types + BrainContext** — criar `brain/core/*` e `brain/api.ts` vazio (só o shape).
2. **Query Engine** — mover embeddings, `match_brain_events`, counters. Fazer `brain-retrieve.functions.ts`, `brain-stats.functions.ts`, `brain-embed.server.ts` chamarem `brain.query.*`.
3. **Memory Store** — mover consulta/consolidação. `brain-memory.functions.ts` e `brain-consolidate.functions.ts` viram wrappers.
4. **Event Bus** — mover ingestão. `brain-ingest.functions.ts` vira wrapper.
5. **Learning Engine** — mover fila/worker. `brain-learning.functions.ts` vira wrapper.
6. **Insight + Recommendation** — extrair dos módulos atuais para pastas próprias.
7. **Knowledge Graph** — mover `brain-graph.functions.ts` para `brain/graph/*`.
8. **Chat Gateway** — extrair de `chat.functions.ts` toda a parte de consolidação/direct-answer/LLM para `brain/chat-gateway/*`. O `sendChatMessageFn` passa a orquestrar via `brain.chat.*` e continua persistindo em `chat_messages`.
9. **Brain Intelligence (tela)** — `brain-intelligence.functions.ts` passa a montar KPIs via `brain.memory`, `brain.insights`, `brain.events.list`.
10. **Guardrails + docs** — comentários de fronteira nos wrappers e seção no `DESIGN_SYSTEM.md`.

Ao fim de cada fase: `tsgo`, abrir `/brain`, `/brain/graph` e `/chat/*` para confirmar comportamento idêntico.

## Fora de escopo (explícito)

- Nenhuma mudança de schema, RLS, grants, triggers, `pg_cron`.
- Nenhuma mudança de UI.
- Nenhuma nova capacidade do Brain (fica para a próxima etapa que você mencionou).
- `chat_conversations` / `chat_messages` continuam onde estão (o Chat **usa** o Brain, não é parte dele).

## Riscos e mitigação

- **Import protection do Vite**: módulos com `.server.ts` continuam server-only; `brain/chat-gateway/llm.ts` será `llm.server.ts` para bloquear inclusão no bundle client.
- **Ciclos de import**: cada módulo interno só depende de `brain/core` — nunca de outro módulo irmão. Composições vivem em `brain/api.ts`.
- **Regressão silenciosa**: por a fase 8 (chat) ser a mais sensível, será a última — e mantém `sendChatMessageFn` byte-a-byte compatível na saída.
