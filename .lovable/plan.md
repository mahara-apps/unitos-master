
# Módulo Brain — Camada de Memória e Inteligência

Cria uma camada transversal que captura eventos de todos os módulos (Conteúdo, Briefing, Mídia Paga, Mensageria, Aprovação), gera embeddings, consolida insights e alimenta os agentes de IA com contexto histórico. Visualizado como uma **rede neural viva** no dashboard.

## 1. Schema (Supabase + pgvector)

Migração única habilitando `vector` e criando 4 tabelas isoladas por `brand_id` com RLS:

- **`brain_events`** — log bruto (event_type, source_module, payload jsonb, outcome_score)
- **`brain_embeddings`** — `vector(1536)` com índice HNSW cosine + `content_summary`
- **`brain_insights`** — insights consolidados (type, description, confidence, expires_at); `brand_id NULL` = nível agência
- **`brain_metrics_snapshots`** — séries temporais por canal/métrica

**RLS**: SELECT/INSERT restrito a membros da brand (`is_brand_member`). Super admin vê tudo. Insights agência-wide (`brand_id IS NULL`) só leitura para autenticados; escrita apenas via `SECURITY DEFINER` (job de consolidação). Grants explícitos para `authenticated` e `service_role`.

## 2. Server Functions (TanStack, não Edge Functions)

Seguindo o padrão do projeto (`createServerFn`):

- **`src/lib/brain-ingest.functions.ts`** — `brainIngestFn({brandId, eventType, sourceModule, payload})`: valida escopo, insere em `brain_events`, dispara worker de embedding em background via `waitUntil`.
- **`src/lib/brain-embed.server.ts`** — worker que chama Lovable AI Gateway (`openai/text-embedding-3-small`, 1536 dims) para eventos sem embedding e grava vetor.
- **`src/lib/brain-retrieve.functions.ts`** — `brainRetrieveFn({brandId, query, k=8})`: embeda query, roda `match_brain_events` (função SQL com `<=>` cosine), retorna top-N + insights ativos formatados como bloco pronto para prompt.
- **`src/lib/brain-consolidate.functions.ts`** — analisa eventos das últimas 24h por marca, chama Gemini para gerar insights (padrões de conteúdo aprovado, canais performantes, preferências), grava em `brain_insights`.
- **`src/routes/api/public/hooks/brain-consolidate.ts`** — endpoint público chamado por `pg_cron` diário (auth via `apikey`).

**Integração nos módulos existentes** (chamadas fire-and-forget):
- `content.functions.ts`: ingest em create/approve/reject/publish de post
- `ai-agents.functions.ts` + pipelines em `routes/api/jobs/*`: ingest em `content_generated`
- `approval.functions.ts` + `portal-public.functions.ts`: ingest em decisões do portal
- `media-plans.functions.ts`: ingest em criação/aprovação de plano
- `message-templates.functions.ts`: ingest em `message_sent`

## 3. Configuração por agente

- Coluna `brain_enabled boolean default true` em `agent_prompts`
- `buildBrandContextBlueprint` (ai-agents) passa a concatenar bloco `## Memória do Brain` retornado por `brainRetrieveFn` quando habilitado
- Toggle na `AgentDrawer` (playground/config)

## 4. Realtime

- Habilitar `supabase_realtime` em `brain_events` e `brain_insights`
- Hook `useBrainStream(brandId?)` que subscreve `postgres_changes` filtrado por brand (ou todos, para agência) e emite eventos para o canvas

## 5. Visualização — Rede Neural Viva

**Arquivo**: `src/components/brain/neural-network-canvas.tsx`
- Canvas 2D nativo, 480px, fundo `#080808`, sem Three.js
- 40-80 nós organizados por **simulação de forças leve** (repulsão + atração ao centro, escrita à mão em ~120 linhas — evita adicionar d3-force)
- Categorias mapeadas por cor:
  - Lime `#C8FF00` = conteúdo (editorial/briefing)
  - Azul = mídia paga
  - Branco/cinza = mensageria
  - Roxo = insights consolidados
- Tamanho do nó ∝ eventos nas últimas 24h (query inicial + incremento realtime)
- Loop `requestAnimationFrame`; ocioso = pulsação ambiente
- Partículas: novo evento gera bezier da borda até o nó da categoria (~800ms, glow), nó pulsa 600ms
- Insight novo → linha roxa entre nó fonte e nó "Brain" central
- **Debounce**: rajadas de eventos agrupadas (max 30 partículas simultâneas)

**Interações**:
- Hover: tooltip (categoria, contagem 24h, marca top)
- Click: `Sheet` lateral com últimos 20 eventos daquela categoria
- Filtro por marca no topo → transição animada (fade nós fora do escopo)

## 6. Rotas / Dashboards

- **`/brain`** (agência): rede neural completa + insights agregados + benchmarks por canal + ranking de marcas por volume. Super admin e owners.
- **`/customers/$customerId/brain`**: rede filtrada + feed de insights em linguagem natural + timeline de eventos + tendência de KPIs (Recharts) + contador "X eventos alimentando a IA".
- Item no sidebar "Brain" com ícone `Brain` (lucide), abaixo de "Mídia paga".

## 7. Cron

`pg_cron` diário 03:00 UTC chamando `/api/public/hooks/brain-consolidate` para rodar `brainConsolidateFn` em todas as brands ativas.

---

### Detalhes técnicos

- **Embeddings**: `openai/text-embedding-3-small` (1536 dims) via `LOVABLE_API_KEY` — cabe em índice HNSW direto, sem cast halfvec.
- **Índice**: `create index on brain_embeddings using hnsw (embedding vector_cosine_ops)`.
- **Isolamento**: toda função de retrieve valida `brandId` do contexto autenticado antes de query; consolidação agência-wide não expõe payloads brutos entre brands (só agrega métricas).
- **Sem novas deps pesadas**: reutiliza `ai`/`@ai-sdk` já instalados; canvas puro.
- **Performance**: partículas usam pool reutilizável, nós num único `requestAnimationFrame`, pausado quando aba fora de foco.

### Fora de escopo desta iteração

- Retreinamento supervisionado de outcome_score (será alimentado por engagement futuro dos canais)
- Comparação cruzada entre agências
