## Refatoração do topo da Sidebar

Reorganizar o `SidebarHeader` em `src/components/app-sidebar.tsx` para ter duas linhas fixas no topo, seguindo padrão SaaS premium (Linear/Vercel).

### Nova estrutura visual

```text
┌─────────────────────────────┐
│ [◆] NexusFlow        [⇤]   │  ← Brand row (logo + nome + toggle)
├─────────────────────────────┤
│ [Workspace / Cliente ▾]     │  ← ContextSwitcher (movido pra baixo)
├─────────────────────────────┤
│ Operação                    │
│   Dashboard                 │
│   ...                       │
└─────────────────────────────┘
```

### Mudanças

1. **`src/components/app-sidebar.tsx` — `SidebarHeader`**
   - Adicionar uma **brand row** acima do `ContextSwitcher`:
     - Ícone/logo (usar `Sparkles` do lucide como placeholder, alinhado ao roxo indigo já usado no avatar do usuário).
     - Wordmark "NexusFlow" com tipografia bold, tamanho `text-sm`.
     - `SidebarTrigger` alinhado à direita (colapsar/expandir).
   - Quando a sidebar estiver `collapsed` (state `icon`):
     - Ocultar o wordmark; manter apenas o ícone centralizado.
     - Ocultar o `ContextSwitcher` (já é um botão largo — não faz sentido em modo ícone) OU renderizar uma versão compacta com só a inicial. Vou usar `group-data-[collapsible=icon]:hidden` no switcher pra simplicidade e consistência com Linear.
   - Manter o `ContextSwitcher` logo abaixo da brand row, sem alterações no componente em si.

2. **`src/routes/_authenticated/route.tsx` — `ShellHeader`**
   - Remover o `<SidebarTrigger />` do header do app (agora vive dentro da sidebar).
   - Deixar o header começar direto com título/subtítulo da página.

### Detalhes técnicos

- Usar `useSidebar()` pra detectar `state === "collapsed"` e condicionalmente esconder o wordmark, ou usar seletores CSS `group-data-[state=collapsed]:hidden` já suportados pelos primitivos shadcn/sidebar.
- Sem mudanças de dados, roteamento ou lógica de permissões — puramente presentational.
- Sem mudanças no `ContextSwitcher` — apenas repositionado.
