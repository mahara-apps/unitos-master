# Gestão de Jobs e Tarefas dentro do projeto

## Objetivo

Reorganizar somente a aba **Jobs & Pautas** e o job aberto para separar claramente as duas áreas e tornar a gestão diária mais visual, sem retirar ações, dados, filtros, comentários, links, timer, arquivamento ou exclusão já existentes.

## Estado atual confirmado

- Jobs e Pautas hoje aparecem juntos dentro do mesmo painel; a tela do projeto ainda mantém um painel lateral de matriz/prazos ao lado dessa área.
- Cada job já possui responsável único, início, entrega, status personalizado, conclusão, arquivamento, exclusão, tarefas, comentários e links.
- As tarefas já possuem responsável, prazo, timer, prioridade, conclusão, arquivamento e exclusão; os status atuais são A fazer, Em andamento, Revisão e Concluída.
- O tempo do job já pode ser calculado pela soma do tempo registrado nas tarefas.
- O projeto já usa status cadastráveis por workspace para jobs e tarefas. Eles serão preservados.

## 1. Separar Jobs de Pautas

- No topo da aba, criar dois acessos independentes:
  - **Jobs**: quantidade de frentes e total de tarefas;
  - **Pautas**: quantidade real de peças de conteúdo.
- **Jobs** abre o quadro de trabalho; **Pautas** abre o board de pauta já existente.
- Remover dessa aba o painel lateral vazio e qualquer cabeçalho que trate “Pauta de conteúdo” como se fosse um job.
- Manter acesso a matriz, prazos, horas e envolvidos em posições coerentes na visão do projeto, sem apagar seus componentes ou dados.

## 2. Quadro de Jobs

- Substituir a lista atual por um quadro com três grupos visuais:
  - **A fazer** — `#64748b`;
  - **Em andamento** — `#0ea5e9`;
  - **Concluído** — `#16a34a`.
- Preservar os status personalizados: status concluidores entram em **Concluído**; status iniciais/padrão entram em **A fazer**; os demais entram em **Em andamento**. O seletor continua mostrando e gravando o status real do workspace.
- Cada card mostrará título, progresso e percentual das tarefas, avatares do responsável do job e responsáveis das tarefas, período início–entrega, tempo total registrado e prazo.
- Preservar busca, **Novo job**, abrir, renomear, concluir/reabrir, arquivar/restaurar, excluir e visualização de arquivados/concluídos.
- A busca continuará filtrando os jobs sem alterar dados ou status.

## 3. Job em painel lateral

- Trocar o modal central por um drawer à direita, mantendo o projeto visível ao fundo.
- Cabeçalho com **Concluir/Reabrir**, responsável, status personalizado em pill, menu de ações e fechar.
- Exibir título, caminho cliente › projeto e linha do tempo início → entrega, com marcador de hoje, progresso temporal e dias restantes/atrasados.
- Manter edição das datas, renomear, arquivar/restaurar, excluir e filtros de tarefas.
- Exibir o total de tempo do job como soma dos apontamentos de suas tarefas.

## 4. Estado e prioridade das tarefas

- Adicionar o estado persistido **Bloqueada**, sem remover **Revisão**. O fluxo ficará: **A fazer, Fazendo, Revisão, Bloqueada e Concluída**.
- Preservar dados existentes e a prioridade **Urgente**; apresentar também **Alta, Média e Baixa**, com rótulos em português.
- Permitir alterar status e prioridade diretamente na tarefa, mantendo responsável, prazo, conclusão/reabertura, timer play/stop com tempo acumulado e menu Arquivar/Restaurar/Excluir.
- Manter o detalhe completo da tarefa, incluindo comentários, timesheet, histórico, anexos e links.

## 5. Lista e Quadro dentro do job

- Adicionar alternador **Lista | Quadro** no drawer.
- **Lista**: checklist compacto com status, prioridade, título, responsável, prazo, timer e menu.
- **Quadro**: kanban por status da tarefa, reutilizando o padrão de arrastar já usado na área Tarefas.
- Ao arrastar entre colunas, atualizar o status no servidor; mover para **Concluída** aplica a regra atual de conclusão/arquivamento e retirar de **Concluída** reabre a tarefa.
- Preservar os filtros de tarefas ativas, concluídas, arquivadas e por prazo.
- Manter **Adicionar uma tarefa** com prazo opcional nas duas visualizações.

## 6. Comentários, anexos e links

- Manter no job as abas **Comentários** e **Anexos e links**.
- Não alterar as regras atuais de autoria, exclusão, menções, acesso ou escopo.
- Preservar os comentários, apontamentos e referências existentes nas tarefas.

## Detalhes técnicos

- Reorganizar `projects.$projectId.tsx`, `jobs-panel.tsx` e `job-detail-modal.tsx`, extraindo componentes pequenos para quadro/card de job e lista/kanban de tarefas.
- Reutilizar `Sheet`, componentes de botão/menu/seletor existentes, `AssigneePicker`, `StatusPicker`, `TaskTimerWidget`, `ContextTabs`, `CommentThread`, `WorkLinks` e o padrão DnD de `task-kanban.tsx`.
- Usar tokens semânticos globais para as cores solicitadas; não criar KPI local.
- Acrescentar `blocked` ao enum de status da tarefa no banco e aos validadores/tipos compartilhados. A migration será aditiva, com compatibilidade para os registros atuais e sem mudar RBAC/RLS.
- Endurecer a validação de `updateJobTaskFn`: status e prioridade usarão enums Zod compartilhados, em vez de strings livres.
- Consumir o parâmetro `?job=<id>` já emitido por menções para abrir diretamente o drawer correto.
- Não criar múltiplos responsáveis no modelo: o job continua com um responsável oficial; os demais avatares do card representam responsáveis das tarefas daquele job.

## Validação e MASTER-first

- Cobrir agrupamento de status personalizados dos jobs, novo status Bloqueada, traduções de prioridade, soma de tempo, alternância Lista/Quadro, drag-and-drop, conclusão/reabertura e abertura por link direto.
- Validar que criar, buscar, renomear, concluir, reabrir, arquivar, restaurar e excluir continuam funcionando para jobs e tarefas.
- Conferir desktop e celular, garantindo que o drawer não substitua nem oculte incoerentemente o contexto do projeto.
- Executar checagem de tipos, testes direcionados, build e verificação visual possível.
- Aplicar a migration no MASTER, regenerar o delta, sincronizar `delta_version.txt` e `MASTER_RELEASE_VERSION`, incluir a presença de `blocked` na verificação da instalação e executar `bun run master:check` e os guardiões.
- Não publicar o MASTER nem atualizar instalações sem autorização explícita.

## Fora de escopo

- Alterar a página geral `/tasks`, o modelo de Pautas, permissões, papéis ou regras de acesso.
- Remover o status Revisão, a prioridade Urgente ou qualquer função já disponível.
- Criar múltiplos responsáveis oficiais para um job.
