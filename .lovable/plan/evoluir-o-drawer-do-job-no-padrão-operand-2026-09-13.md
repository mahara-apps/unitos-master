# Evoluir o drawer do Job no padrão Operand

## Objetivo

Reorganizar exclusivamente a tela que abre ao clicar em um job dentro de **Projetos › Jobs & Pautas**, usando os componentes e tokens do Unitos, preservando todas as funções atuais e acrescentando os recursos solicitados com persistência real.

## Estado atual confirmado

- O job abre na rota existente `/projects/$projectId?tab=jobs&job=$jobId`; o parâmetro `job` também é usado por links de comentários/notificações.
- O drawer já oferece concluir/reabrir, responsável, status do workspace, datas, Lista/Quadro, drag-and-drop, timer por tarefa, comentários, links, arquivamento e exclusão.
- O banco já possui status cadastráveis por workspace, horas por tarefa, subtarefas e eventos de atividade, mas o drawer ainda não reúne tudo.
- Ainda não existem número humano persistido, estimativa nem apontamentos diretos no job.
- O campo `description` do job existe, porém não está apresentado como briefing rico.
- A workspace desta tela não possui status cadastrados atualmente; os conjuntos solicitados precisam ser criados de forma idempotente.
- O preview compila, mas registrou consultas de status retornando `undefined`; isso será corrigido junto do seletor.

## 1. Rota e compatibilidade

- Manter a mesma rota `/projects/$projectId`, a aba `tab=jobs` e o deep link `?job=<uuid>`.
- Não criar, remover, renomear nem redirecionar rotas.
- Manter `/projects`, `/tasks` e `/settings/work-statuses` intactas.
- O botão compartilhar copiará a URL atual com `tab=jobs&job=<uuid>`, sem criar uma página pública ou alterar permissões.
- Fechar o drawer removerá somente `job`; abrir pauta continuará usando `pauta`, sem colisão entre estados.

**Conclusão sobre rotas:** nenhuma rota deixa de existir. Portanto, não é necessária rota alternativa. A alternativa, caso futuramente se deseje uma página dedicada, seria adicionar `/projects/$projectId/jobs/$jobId` mantendo redirecionamento permanente do deep link atual, mas isso fica fora deste trabalho.

## 2. Estrutura visual do drawer

- Ampliar o drawer à direita, mantendo o projeto visível ao fundo em desktop e uma composição de tela inteira utilizável no celular.
- Barra superior, na ordem funcional:
  - Concluir/Reabrir;
  - responsável com avatar e nome;
  - prazo editável;
  - timer do job com play/pause/stop e `gasto / estimado`;
  - status colorido e pesquisável;
  - avatares dos colaboradores inferidos do responsável do job e dos responsáveis das tarefas, sem alterar o modelo de responsável oficial único;
  - compartilhar, menu de ações existente e fechar.
- Header com código imutável do job, nome editável e breadcrumb `cliente › projeto`.
- Preservar renomear, datas de início/entrega, linha do tempo, concluir/reabrir, arquivar/restaurar e excluir.

## 3. Número automático do job

- Adicionar um código humano persistido e imutável, gerado atomicamente por workspace e nunca reutilizado.
- Exibir no formato `#<número>`; códigos importados poderão conservar sufixos como `.1`, sem recalcular ao reordenar jobs.
- Fazer backfill determinístico dos jobs existentes por workspace, seguindo criação e ID para desempate.
- Impedir alteração do código pelas funções comuns e garantir unicidade por workspace.

## 4. Status pesquisáveis

### Job

- Evoluir o `StatusPicker` para pill colorida com campo **Buscar status**, bolinha de cor, seleção e ação **Novo status**.
- Criar de forma idempotente, quando ausentes, os status de job: **Rotina**, **Em planejamento/briefing**, **Campanha ativa**, **Campanha pausada**, **Atendimento** e **Concluído**.
- Respeitar o RBAC existente: qualquer membro autorizado pode selecionar; somente Owner/Admin pode criar ou gerenciar status. Quem não puder criar verá o atalho desabilitado/explicado, sem falsa ação.
- Preservar status personalizados já existentes e a classificação atual do quadro de jobs.

### Tarefa

- Usar uma única pill visível baseada nos status cadastráveis da workspace.
- Criar de forma idempotente o conjunto solicitado: **A fazer**, **Fazendo**, **Em revisão**, **Bloqueada** e **Concluída**.
- Associar cada status configurável ao estado operacional correspondente para manter filtros, conclusão, arquivamento e drag-and-drop funcionando.
- Tarefa com `status_id` vazio exibirá **+ status** com contorno pontilhado; internamente ela continuará segura no estado operacional inicial até a escolha.
- Selecionar **Concluída** conclui/arquiva pela regra atual; sair dela reabre. Arrastar no quadro atualiza também a pill correspondente.
- Corrigir a leitura de status para sempre retornar uma lista, eliminando o erro de consulta `undefined` observado no preview.

## 5. Timer e Timesheet do job

