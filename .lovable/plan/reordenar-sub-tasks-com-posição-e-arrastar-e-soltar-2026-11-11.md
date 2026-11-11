# Reordenar sub-tasks com #posição e arrastar-e-soltar

## O que muda para o usuário
- Na lista de Sub-tasks de cada Task, cada linha mostra um número de posição (#1, #2, #3...) e uma alça de arrastar à esquerda.
- Arrastar a linha para cima/baixo e soltar: a posição é salva na hora e os números se renumeram.
- Clicar no número (#3) permite digitar uma nova posição (ex.: 1) — a sub-task vai para lá e as demais deslocam.
- Atalho no menu "..." da linha: "Mover para o topo" / "Mover para o final".
- Arrastar só funciona com a ordenação "Ordem" ativa e sem busca/filtro (em Prazo/Nome, a alça fica desabilitada com dica "Mude para Ordem para reorganizar").
- Quem não pode editar a task vê o número, mas não a alça.

## Detalhes técnicos
- Reaproveita a coluna `tasks.position` (já usada pela ordenação "Ordem") — sem nova tabela.
- Nova RPC transacional `reorder_job_tasks(job_id, ordered_ids[])`: valida acesso via `can_access_task`/RLS, exige que os IDs sejam exatamente as sub-tasks do job, regrava `position` 1..N. Chamada via `callRpc`.
- UI em `src/components/projects/jobs-panel.tsx`: `SortableContext` do `@dnd-kit/sortable` (já instalado) na lista; atualização otimista com rollback se falhar.
- Função pura `moveToPosition(ids, id, target)` com testes unitários (arrastar, digitar posição, limites 1/N).
- MASTER-first: migration → build_delta → delta_version/MASTER_RELEASE_VERSION → verify-installation cobre a RPC → `bun run master:check`. Publicação só com sua autorização.
