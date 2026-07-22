## Objetivo
Ocultar completamente o módulo Brain em toda a UI quando a feature `brain` estiver desativada para o workspace ativo. Hoje só o item de sidebar respeita a flag — o resto continua aparecendo.

## Onde o Brain aparece hoje (auditoria)
- **Sidebar** (`src/components/app-sidebar.tsx`) — itens "Brain" e "Brain Diagnostics" já têm `featureKey: "brain"` (OK).
- **Perfil do cliente** (`src/routes/_authenticated/customers.$customerId.tsx`):
  - Aba **"Cérebro da Marca"** no `TabsList`.
  - `<BrainWidget preset="customers" />` no topo do overview.
  - Botão/estado "Completar onboarding" que abre a aba `brain`.
- **Projetos** (`src/routes/_authenticated/projects.index.tsx`) — `<BrainWidget preset="projects" />`.
- **Analytics** (`src/routes/_authenticated/analytics.tsx`) — `<BrainWidget preset="analytics" />`.
- **Cérebro da Marca embutido** — `BriefingWorkspace` + seções extras (Estratégia/Personas/Mercado) renderizadas dentro da aba `brain` do perfil.
- Rotas `/_authenticated/brain.*` e `/_authenticated/customers/$customerId/brain` — já devem ser bloqueadas pelo `beforeLoad`/gate; validar.

## O que muda
1. Ler `useFeatureAccess("brain")` na página do cliente, em Projetos e em Analytics; enquanto `loading`, manter comportamento atual (sem flicker); quando `enabled === false`:
   - **Customers detail**: remover a aba "Cérebro da Marca" do array `TABS`, remover `<BrainWidget />` do overview, esconder o botão "Completar onboarding" e forçar `activeTab` para `overview` caso caia em `brain`. Manter Estratégia/Personas/Mercado só se ainda quisermos — decisão: também ocultar, já que estão embutidos no bloco Brain.
   - **Projects**: não renderizar `<BrainWidget preset="projects" />`.
   - **Analytics**: não renderizar `<BrainWidget preset="analytics" />`.
2. Sidebar já OK — apenas confirmar que "Brain" e "Brain Diagnostics" continuam ocultos quando desativado (nenhuma mudança).
3. Não mexer em rotas/servidor/DB — a flag e o gate de rota já existem (`feature-flags.gate.ts`).

## Fora de escopo
- Alterar defaults da feature `brain` no catálogo (permanece controlada pelo Super Admin).
- Remover código do módulo Brain — só ocultar a UI.
- Referências internas em `chat.stream.ts`, `settings.ai.tsx`, `connections.tsx` (não são superfícies do usuário do módulo Brain).

## Confirmação
Após deploy, com a flag `brain` desativada, o perfil do cliente não mostra a aba/widget, Projetos e Analytics não mostram o widget e a sidebar continua sem os itens Brain.
