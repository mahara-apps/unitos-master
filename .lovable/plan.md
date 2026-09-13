# Visão geral do projeto — resumo operacional

## Objetivo
Transformar somente a aba **Visão geral** do detalhe do projeto em um resumo de leitura imediata, seguindo a composição escolhida “Unitos Operational Summary”, mas usando integralmente os tokens, tipografia e componentes atuais do Unitos.

## Rotas preservadas
- Manter a rota `/projects/$projectId` e os parâmetros atuais `tab`, `job`, `pauta`, `board` e `estagio`.
- Manter as abas **Visão geral**, **Jobs & Pautas**, **Comentários** e **Anexos** com seus destinos e comportamentos atuais.
- “Ver todos os jobs” apenas selecionará `tab=jobs`; “Ver pauta” e o resumo de Pautas continuarão usando os links e painéis já existentes.
- Nenhuma rota será criada, removida, renomeada ou redirecionada.

## O que será construído

### 1. Cabeçalho compacto do projeto
- Reorganizar o cabeçalho existente com barra de acento, nome, `CLIENTE <nome>`, chip da pauta, responsável, “Ver pauta” e menu de ações.
- Manter as ações atuais de configuração, arquivamento/restauração e exclusão.
- Exibir um único status pesquisável em pill, usando o `StatusPicker` do Unitos e os estados: Rascunho, Em planejamento, Ativa, Pausada, Aguardando cliente e Concluído.
- Preservar permissões atuais: edição de responsável e status continua limitada a quem já pode editar o projeto.

### 2. Indicadores de leitura rápida
- Usar obrigatoriamente `PageKpi` e `PageKpiGrid`, sem criar cartões locais de métricas.
- Exibir quatro dados reais:
  - **Peças concluídas:** aprovadas/publicadas sobre o escopo e percentual.
  - **Publicadas:** total publicado sobre o total do projeto/pauta.
  - **Tempo do projeto:** soma das horas diretas dos jobs e das tarefas pertencentes a eles.
  - **Prazo:** dias restantes e data de entrega, com tratamento para vencido ou sem prazo.
- Aplicar apenas estados semânticos já existentes no design system.

### 3. Pipeline contínuo
- Evoluir o `StageFunnel` para a faixa contínua solicitada, preservando os seis estágios e tokens já existentes: Briefing, Em produção, Em revisão, Aprovado, Agendado e Publicado.
- Mostrar contagem e mini-barra por estágio.
- Manter o clique existente que abre Jobs & Pautas filtrado pelo estágio selecionado.

### 4. Corpo em duas colunas
- **Coluna principal — Resumo de Jobs:** carregar os primeiros jobs ativos em linhas densas com número, nome, progresso de tarefas, mini-barra, tempo agregado, responsável e status; abrir o drawer atual ao clicar.
- Incluir **Novo job**, usando o fluxo de criação existente, e **Ver todos os jobs**, levando à aba Jobs & Pautas.
- **Lateral — Pautas:** mostrar quantidade de peças e aprovadas, mantendo acesso à pauta/board existente.
- **Próximas entregas:** listar peças agendadas em ordem cronológica com data e hora e abrir o detalhe atual da peça.
- **Atividade recente:** montar timeline com eventos reais do projeto, jobs e tarefas, incluindo ator, ação e data/hora; quando não houver eventos, mostrar estado vazio em vez de conteúdo inventado.

## Dados, segurança e funcionamento
- Criar uma leitura agregada autenticada para o resumo de jobs, tempos e atividade, sempre respeitando o RBAC/RLS e o escopo do projeto.
- Fazer consultas em lote para evitar uma chamada por job/tarefa e considerar timers em andamento no total exibido.
- Adicionar de forma idempotente os seis status padrão de projeto sem remover nem sobrescrever status personalizados do workspace.
- Manter compatibilidade com o status legado do projeto durante a transição, sem duplicar dois status visíveis no cabeçalho.
- Reutilizar `StatusPicker`, `AssigneePicker`, `PageKpi`, `StageFunnel`, avatares, menus, barras de progresso, timezone de São Paulo e estados vazios/carregando já adotados pelo produto.
- No mobile, empilhar indicadores e lateral sem scroll horizontal; no desktop, manter jobs amplos à esquerda e contexto compacto à direita.

## Escopo protegido
- Não alterar a tela completa de Jobs & Pautas, o drawer do job, Comentários, Anexos, pauta, board ou qualquer outra tela.
- Não inventar dados, responsáveis, horários ou atividade.
- Não trocar paleta, tipografia ou linguagem visual do Unitos.

## MASTER-first e validação
1. Aplicar no MASTER a migration aditiva dos status padrão, grants e regras necessárias, sem relaxar RLS.
2. Implementar os agregados e a nova apresentação da Visão geral.
3. Cobrir as estruturas/status em `verify-installation.sql`.
4. Regenerar o delta, atualizar `delta_version.txt` e `MASTER_RELEASE_VERSION` com a mesma versão.
5. Rodar testes focados, guardiões de instalação, `bun run master:check`, validação de tipos e checagem visual desktop/mobile.
6. Validar abertura de job, criação de job, filtros do pipeline, pauta, abas e menus sem regressão.
7. Não publicar o MASTER nem propagar para instalações sem autorização explícita.
