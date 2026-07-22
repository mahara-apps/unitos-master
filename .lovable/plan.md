## Objetivo

Hoje o painel lateral do `/calendar` só permite excluir itens na aba **Rascunhos**. Na aba **Aguardando agendamento** (posts aprovados sem data) não há caminho para remover um post enviado indevidamente. Vamos habilitar a exclusão também nesse modo, mantendo a mesma UX (ícone lixeira no hover + `AlertDialog` de confirmação).

## Escopo

- Painel `PendingSchedulePanel` (`src/components/calendar/pending-schedule-panel.tsx`)
- Server function em `src/lib/scheduling-wizard.functions.ts`

## Mudanças

1. **Server function `deleteApprovedPostFn`** (novo) em `scheduling-wizard.functions.ts`
   - Middleware: `requireSupabaseAuth`
   - Input: `{ postId: uuid, brandId: uuid }`
   - Regras:
     - Carrega o post por `id + brand_id` (defesa em profundidade além do RLS).
     - Bloqueia exclusão se já existir registro em `social_posts` com `status` diferente de `scheduled` (ex.: `publishing`, `published`, `failed`) — para não apagar posts que já foram/estão sendo publicados. Se houver apenas linhas `scheduled`, elas são removidas em cascata junto com o post.
     - Apaga `post_placements` e `social_posts` vinculados e depois o `posts` (na mesma ordem já usada por `deleteDraftPostFn`, para respeitar FKs).
   - Retorna `{ ok: true }`.

2. **UI — `PendingSchedulePanel`**
   - Remover o `isDrafts ? … : null` que hoje esconde o botão excluir; exibir o ícone lixeira **em ambos os modos**.
   - Reaproveitar o `AlertDialog` já existente. Ajustar título/descrição conforme o modo:
     - Drafts: “Excluir rascunho?” (texto atual).
     - Pending: “Excluir post aprovado?” + descrição avisando que o post será removido permanentemente e que não poderá mais ser agendado.
   - Selecionar dinamicamente a mutation:
     - `mode="drafts"` → `deleteDraftPostFn` (comportamento atual).
     - `mode="pending"` → `deleteApprovedPostFn`.
   - Após sucesso: `toast.success` correspondente + `invalidateQueries` da chave do modo atual (`wizard-drafts` ou `pending-schedule`) e também `calendar` para refletir remoção imediata.
   - Manter `describeError` no `onError` (já adotado no módulo).

3. **Sem novas funcionalidades além da exclusão** — nada de bulk delete, undo ou lixeira; escopo mínimo do pedido.

## Fora de escopo

- Excluir posts já publicados (bloqueado por segurança).
- Alterar Kanban / TaskDialog.
- Alterar contagem/KPIs do calendário (invalidations garantem refresh).

## Detalhes técnicos

- FKs: `social_posts.post_id` e `post_placements.post_id` referenciam `posts.id`. A ordem de delete replica `deleteDraftPostFn` (placements → social_posts scheduled → posts).
- RLS: consulta preliminar `select id, brand_id from posts where id = :id and brand_id = :brandId` para retornar erro amigável (“Post não encontrado ou sem permissão.”) antes de tentar deletar.
- Verificação de status já publicado é feita via `select status from social_posts where post_id = :id` — se qualquer linha tiver `status not in ('scheduled')`, lança erro pt-BR: “Não é possível excluir: já existem publicações em andamento ou publicadas.”
