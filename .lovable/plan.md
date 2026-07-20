## Objetivo
Reduzir em ~50% o padding do topo e das laterais da tela `/content` (Kanban), sem afetar as demais páginas.

## Escopo
Arquivo: `src/routes/_authenticated/content.tsx` (linha 262).

O shell hoje aplica `px-4 py-6 sm:px-6 lg:px-8` via `DashboardPageShell`. Vamos sobrescrever apenas na rota de conteúdo, adicionando classes utilitárias que anulam o padding padrão:

```tsx
<DashboardPageShell className="flex h-[calc(100vh-3.5rem)] min-h-0 flex-col space-y-0 !px-2 !py-3 sm:!px-3 lg:!px-4">
```

Resultado:
- Topo/inferior: `py-6` (24px) → `py-3` (12px)
- Laterais: `px-4/6/8` → `px-2/3/4` (metade em cada breakpoint)

## Não fazer
- Não alterar `DashboardPageShell` (impactaria outras páginas)
- Não mexer no `p-4` interno do board (spacing entre colunas/cards)
- Não mudar altura ni sticky do header do app