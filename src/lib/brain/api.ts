// ============================================================================
// Brain API — ÚNICO ponto de entrada público da plataforma Brain.
//
// Regra de arquitetura:
//   - Apenas arquivos sob `src/lib/brain/**` podem acessar tabelas `brain_*`.
//   - Todo consumidor externo (rotas, componentes, outros *.functions.ts) usa
//     `brain.<módulo>.<método>`.
//   - Cada método recebe um `BrainContext` com o supabase autenticado + escopo.
//
// Componentes internos:
//   1. Brain Core            → tipos e contrato compartilhados
//   2. Event Bus             → publicação/leitura de brain_events
//   3. Learning Engine       → fila e worker de aprendizado
//   4. Memory Store          → memórias consolidadas
//   5. Knowledge Graph       → nós e arestas
//   6. Insight Engine        → insights ativos
//   7. Recommendation Engine → recomendações
//   8. Query Engine          → busca semântica, embeddings, stats
//   9. Chat Gateway          → orquestração Brain-first + LLM fallback
// ============================================================================
import * as events from "./event-bus";
import * as memory from "./memory";
import * as graph from "./graph";
import * as insights from "./insights";
import * as recommendations from "./recommendations";
import * as learning from "./learning";
import * as query from "./query";
import * as chatGw from "./chat-gateway";
import * as services from "./services";
import * as context from "./context-engine";
import type { BrainContext } from "./core";
import type { BrainConsolidated, ChatAttachmentMeta } from "./chat-gateway";

// Legacy server functions (mantidas aqui como parte oficial da Brain
// Platform — antes viviam em `src/lib/brain-*.functions.ts`).
// Reexportadas para que consumidores externos NUNCA importem os arquivos
// legados diretamente. Todo acesso deve ser via `brain.*` ou via estes
// nomes de conveniência re-exportados abaixo.
import { brainConsolidateFn } from "./legacy/brain-consolidate.functions";
import {
  brainGraphFn,
  type BrainGraph,
  type GraphNode,
} from "./legacy/brain-graph.functions";
import {
  brainIntelligenceFn,
  type BrainIntelligence,
} from "./legacy/brain-intelligence.functions";
import { ingestBrainQuiet } from "./ingest-quiet.server";

export {
  brainConsolidateFn,
  brainGraphFn,
  type BrainGraph,
  type GraphNode,
  brainIntelligenceFn,
  type BrainIntelligence,
};

// Stream hook — reexport-only shim para consumo por componentes React.
export { useBrainStream, type BrainStreamEvent } from "./stream/use-brain-stream";

export type { BrainContext };
export type * from "./core";

export const brain = {
  events,
  memory,
  graph,
  insights,
  recommendations,
  learning,
  query,
  context,
  // ---- API pública de alto nível (consumida por todos os módulos) ----
  learn: services.learn,
  remember: services.remember,
  evolveMemory: services.evolveMemory,
  touchMemories: services.touchMemories,
  memoryVersions: services.memoryVersions,
  decayMemories: services.decayMemories,
  searchKnowledge: services.searchKnowledge,
  generateInsights: services.generateInsights,
  recommend: services.recommend,
  runQuery: services.query_,
  relate: services.relate,
  findPatterns: services.findPatterns,
  registerEvent: services.registerEvent,
  getContext: services.getContext,
  buildContext: services.buildContext,
  recordContextUsage: services.recordContextUsage,
  summarize: services.summarize,
  getRecommendations: services.getRecommendations,
  // ---- Ingest de background (fire-and-forget) ----
  ingestQuiet: ingestBrainQuiet,
  // ---- Server fns legadas expostas via API oficial ----
  consolidateFn: brainConsolidateFn,
  graphFn: brainGraphFn,
  intelligenceFn: brainIntelligenceFn,
  chat: {
    consolidate: chatGw.consolidate,
    tryDirectAnswer: chatGw.tryDirectAnswer,
    /** Chamada ao LLM — carrega o módulo server-only sob demanda. */
    async callLlm(args: {
      question: string;
      history: Array<{ role: string; content: string }>;
      brain: BrainConsolidated;
      attachments: ChatAttachmentMeta[];
    }) {
      const mod = await import("./chat-gateway/llm.server");
      return mod.callLlm(args);
    },
  },
} as const;

export type BrainAPI = typeof brain;