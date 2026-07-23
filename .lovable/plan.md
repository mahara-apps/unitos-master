## Auditoria: o que a flag `brain` realmente esconde hoje

Fiz um sweep completo por `useFeatureAccess`, `ensureFeatureEnabled`, `brainEnabled` e `featureKey` em todo `src/`. A flag `brain` gata **apenas** superfícies do próprio módulo Brain. Nenhuma funcionalidade "vizinha" ficou escondida junto.

### Superfícies gatadas por `brain` (comportamento correto, mantém)

1. **Sidebar** (`src/components/app-sidebar.tsx:91-92`)
   - Item "Brain" (`/brain`) e "Brain Diagnostics" (`/brain/diagnostics`).
2. **Rotas standalone** (bloqueio via `beforeLoad`)
   - `src/routes/_authenticated/brain.tsx`
   - `src/routes/_authenticated/brain.graph.tsx`
   - `src/routes/_authenticated/brain.diagnostics.tsx`
3. **Widget "BrainWidget" embutido** (visual apenas, não é motor de dados)
   - `analytics.tsx:427` — painel lateral em /analytics.
   - `projects.index.tsx:331` — painel em /projects.
   - `customers.$customerId.tsx:287` — painel na aba Overview do cliente.

Esses são widgets de sugestão semântica, não fontes de verdade de nenhum outro módulo. Ocultá-los não quebra nada.

### O que **NÃO** está gatado por `brain` (segue funcionando normalmente)

Confirmei que estas áreas continuam vivas e independentes, mesmo com Brain desligado:

- **Briefing & Estratégia** no perfil do cliente — restaurado na última mudança (aba `briefing` + link no sidebar).
- **Pipeline de IA** (`ai-agents.functions.ts`): Briefing, Voice, Personas, Cohorts, SWOT, Pautas — sem checagem de flag.
- **Chat** — usa flag própria `chat`, não `brain`.
- **Conteúdo / Content** — usa flag `blog_post`.
- **Mídia paga / Media Plans** — usa flag `midia_paga`.
- **Analytics, Dashboard, Calendar, Projects, Tasks, Connections, Customers** — sem gate de `brain`.
- **Onboarding rápido** — o requisito `brainEnabled` foi removido na última mudança; agora depende só do % de completude.

### Backend do Brain

Ingest quiet, event bus, learning queue, embeddings, memory store etc. continuam **ativos** no banco e nos server functions — apenas as telas de visualização estão escondidas. Isso é intencional: quando a flag for reativada, o histórico já estará populado.

### Conclusão

**Nada foi ocultado por engano.** A remoção do Brain do front atinge exclusivamente as 3 rotas Brain, 2 itens de sidebar e 3 widgets visuais listados acima. Todas as demais funcionalidades — inclusive as que consomem indiretamente artefatos gerados pelos agentes de IA (Briefing, SWOT, Personas, Estratégia, Pautas) — permanecem acessíveis via a aba **"Briefing & Estratégia"** no perfil do cliente e pelo link do sidebar quando um cliente está ativo.

Nenhuma ação de código é necessária. Se preferir, posso ainda:
- (opcional) Remover completamente os itens Brain do sidebar em vez de gatear por flag, deixando o gate só nas rotas — puramente cosmético.
- (opcional) Adicionar um badge "IA" nas seções de Estratégia/SWOT/Personas para deixar claro que essas features seguem ativas sem depender do Brain.

Me avise se quer aplicar alguma dessas duas melhorias opcionais ou se posso encerrar aqui.
