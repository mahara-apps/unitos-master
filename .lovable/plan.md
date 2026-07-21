
## Objetivo

Quando um cliente estiver selecionado no seletor da sidebar, **todos** os módulos das seções **Visão Geral**, **Operação** e **Inteligência** devem exibir apenas dados daquele cliente. Sem cliente ativo (modo agência), continuam mostrando tudo da marca.

## Estado atual (verificado)

Já escopam corretamente por `clientId` ativo: Dashboard, Analytics, Conteúdo, Calendário, Tarefas, Agentes IA.

Ainda **não** escopam:
- **Brain** (`/brain`, `/brain/diagnostics`) — a rota passa `brandId={null}` e não lê o contexto ativo; o filtro de cliente é manual dentro do componente.
- **Chat** (`/chat`) — não recebe brand/client em lugar nenhum; conversas não são vinculadas ao cliente ativo.
- **Mídia paga** (`/media-plans`) — lista todos os planos da marca; ignora `clientId`.
- **Projetos** (`/projects`) — tem filtro interno "clientFilter" que começa em `"all"` independente do cliente ativo.

## Mudanças

### 1. Brain
- Em `src/routes/_authenticated/brain.tsx` e `brain.diagnostics.tsx`: ler `useActiveContext()` e passar `brandId` e `clientId` reais para `<BrainDashboard>`.
- Em `src/components/brain/brain-dashboard.tsx`: inicializar `filters.clientId` a partir do prop e reagir a mudanças; quando `clientId` vier travado do contexto, esconder o seletor de cliente interno (ou deixá-lo em modo "somente leitura" mostrando o cliente ativo).

### 2. Mídia paga
- Em `src/routes/_authenticated/media-plans.tsx`: incluir `clientId` na `queryKey` e no `data` do `listFn`; passar `clientId` para o dialog de criação para pré-selecionar o cliente.
- Confirmar que o server fn `listBrandMediaPlansFn` aceita `clientId` opcional (ajustar validador/handler se necessário).

### 3. Projetos
- Em `src/routes/_authenticated/projects.index.tsx`: quando houver `clientId` ativo, inicializar `clientFilter` com ele, forçar o filtro (desabilitar o `Select`) e mostrar um chip "Filtrado por cliente ativo". Se o usuário limpar o cliente na sidebar, o filtro volta para `all`.

### 4. Chat (Inteligência)
- Em `src/routes/_authenticated/chat.tsx` / `chat.index.tsx` / `chat.$conversationId.tsx`: passar `brandId` e `clientId` do contexto ativo para o `<ChatShell>` e conversas.
- Nova conversa criada com cliente ativo deve nascer vinculada a ele (persistir `client_id` na row de conversa, se a coluna existir; se não, apenas filtrar a listagem por `client_id` quando ativo).
- Este item depende do schema atual da tabela de conversas. Antes de codar, o primeiro passo é ler `src/lib/chat.functions.ts` e o schema para confirmar se `client_id` já existe. Se não existir, adicionar migração pequena `ALTER TABLE ... ADD COLUMN client_id uuid` + índice + RLS, mantendo compatibilidade (nullable).

### 5. Verificações finais
- Rodar Playwright: selecionar um cliente na sidebar, navegar por Dashboard → Analytics → Conteúdo → Calendário → Tarefas → Projetos → Mídia paga → Agentes IA → Brain → Chat, confirmar visualmente que cada tela mostra apenas dados do cliente. Depois limpar o cliente e confirmar que voltam a mostrar tudo da marca.

## Fora de escopo

- Gestão & Configurações (Clientes, Integrações, Notificações, Configurações) permanecem em escopo de marca/workspace — não devem ser filtradas por cliente.
- Rotas `/customers/$customerId/*` já são naturalmente escopadas.
