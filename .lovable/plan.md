Enriquecer os cards do painel "Aguardando agendamento" (`src/components/calendar/pending-schedule-panel.tsx`) com preview de imagem maior, badges por rede, formato/posicionamento, data de aprovação e um botão dedicado de edição.

## Escopo

Apenas o painel lateral do calendário (`PendingSchedulePanel`) e o server fn que alimenta a lista (`listApprovedUnscheduledFn` em `src/lib/scheduling-wizard.functions.ts`). Sem mudanças em outras telas, schema ou fluxo de publicação.

## Server function

`listApprovedUnscheduledFn` retorna hoje: `postId, title, copy, coverUrl, channels[], approvedAt`. Vou estendê-la para incluir os placements do post:

- Buscar em `post_placements` (`post_id in (…)`) os campos `channel`, `format` (feed/stories/reels/carrossel).
- Agregar por `postId` em `placements: Array<{ channel; format }>`.
- Manter `channels[]` para compatibilidade.

Novo tipo `PendingSchedulePost` ganha `placements` e mantém os campos atuais.

## UI do card

Cada item passa a mostrar, em layout compacto:

- **Thumb 56×56** (arredondada, `object-cover`) com fallback neutro quando não houver `coverUrl`.
- **Título** em uma linha (truncate) + **preview da copy** (2 linhas, `line-clamp-2`, muted).
- **Linha de metadados** com chips pequenos:
  - Badge por rede com ícone (Instagram, Facebook, LinkedIn, TikTok, etc.) — cores neutras do design system, sem cor hard-coded.
  - Badge de posicionamento por placement (`Feed`, `Stories`, `Reels`, `Carrossel`), agrupado por `channel/format`.
  - Data de aprovação formatada em PT-BR (`"aprovado 12/nov 14:30"` via `date-fns` locale `ptBR`).
- **Botão de editar** (ícone `Pencil`, `variant="ghost" size="icon"`) alinhado à direita, com `aria-label="Editar post"`. O clique chama `onPick(p)` (mesmo callback do card) mas com `stopPropagation` para não conflitar. O corpo do card continua clicável para abrir o wizard.

Estados vazios/carregando permanecem como estão.

## Detalhes técnicos

- Ícones: `Instagram`, `Facebook`, `Linkedin`, `Youtube`, `Music2` (TikTok fallback), `Pencil` do `lucide-react`.
- Formatar data com `formatDistanceToNow` ou `format(date, "d MMM HH:mm", { locale: ptBR })` — reutilizar padrão já usado no projeto.
- Query key do `useQuery` permanece `["pending-schedule", brandId, clientId]`.
- Nenhum novo endpoint; apenas expansão do existente e um `SELECT` adicional em `post_placements` batelado por lista de ids.
- Sem alterações em RLS: `post_placements` já é lido pelo mesmo usuário autenticado via server fn.

## Fora do escopo

- Ação de edição inline (mudar data/rede) — o botão apenas abre o wizard existente.
- Ordenação/filtros novos.
- Mudanças no wizard, calendário ou modelagem.