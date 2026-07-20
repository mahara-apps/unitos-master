## Objetivo
Quando um cliente estiver selecionado no switcher do sidebar, exibir automaticamente um link direto para a página desse cliente dentro do grupo "Visão Geral", eliminando o passo de voltar até `/customers` e escolher novamente.

## Comportamento
- Sem cliente selecionado → sidebar continua como está hoje.
- Com `clientId` ativo → aparece um novo item no topo do grupo **Visão Geral**:
  - Ícone: avatar do cliente (`CustomerAvatar`, mesmo componente do switcher) para reforçar identidade visual.
  - Label: nome do cliente (truncado).
  - Sublabel/tooltip: "Abrir painel do cliente".
  - Rota: `/customers/$customerId` com `params={{ customerId: clientId }}`.
  - Estado ativo destacado quando a rota atual já for a do cliente.
- Item some ao trocar para "Todos os clientes" ou trocar de workspace (o switcher já limpa `clientId` nesses casos).

## Onde mexer
- `src/components/app-sidebar.tsx` — único arquivo alterado. Ler `useActiveContext()` para pegar `clientId`, buscar o nome/logo a partir do cache de `["clients", brandId]` (já populado pelo `ContextSwitcher`, sem nova request), e renderizar condicionalmente um `SidebarMenuItem` no topo do grupo "Visão Geral" usando `<Link to="/customers/$customerId" params={{ customerId: clientId }}>`.

## Fora do escopo
- Nenhuma mudança em rotas, permissões, dados ou no `ContextSwitcher`.
- Nenhum ajuste em outros grupos do sidebar (Operação, Inteligência, Gestão).
