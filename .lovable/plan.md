## Problema

No calendário, ao passar o mouse sobre um evento, aparecem **dois tooltips sobrepostos**: o custom (`<TooltipContent>` do shadcn) e o nativo do browser (via atributo `title`).

Causa: em `src/components/calendar/event-chip.tsx` os botões dentro do `<TooltipTrigger>` têm `title={p.title}` (linha 38) e `title={e.title}` (linha 84), enquanto o componente já provê seu próprio Tooltip logo abaixo.

## Correção

- `src/components/calendar/event-chip.tsx`: remover os dois atributos `title=` dos elementos que já estão embrulhados em `<TooltipTrigger>`. O tooltip customizado continua exibindo título, horário e autor — sem duplicação.

Nenhuma outra alteração necessária.