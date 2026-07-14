## Problemas

1. **Concorrentes não persistem.** `briefing-workspace.tsx` mostra o campo `competitor_handles` e o soma no cálculo de completude (marca 100% na hora), mas o payload da mutation `save` NÃO inclui `competitors`. Ao recarregar, o hub volta sem os handles e o percentual cai.
2. **Botão "Gerar Plano do Mês" travado.** Hoje `customer-dashboard.tsx` desabilita o botão até 100% e mostra um banner âmbar persistente. O usuário quer poder gerar em qualquer momento.

## Mudanças

### `src/components/brand-hub/briefing-workspace.tsx`
- No `save.mutationFn`, incluir `competitors` no `patch`: mapear `form.competitor_handles` para entradas `{ id, handle, platform: "instagram", added_at }`, preservando `id`/`added_at`/`platform`/`notes` dos concorrentes já existentes em `hubQ.data.brand_hub.competitors` (match por handle normalizado, para não sobrescrever concorrentes cadastrados pela aba "Concorrentes").

### `src/components/customer/customer-dashboard.tsx`
- Remover o bloco do banner âmbar (`{!briefingReady ? … : null}`).
- Remover `disabled={!briefingReady}` e `disabledReason` do `<MonthlyPlanDialog />` — botão sempre habilitado.
- Remover imports e queries que ficarem sem uso (`getBrandHub`, `computeBriefingCompletion`, `Progress`, `hubQ`, `briefingPct`, `briefingReady`, `disabledReason`, `onOpenBriefing` continua útil? — sim, mantido para o header do cliente, então preservar a prop mas parar de usá-la aqui se não for referenciada).

### `src/components/customer/monthly-plan-dialog.tsx`
- Nenhuma mudança de comportamento; props `disabled`/`disabledReason` continuam suportadas para outros usos, apenas não serão mais setadas pelo dashboard.

## Fora de escopo
- Não mexer nas RLS, no cálculo de completude, nem no fluxo de scraping da aba Concorrentes.
