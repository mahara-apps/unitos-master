# Lista de Jobs fiel à referência Operand

## Objetivo

Ajustar somente a lista de Jobs em **Projeto › Jobs & Pautas** para reproduzir com mais fidelidade a referência enviada, reutilizando os tokens e controles do Unitos. O drawer do job, Pautas, Visão geral, Comentários, Anexos e demais telas permanecem intactos.

## Rotas preservadas

Nenhuma rota será criada, removida, renomeada ou redirecionada.

- Manter `/projects/$projectId?tab=jobs`.
- Manter os parâmetros `job`, `pauta`, `board` e `estagio` e seus links diretos.
- Lista/Quadro e agrupamento continuarão como estado local da aba.
- A abertura do drawer continuará usando `job=<uuid>`.
- O acesso a Pautas continuará usando o fluxo atual de `board`.

Não há necessidade de rota alternativa porque o redesenho será interno à tela existente.

## Implementação visual e funcional

### 1. Acessos Jobs e Pautas

- Substituir a barra compacta atual por dois acessos separados e destacados, no padrão do HTML: ícone, título, resumo e estado ativo.
- Jobs exibirá quantidade de frentes e tarefas; Pautas exibirá quantidade de peças.
- Manter os mesmos cliques e destinos já existentes, sem duplicar navegação.

### 2. Toolbar da lista

- Reorganizar em uma única faixa: **Jobs**, `jobs concluídos/total · tarefas concluídas/total`, busca, **Agrupar por**, filtro de visibilidade, controle segmentado **Lista / Quadro** e **Novo job**.
- Manter agrupamento por Status, Responsável e Prazo, busca por nome/número e filtros Ativos/Concluídos/Arquivados/Todos.
- Aplicar a densidade, hierarquia e alinhamento da referência com componentes do design system.

### 3. Linha do job no padrão da linha de tarefa

Cada linha terá colunas estáveis e responsivas:

- badge azul suave com número `#projeto.job` já existente;
- nome em negrito e abertura do drawer ao clicar;
- checklist com **feitas/total**, feitas em verde e mini-barra na cor do status;
- relógio e tempo agregado das tarefas/timer direto, verde quando houver timer ativo;
- avatares empilhados da equipe;
- prazo editável, calendário quando ausente e destaque destrutivo quando atrasado;
- status em pill colorida, pesquisável, com “Buscar status” e “Novo status”;
- menu “…” preservando Abrir, Renomear, Estimativa, Concluir/Reabrir, Duplicar, Arquivar/Restaurar e Excluir;
- linha pontilhada **Adicionar um job** no final.

No mobile, as informações secundárias quebrarão para uma segunda faixa sem perder ações.

### 4. Agrupamentos

- Em **Status**, mostrar cabeçalhos externos/minimalistas com bolinha colorida, nome em caixa alta, contagem e botão `+` contextual.
- Cada grupo terá sua própria superfície de linhas; grupos vazios continuarão visíveis para permitir criação contextual.
- Responsável e Prazo manterão o mesmo modelo visual, sem botão contextual de status.

### 5. Quadro

- Preservar o Kanban por status e o arrastar-e-soltar já existente.
- Reestilizar colunas e cartões para refletirem a mesma linguagem da lista, reaproveitando o card de job atual.
- Manter atualização de status ao soltar, menu do job, progresso, tempo e equipe.

## Migração para os cinco status

O banco atualmente possui dez status de job: os seis operacionais antigos e os cinco solicitados, compartilhando “Concluído”. A migração será idempotente e preservará status personalizados.

Mapeamento dos status legados padrão:

- Rotina → Não iniciado
- Em planejamento/briefing → Em andamento
- Campanha ativa → Em andamento
- Campanha pausada → Bloqueado
- Atendimento → Em andamento
- Concluído → Concluído

A função de status padrão passará a criar somente:

1. Não iniciado `#64748b`
2. Em andamento `#0ea5e9`
3. Em revisão `#e0a011`
4. Bloqueado `#dc2626`
5. Concluído `#16a34a`

Os jobs serão religados aos destinos antes da remoção apenas dos status legados padrão. Status personalizados não serão alterados nem removidos. A atualização do MASTER será transacional, autenticada no uso normal e continuará sob as políticas existentes.

## Arquivos e limites técnicos

- Refinar `JobListView` para linhas, toolbar, agrupamentos e quadro.
- Ajustar somente o cabeçalho interno de `JobsPanel` para os acessos Jobs/Pautas; não tocar no drawer nem nas tarefas.
- Reutilizar `StatusPicker`, `DueDateChip`, `AssigneeAvatar`, menus, rollups e DnD existentes.
- Atualizar a função idempotente de status por migration gerenciada; aplicar a migração dos dados existentes no MASTER e garantir o mesmo comportamento nas instalações atualizadas.
- Estender `verify-installation.sql` para validar exatamente os cinco padrões de job e a ausência dos seis legados padrão.

## Validação

- Testar busca, filtros, três agrupamentos, criação global/contextual, status pesquisável/novo status, responsável, prazo, duplicação, arquivamento/restauração, exclusão e Kanban por arrastar.
- Confirmar visualmente em desktop e mobile contra o HTML enviado.
- Validar que drawer, tarefas, Pautas, Visão geral, Comentários, Anexos e parâmetros de URL continuam funcionando.
- Executar testes focados, typecheck, `git diff --check` e conferir logs de execução.
- Regenerar o delta, elevar a versão em sincronia, atualizar a verificação de instalação e executar `bun run master:check`.
- Não publicar o MASTER nem propagar instalações sem autorização explícita.
