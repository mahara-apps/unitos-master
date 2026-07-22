## Objetivo
Padronizar a altura dos widgets do dashboard de agência para manter o grid 2-col visualmente equilibrado, com scroll vertical interno quando o conteúdo exceder a altura fixa.

## Mudanças (apenas `src/routes/_authenticated/dashboard.tsx`)

**1. Trocar masonry por grid rígido de 2 colunas**
- Substituir `lg:columns-2` por `grid gap-4 lg:grid-cols-2`.
- Todas as linhas passam a ter altura uniforme (não há mais necessidade de rebalanceamento por CSS columns).

**2. Definir alturas fixas por "tamanho" de widget**
Três tokens de altura reutilizáveis:
- `H_SM = 320px` — widgets compactos (ChannelMixCard, UpcomingCard, TaskDistributionCard).
- `H_MD = 420px` — widgets médios (ApprovalsQueueCard, ApprovalsByClientCard, FunnelCard, PublishTrendCard).
- `H_LG = 520px` — widgets densos (ClientHealthRanking, AiUsageCard).

Aplicar via wrapper `<div className="h-[420px]">…</div>` em cada widget (não altera os componentes internos).

**3. Scroll interno**
Ajustar `PanelCard` (ou envolver o corpo de cada widget) para que o header fique fixo e a área de conteúdo receba `flex-1 overflow-y-auto`. A altura fixa do wrapper garante que o overflow ative scroll quando houver muitos itens (ex.: `ClientHealthRanking` com 8+ clientes, `AiUsageCard` com breakdown por cliente/agente).

**4. Reordenar para pares equilibrados**
Ordem final (linha a linha, esquerda → direita):
```text
Linha 1: ClientHealthRanking (LG)   | AiUsageCard (LG)
Linha 2: FunnelCard (MD)            | ApprovalsQueueCard (MD)
Linha 3: PublishTrendCard (MD)      | ApprovalsByClientCard (MD)
Linha 4: TaskDistributionCard (SM)  | ChannelMixCard (SM)
Linha 5: UpcomingCard (SM)          | (vazio ou mover UpcomingCard p/ SM par)
```
Ajuste: promover `UpcomingCard` para MD e pareá-lo com `TaskDistributionCard` (MD) para eliminar a linha órfã — 4 linhas cheias, 8 widgets 50/50 sem sobras. `ChannelMixCard` sobe para linha 3 substituindo `ApprovalsByClientCard`, que desce; ordem final:

```text
Linha 1: ClientHealthRanking (LG) | AiUsageCard (LG)
Linha 2: FunnelCard (MD)          | ApprovalsQueueCard (MD)
Linha 3: PublishTrendCard (MD)    | UpcomingCard (MD)
Linha 4: TaskDistributionCard (MD)| ApprovalsByClientCard (MD)
```
Move `ChannelMixCard` para dentro do `PublishTrendCard` como legenda inferior, OU mantém como 9º card em linha extra `grid-cols-2` com placeholder — decidir na implementação (preferência: absorver no PublishTrend, já que ambos falam de canais).

## Detalhes técnicos
- Não alterar server functions nem componentes de widget individualmente — apenas o container e, se necessário, o `PanelCard` para suportar `contentClassName="overflow-y-auto"`.
- Manter `KpiCard` grid e `StatusBanner` intocados (ficam acima do grid principal).
- Remover helper `SectionHeader` (não é mais usado).
