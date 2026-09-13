# Plano — Lista de Jobs no padrão das tarefas

## Objetivo
Redesenhar somente a lista de Jobs dentro de **Projeto › Jobs & Pautas**, usando os componentes e tokens visuais do Unitos e a referência enviada. O drawer do job, a área de Pautas e as demais telas permanecem intactos.

## Experiência da tela

### Navegação e toolbar
- Manter os acessos destacados e separados de **Jobs** e **Pautas** no topo.
- Exibir a toolbar de Jobs com:
  - título **Jobs**;
  - resumo `jobs concluídos/total · tarefas concluídas/total`;
  - busca por nome ou número;
  - seletor **Agrupar por**: Status, Responsável ou Prazo;
  - filtros existentes de ativos, concluídos e arquivados;
  - alternância **Lista / Quadro**;
  - botão **Novo job**.
- Adaptar a disposição em telas estreitas sem ocultar ações ou sobrepor conteúdo.

### Linha de job
- Criar uma linha densa com a mesma anatomia visual da linha de tarefa, contendo:
  - badge do número imutável do job;
  - nome em destaque e abertura do drawer ao clicar;
  - progresso das tarefas com checklist, `feitas/total` e mini-barra na cor do status;
  - tempo total das tarefas, com destaque verde quando existir timer ativo no job ou em uma tarefa dele;
  - avatares empilhados do responsável do job e responsáveis das tarefas;
  - prazo editável, calendário quando vazio e indicação destrutiva quando atrasado;
  - status pesquisável usando o `StatusPicker` existente;
  - menu com **Duplicar**, **Arquivar/Restaurar** e **Excluir**.
- Incluir **Adicionar um job** no final da lista, reutilizando o fluxo de criação atual.

### Agrupamento e quadro
- Em **Status**, criar seções com bolinha, nome, quantidade e botão `+`; o novo job nasce no status daquela seção.
- Em **Responsável**, agrupar pelo responsável principal do job, incluindo **Sem responsável**.
- Em **Prazo**, agrupar em faixas previsíveis: atrasados, hoje, próximos, futuros e sem prazo.
- Na visão **Quadro**, manter colunas por todos os status cadastrados, cartões atuais de job e arrastar entre colunas para atualizar o status.
- Preservar busca e filtros nas duas visões.

## Regras funcionais
- Adicionar, sem remover nem renomear status existentes, os padrões de job: **Não iniciado**, **Em andamento**, **Em revisão**, **Bloqueado** e **Concluído**, com as cores solicitadas; o `Concluído` existente será reaproveitado quando já cadastrado.
- **Duplicar** copiará dados do job, briefing e todas as tarefas vinculadas, incluindo seus responsáveis, prazos, prioridade, estimativa e status.
- A cópia não levará horas registradas, timers ativos, comentários, anexos, subtarefas nem histórico; receberá novo número e registrará sua própria criação.
- Todas as operações continuarão autenticadas e limitadas pelo RBAC/RLS já existente.

## Rotas
Nenhuma rota será criada, removida, renomeada ou redirecionada. Permanecem válidos:
- `/projects/$projectId?tab=jobs`;
- deep link `job=<uuid>`;
- parâmetros coexistentes de `pauta`, `board` e `estagio`.

A alternância Lista/Quadro e o agrupamento serão estados locais dessa tela, portanto não exigem alternativa de rota nem quebram links existentes.

## Implementação técnica
- Refatorar a área de lista em componentes locais focados: toolbar, linha, grupo, cartão arrastável e coluna do quadro.
- Estender a leitura consolidada para identificar timers ativos por job sem criar consultas por linha.
- Adicionar operação autenticada e transacional para duplicação, validando workspace, projeto e acesso antes de copiar job/tarefas.
- Atualizar a rotina idempotente de status padrão sem substituir personalizações existentes.
- Usar apenas tokens semânticos do design system; cores dos status continuam vindas dos próprios registros.

## Validação e entrega MASTER-first
- Testar busca, contagens, agrupamentos, criação contextual, alteração de status, arrastar no quadro, prazo, menu e duplicação.
- Confirmar que o drawer abre pela linha e pelo deep link atual, e que Pautas continua acessível.
- Validar responsividade, estados vazio/carregando, tema claro/escuro e ausência de erros no preview.
- Cobrir novas funções/estruturas na verificação de instalação.
- Aplicar no MASTER, regenerar o delta, sincronizar a nova versão e SHA, executar tipos, testes focados, guardiões, build e `master:check`.
- Não publicar nem propagar para instalações sem autorização explícita.
