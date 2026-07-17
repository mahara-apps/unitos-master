# Brain Platform

O Brain é uma **plataforma interna independente** dentro da UNITOS. Ele consolida
eventos, memórias, insights, recomendações e conhecimento relacional da agência.

## Regra de arquitetura

> **Nenhum módulo da plataforma acessa tabelas `brain_*` diretamente.**
> Todo acesso passa pela **Brain API** exportada em `src/lib/brain/api.ts`.

```ts
import { brain } from "@/lib/brain/api";

const knowledge = await brain.chat.consolidate(ctx, { query: "…" });
const memories  = await brain.memory.list(ctx);
await brain.events.publish(ctx, { source_module: "chat", event_type: "chat.turn", ... });
```

Comportamento externo **não muda** com esta reorganização — apenas o layout
interno passa a ser modular.

## Componentes

| Módulo | Responsabilidade | Namespace |
|---|---|---|
| **Brain Core** | Tipos, `BrainContext`, contrato compartilhado | `./core` |
| **Event Bus** | Publicar/ler eventos (`brain_events`) | `brain.events` |
| **Learning Engine** | Fila e worker assíncronos (`brain_learning_queue`) | `brain.learning` |
| **Memory Store** | Memórias consolidadas (`brain_memory`) | `brain.memory` |
| **Knowledge Graph** | Nós e arestas (`brain_relationships`) | `brain.graph` |
| **Insight Engine** | Insights ativos (`brain_insights`) | `brain.insights` |
| **Recommendation Engine** | Recomendações (`brain_recommendations`) | `brain.recommendations` |
| **Query Engine** | Busca semântica, embeddings e stats | `brain.query` |
| **Chat Gateway** | Consolidação Brain-first + fallback LLM | `brain.chat` |

## Boundary rules

1. Apenas arquivos sob `src/lib/brain/**` podem `.from("brain_*")` ou `.rpc(...)` que toca tabelas Brain.
2. Módulos internos dependem **apenas** de `./core` — nunca de módulos irmãos.
   Composições vivem em `api.ts`.
3. Chamadas ao LLM ficam em `.server.ts` (server-only) para bloquear inclusão
   no bundle client.
4. `BrainContext` carrega o supabase autenticado (RLS aplicada como o usuário);
   nunca use `supabaseAdmin` sem verificar o papel do chamador antes.

## Compatibilidade

Os arquivos `src/lib/brain-*.functions.ts` continuam existindo por
compatibilidade — nada foi apagado. Eles agora funcionam como fronteira
pública do Brain (marcados com um comentário-guardrail) e devem, ao longo do
tempo, delegar sua lógica para os módulos em `src/lib/brain/`.