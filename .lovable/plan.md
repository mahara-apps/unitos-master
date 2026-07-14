## Objetivo
Unificar todos os `Tabs` e `Cards` do sistema no mesmo padrão visual da tela "Cérebro de Agentes" (`/agents`), incluindo bordas, cores, badges, ícones e tipografia. Hoje existem **3 variantes de `TabsList`** e **3 variantes de `Card`** convivendo no app — vamos consolidar em **1 padrão canônico** com variantes nomeadas nos primitives.

## Padrão canônico (extraído de `agents.tsx` + `agent-card.tsx`)

**Tabs (pill/muted)**
- `TabsList`: `h-9 bg-muted/50 p-1` (sem borda, sem `bg-card`)
- `TabsTrigger`: `h-7 gap-1.5 px-3 text-xs data-[state=active]:bg-background`
- Ícone dentro do trigger: `h-3.5 w-3.5`
- Contador ao lado: `<span className="ml-1.5 text-[10px] text-muted-foreground">`

**Card (flat + hover-lift)**
- Base: `rounded-xl border bg-card p-5 transition-all`
- Hover interativo: `hover:border-foreground/20 hover:shadow-sm`
- Divisor interno: `border-t border-border/60 pt-3`
- Sem `CardHeader/CardContent` subcomponents — layout direto

**Badges**
- Categoria/status: `variant="outline"` + `h-5 rounded-full px-2 text-[10px] font-medium` + tokens `border-{c}-500/20 bg-{c}-500/10 text-{c}-600 dark:text-{c}-300`
- Técnico/model: `variant="secondary"` + `h-5 rounded-md px-1.5 font-mono text-[10px]`
- Ícone dentro: `h-3 w-3`

**Ícones (escala)**
- Chip destaque (40px): `h-5 w-5`
- Header de seção: `h-4 w-4`
- Botão/tab: `h-3.5 w-3.5`
- Badge inline: `h-3 w-3`

**Tipografia**
- Título card: `text-sm font-semibold leading-tight tracking-tight`
- Corpo/subtitle: `text-sm text-muted-foreground`
- Header de seção: `text-sm font-medium` + ícone `h-4 w-4`
- Metadata/contador: `text-[10px]` ou `text-xs text-muted-foreground`
- Header de tabela: `text-[11px] font-medium uppercase tracking-wide text-muted-foreground`

## Trabalho

### 1. Introduzir variantes nos primitives
- **`src/components/ui/tabs.tsx`** — adicionar `variant="pill" | "bordered"` no `TabsList` via `cva`. `pill` = padrão dos agentes (default novo); `bordered` = versão antiga com `border border-border bg-card` (mantida como legacy para não quebrar o header do briefing quando precisar de destaque).
- **`src/components/ui/card.tsx`** — adicionar prop `interactive?: boolean` que aplica `transition-all hover:border-foreground/20 hover:shadow-sm` e remove o `shadow` default (flatten). Substitui os `shadow-none` avulsos espalhados pelo strategy-panel.

### 2. Migrar telas com Tabs para o padrão pill
- `src/routes/_authenticated/customers.$customerId.tsx` (abas Visão geral / Cérebro / Produção)
- `src/components/brand-hub/brand-hub.tsx`
- `src/components/brand-hub/briefing-workspace.tsx` (abas do briefing)
- `src/components/agents/agent-drawer.tsx` (Playground / Variables / Prompt — hoje é a variante default crua)
- `src/components/content/task-dialog.tsx` (grid 4-col)
- `src/components/login-form.tsx` (login/signup)

Cada migração: remover className custom conflitante do `TabsList`, aplicar `text-xs` + `h-7` + `gap-1.5` nos triggers, alinhar ícones em `h-3.5 w-3.5`.

### 3. Migrar Cards
- **`src/components/ai-agents/strategy-panel.tsx`** — trocar os múltiplos `bg-slate-50 dark:bg-muted/30 shadow-none` e `shadow-none` avulsos pela nova prop `interactive={false}` (ou simplesmente remover o shadow default via variant). Manter `CardHeader/CardContent` só onde há semântica de header claro; nos cards de listagem, adotar o layout flat direto como o `agent-card`.
- **`src/routes/_authenticated/calendar.tsx`** — só ajustar o `Card` container para não usar shadow default (`interactive={false}`), mantendo `p-0` para o calendário render.
- **`src/routes/_authenticated/customers.index.tsx`** — avaliar se as linhas de cliente devem virar `Card interactive` reais (hoje é markup custom). **Fora de escopo desta rodada** salvo confirmação — flagged.

### 4. Unificar Badges
Criar helper em `src/components/ui/badge.tsx` ou `src/lib/badge-tokens.ts` com tokens semânticos:
- `badgeTone("emerald" | "amber" | "red" | "blue" | "violet" | "slate")` → retorna string com `border-{c}-500/20 bg-{c}-500/10 text-{c}-600 dark:text-{c}-300`.
- Substituir hand-rolled classes em `src/components/agents/jobs-table.tsx` (status), `src/components/customer/basic-info-tab.tsx` (Edição liberada / Somente leitura), e onde houver badges de status espalhados.
- Corrigir a inconsistência amber `border-amber-500/30` → `/20` no jobs-table.

### 5. Padrão de seção
Introduzir componente leve `SectionHeader` (opcional) ou apenas documentar no CSS: `<h2 className="mb-3 flex items-center gap-2 text-sm font-medium"><Icon className="h-4 w-4" /> …</h2>`. Aplicar em headers ad-hoc que hoje usam `text-lg font-semibold` avulsos dentro das mesmas telas migradas — respeitando o design original de tela quando o header é intencionalmente maior (ex.: `PageHeaderProvider`).

## Detalhes técnicos

**Variantes com cva no TabsList** (padrão que já usamos em outros primitives shadcn):

```ts
const tabsListVariants = cva(
  "inline-flex items-center justify-center rounded-lg text-muted-foreground",
  {
    variants: {
      variant: {
        pill: "h-9 bg-muted/50 p-1",
        bordered: "h-9 w-full justify-start border border-border bg-card p-1",
        default: "h-9 bg-muted p-1", // legacy shadcn
      },
    },
    defaultVariants: { variant: "pill" },
  },
);
```

**Ordem de execução:** (1) primitives → (2) badges/tokens → (3) migração tela a tela → (4) sweep visual em `/agents`, `/customers/:id`, `/content`, login, briefing, drawer para regressão visual.

## Fora de escopo
- Redesign do `PageHeaderProvider` / header global.
- Refatoração do `customers.index.tsx` para virar grid de cards (flagged, precisa confirmação separada).
- Alterações de tokens em `src/styles.css` — o padrão OKLCH atual atende.
