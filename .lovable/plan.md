# Remover Multi-publicação do drawer de tarefa

Remover a seção "MULTI-PUBLICAÇÃO" (`PlacementsPanel`) do drawer de criar/editar em `src/components/content/task-dialog.tsx` e a lógica de placements extras que só ele consumia.

## Mudanças em `src/components/content/task-dialog.tsx`

- Remover render do `<PlacementsPanel>` + `<Separator>` adjacente (linhas ~866-873).
- Remover a função `PlacementsPanel` (linhas ~2024-fim).
- Em `EditBody`:
  - Remover `extras`/`setExtras`, o tipo `ExtraPlacement`, o `useQuery` `placementsQ` e o `useEffect` de seed.
  - Simplificar a mutation `save`: remover validação de conjunto de placements e a chamada `savePlacements`. Manter apenas o `updatePost`.
- Remover imports que ficam sem uso: `listPlacements`, `savePlacements`, `validatePlacementSet`, `PlacementFormat` (se não usado em outro lugar do arquivo), e componentes UI usados só pelo painel.

## Checagens

- Confirmar que `listPlacements`/`savePlacements` não são usados em outros arquivos antes de remover imports.
- Não alterar as tabelas `post_placements` nem o `scheduling-wizard` (`/calendar` continua criando placements normalmente).
- Formato primário do card segue via `state.format` + `state.scheduledAt`.
