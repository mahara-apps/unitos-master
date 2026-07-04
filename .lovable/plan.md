## Objetivo
Adicionar navegação persistente (shell com sidebar shadcn) que exponha todas as páginas internas do NexusFlow, mantendo rotas públicas (login e portal do cliente) sem o shell.

## Escopo

### 1. Novo layout autenticado
- Criar `src/routes/_app.tsx` (rota pathless de layout) que envolve o conteúdo em `SidebarProvider` + `AppSidebar` + header com `SidebarTrigger` e `ThemeToggle`, renderizando `<Outlet />`.
- Mover as rotas internas para dentro do layout:
  - `src/routes/index.tsx` → `src/routes/_app.index.tsx` (dashboard/home)
  - `src/routes/production.tsx` → `src/routes/_app.production.tsx`
- Ajustar as strings de `createFileRoute` para `/_app/`, `/_app/production`.
- **Não** mover `login.tsx` nem `portal.$token.tsx` — permanecem full-screen sem shell.

### 2. Sidebar (`src/components/app-sidebar.tsx`)
- `Sidebar collapsible="icon"` com marca "NexusFlow" no topo.
- Grupo **Workspace**:
  - Dashboard → `/`
  - Produção (Kanban) → `/production`
- Grupo **Cliente**:
  - Portal (demo) → `/portal/demo`
- Rodapé: link "Sair" → `/login`.
- Item ativo via `useRouterState` + `isActive`.
- Ícones Lucide (LayoutDashboard, KanbanSquare, ExternalLink, LogOut).
- Visual alinhado ao padrão premium já existente (slate/violeta, bordas sutis, dark-mode nativo via tokens).

### 3. Header do shell
- Altura ~56px, borda inferior sutil.
- `SidebarTrigger` à esquerda, breadcrumb simples (nome da página atual) no centro/esquerda, `ThemeToggle` à direita.

### 4. Ajustes complementares
- Remover `ProductionHeader` duplicado se colidir com o novo header (ou mantê-lo como sub-header do módulo — validar após mover).
- Garantir que o `routeTree.gen.ts` seja regenerado automaticamente pelo plugin (não editar manualmente).
- Home (`_app.index.tsx`) recebe cards rápidos linkando para os módulos, para dar um ponto de entrada real.

## Fora do escopo
- Autenticação real / guarda de rota (o layout `_app` é apenas visual por enquanto).
- Redesign das páginas internas.
- Alterações em Login e Portal do Cliente.

## Resultado esperado
Ao abrir `/` ou `/production`, o usuário vê a sidebar com todas as páginas internas e consegue navegar entre elas por clique. `/login` e `/portal/demo` continuam sem shell.