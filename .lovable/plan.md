## Objetivo
Otimizar o drawer de conteúdo (`src/components/content/task-dialog.tsx`) reduzindo altura vertical ao agrupar campos correlatos em linhas duplas.

## Mudanças

### 1. Prioridade + Tags na mesma linha (grid 2 colunas)
Hoje: "Prioridade" ocupa 1 coluna e "Tags" ocupa `col-span-2` (linha inteira, empurrando tudo pra baixo).
Alterar `Tags` para ocupar apenas 1 coluna (remover `col-span-2`), ficando lado a lado com Prioridade.
- Manter input de adicionar tag + botão `+` compactos.
- Chips das tags fluem abaixo do input dentro da mesma célula.

### 2. Visível no portal + Aprovação externa na mesma linha
Hoje: bloco "Visível no portal" (`col-span-2`, dentro do grid superior) e `ApprovalLinkSection` (renderizado separadamente em outro painel, linha 847) estão em linhas distintas.
Alterar:
- Remover `ApprovalLinkSection` do local atual (linha 847).
- Substituir o bloco "Visível no portal" por um container `grid grid-cols-2 gap-3` contendo:
  - **Esquerda**: toggle "Visível no portal" (mantém estilo atual — card com border/switch).
  - **Direita**: `ApprovalLinkSection` compactado (mesma altura do card do switch — header com label + botão "Gerar link"; lista de tokens ativos abaixo permanece igual).
- Ajustar `ApprovalLinkSection` para não usar `DashboardPanelSurface` pesado; usar `rounded-md border border-border/60 bg-background/60 px-3 py-2` para casar visualmente com o card do switch ao lado.

### 3. Sem alterações de negócio
- Zero mudança em mutations, schemas, persistência ou permissões.
- Apenas layout/JSX no `task-dialog.tsx`.

## Arquivo afetado
- `src/components/content/task-dialog.tsx` (único)

## Verificação
- Abrir drawer em `/content` → confirmar Prioridade e Tags lado a lado.
- Confirmar toggle "Visível no portal" e card "Aprovação externa" na mesma linha, com botão "Gerar link" funcional.
- Rodar typecheck.