- Estender os apontamentos atuais para aceitarem um job diretamente, mantendo compatibilidade integral com apontamentos de tarefas.
- Garantir no banco que cada apontamento pertença exatamente a um job ou a uma tarefa e que uma pessoa tenha somente um timer ativo entre ambos.
- Adicionar estimativa em minutos ao job.
- O total gasto do job será a soma de:
  - apontamentos feitos diretamente no job;
  - apontamentos das tarefas vinculadas ao job.
- O play do topo inicia um apontamento direto no job; pause/stop seguem o mesmo comportamento confiável do timer de tarefa.
- A aba **Timesheet** mostrará resumo `gasto / estimado`, percentual/barra de progresso e entradas por tarefa ou “Direto no job”, pessoa, data, duração e estado em curso.
- Manter intactos os timers e apontamentos manuais já existentes nas tarefas.

## 6. Tarefas

- Preservar Lista/Quadro, filtros de ativas/concluídas/arquivadas/prazo, DnD, prioridade, detalhe completo e criação rápida.
- Na lista, manter checkbox, título, timer, responsável, prazo e menu Arquivar/Restaurar/Excluir; substituir os dois seletores concorrentes por uma pill de status do workspace.
- Adicionar busca textual e ordenação por posição, prazo, responsável, status e nome.
- Manter **Adicionar uma tarefa** com prazo opcional.
- Tornar o ícone de subtarefa funcional: abrir um popover com a lista de subtarefas existente e permitir adicionar, concluir/reabrir e excluir, respeitando o escopo da tarefa. Não criar um grafo de dependências separado nesta etapa.

## 7. Briefing rico

- Transformar `project_jobs.description` no briefing do job, preservando textos existentes e salvando HTML sanitizado.
- Extrair um editor Tiptap reutilizável a partir do padrão já presente no Unitos.
- Incluir controles funcionais para estilo/Normal, negrito, itálico, sublinhado, tachado, link, cor, marca-texto, listas, código, imagem e emoji.
- Salvar com debounce e indicador de salvamento/erro, sem perder conteúdo ao fechar.
- Inserção de imagem usará upload/arquivo autorizado do próprio workspace ou URL validada; nunca conteúdo arbitrário inseguro.

## 8. Painel lateral de contexto

- Manter painel à direita com quatro abas: **Comentários**, **Anexos**, **Timesheet** e **Histórico**.
- Comentários reutilizam o fluxo atual, com o texto **Insira seu comentário aqui…**, menções e regras de autoria preservadas.
- Anexos reutilizam `WorkLinks`, sem remover links existentes.
- Timesheet usa o agregado descrito acima.
- Histórico reutiliza `activity_events` e passa a registrar/exibir, no contexto do job: criação do job, inclusão de tarefa, mudança de status, conclusão/reabertura e início/pausa/fim de timer, com pessoa e data/hora no fuso oficial.
- Eventos serão append-only e filtrados por job e tarefas filhas, preservando RLS e escopo por cliente/projeto.

## 9. Banco, segurança e MASTER-first

- Migration aditiva no MASTER para código/contador do job, estimativa, vínculo de apontamento direto ao job, mapeamento do status configurável para estado operacional e funções/triggers necessários.
- Ajustar RLS dos apontamentos para aceitar job ou tarefa somente quando `can_access_project`/`can_access_task` permitir, mantendo escrita em nome do usuário autenticado.
- Não usar cliente administrativo para operações comuns; server functions autenticadas continuam sujeitas a RLS.
- Seeds idempotentes criarão os conjuntos de status solicitados sem duplicar nem substituir personalizações existentes.
- Cobrir as novas colunas, índices, funções e regras em `verify-installation.sql`.
- Aplicar no MASTER, regenerar o delta, atualizar `delta_version.txt` e `MASTER_RELEASE_VERSION` com a mesma versão e executar `bun run master:check`.
- Não publicar o MASTER nem propagar instalações sem autorização explícita.

## 10. Validação

- Testes de banco: geração concorrente e imutável do código, backfill, timer exclusivo entre job/tarefa, totais, RLS, seeds idempotentes e eventos.
- Testes funcionais: status pesquisável/criação conforme papel, pill sem status, conclusão/reabertura, busca/ordenação, subtarefas, briefing e compartilhamento.
- Regressão completa de ações existentes de job e tarefa, Lista/Quadro, DnD, filtros, comentários, anexos e links.
- Rotas: abrir por clique e por `/projects/$id?tab=jobs&job=$uuid`, recarregar, fechar, usar voltar/avançar e abrir pauta sem perder compatibilidade.
- Verificação visual e interativa em desktop e celular, incluindo textos sem sobreposição, drawer rolável, teclado, foco e leitores de tela.
- Executar testes direcionados, suíte relacionada, tipos, build, `git diff --check` e guardiões MASTER-first.

## Fora de escopo

- Alterar qualquer outra tela visualmente, inclusive `/tasks` e a gestão geral de status.
- Criar página pública do job ou nova rota.
- Criar múltiplos responsáveis oficiais por job.
- Criar um grafo completo de dependências entre tarefas; o ícone operará as subtarefas já existentes.
- Publicar ou atualizar instalações.
