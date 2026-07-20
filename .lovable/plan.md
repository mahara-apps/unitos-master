## Objetivo
Reduzir o ruído visual no header de cada coluna do Kanban (`/content`), mantendo apenas os elementos essenciais.

## Escopo — `src/components/content/content-board.tsx` (componente `Column`)

**Manter no header:**
1. Dot de cor + nome da etiqueta (com edição inline no clique)
2. Badge de contagem de posts (`{posts.length}`)
3. Badge vermelho de "atrasados" (quando `overdueCount > 0`)
4. Chip único de ordenação por **Data de criação** (asc/desc)
5. Menu `...` (renomear / novo post / excluir)

**Remover:**
- Pill de SLA (`{stage.sla_days}d` com ícone Clock) — linhas 422–433
- Chip de ordenação "Postagem" (`scheduled`) — linhas 459–465

## Detalhes técnicos
- Manter `SortBy` type intacto em `content.functions` (usado em outros pontos), apenas parar de renderizar o chip `scheduled` no header.
- Remover imports não utilizados após a limpeza: `Clock`, `CalendarClock` (verificar se ainda são usados no arquivo antes de remover).
- Manter tooltip e comportamento de ciclagem asc → desc no chip de Criação.
- Sem alterações em backend, tipos de banco ou lógica de SLA (as notificações de atraso continuam funcionando; só o pill visual sai do header).