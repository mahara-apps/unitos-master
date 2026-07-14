## Objetivo

Alinhar visualmente o módulo **Produção** (`/content`) à linguagem do Dashboard, sem tocar em regra de negócio, dados, hooks, queries, rotas ou fluxos. Apenas UI/UX.

## Passo 1 — Extrair primitivos do Dashboard (sem alterar o Dashboard)

Hoje o Dashboard define, no próprio arquivo, três primitivos que são a base do design system: `Card` (container branco com header/ícone/ação), `SkeletonList` e `EmptyState`. Movê-los para módulos compartilhados para poder reutilizar em todo o app:

- `src/components/ui/panel-card.tsx` → exporta `PanelCard` (o `Card` do Dashboard).
- `src/components/ui/panel-empty.tsx` → exporta `PanelEmptyState`.
- `src/components/ui/panel-skeleton.tsx` → exporta `PanelSkeletonList`.

Depois, refatorar `src/routes/_authenticated/dashboard.tsx` para importar esses três em vez de manter cópias locais. **Nenhum pixel muda no Dashboard** — é literalmente o mesmo JSX movido de arquivo.

Primitivos já compartilhados que continuam onde estão: `Sparkline`, `HealthBar`, `KpiCard` inline (vamos manter no Dashboard por ora — só o módulo Produção não pede KPI card).

## Passo 2 — Alinhar o módulo Produção ao design system

**`src/routes/_authenticated/content.tsx`**
- Substituir o `EmptyState` local (borda pontilhada, min-h 60vh) pelo padrão do Dashboard: usar `PanelCard` como wrapper e `PanelEmptyState` no corpo, mantendo o mesmo `h-[calc(100vh-3.5rem)]` do shell.
- `BoardSkeleton`: trocar por skeleton no mesmo tom do Dashboard (`bg-muted/40`, `rounded-xl`, `border-border/60`), mantendo o layout horizontal de 6 colunas.
- Diálogos "Novo pipeline" / "Renomear pipeline": nenhuma mudança estrutural (já usam shadcn `Dialog`), só garantir tipografia coerente (`DialogTitle` já usa tokens).

**`src/components/content/content-board.tsx`**
- Colunas: trocar `bg-muted/30` por `bg-card` para bater com os cards do Dashboard; manter `rounded-xl border border-border/60`. A barra de gradiente no topo permanece.
- Header da coluna: padronizar tipografia (`text-sm font-medium tracking-tight`) e badge de contagem (`Badge variant="secondary"` já OK).
- Botão "Adicionar coluna" e "Nova tarefa": manter borda tracejada `border-border/60`, adotar o mesmo `text-xs text-muted-foreground` do Dashboard e altura `h-9` consistente.
- `PostCard`: manter o layout atual (é premium e já bate com o vocabulário do Dashboard: `rounded-xl border border-border/70 bg-card`, badges pill, `text-[11px] text-muted-foreground` no rodapé). Apenas normalizar sombra para `shadow-sm` no hover (padrão do resto do app) em vez de `shadow-md`.

**Toolbar do header da página (via `usePageHeader`)**
- Manter os componentes shadcn atuais (`Select`, `Button`, `DropdownMenu`); só padronizar altura de todos os controles para `h-9` (hoje o `SelectTrigger` já é `h-9`, o `Button size="sm"` vira `h-9` também para bater com o Select).

## Fora de escopo neste passo

- Task drawer (`task-dialog.tsx`), calendar dialog, projects, analytics, settings — só entram nos passos seguintes, um módulo por vez.
- Qualquer mudança em `content.functions.ts`, `stage-colors.ts`, permissions, realtime, D&D.

## Detalhes técnicos

Arquivos criados:
- `src/components/ui/panel-card.tsx`
- `src/components/ui/panel-empty.tsx`
- `src/components/ui/panel-skeleton.tsx`

Arquivos editados (apenas visual):
- `src/routes/_authenticated/dashboard.tsx` — trocar `Card`/`EmptyState`/`SkeletonList` locais por imports dos novos módulos (JSX idêntico).
- `src/routes/_authenticated/content.tsx` — usar `PanelCard`/`PanelEmptyState`, refinar `BoardSkeleton`, padronizar altura da toolbar.
- `src/components/content/content-board.tsx` — coluna com `bg-card`, sombras/altura de botões alinhadas ao DS.

## Entrega

Ao concluir, envio um resumo com prints/diffs e aguardo aprovação antes de seguir para o próximo módulo (sugestão de ordem: Calendário → Clientes/Customers → Projects → Analytics → Tasks → Settings → Connections → Agents/Brand Hub).
