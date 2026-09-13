# Correção de fidelidade da Lista de Jobs

## Onde erramos

A implementação anterior reproduziu os dados e as funções principais, mas interpretou a referência como uma estrutura genérica do design system, em vez de copiar sua hierarquia visual e seus estados com precisão.

Os desvios confirmados são:

1. **Status com aparência de campo de formulário**
   - Hoje o status usa um botão branco com borda, largura fixa e aparência de `select`.
   - No HTML, ele é uma pill preenchida com fundo suave da própria cor, ponto circular, texto colorido e seta discreta.
   - O menu atual também inclui “Sem status”, “Novo status” e “Gerenciar status”; a referência mostra somente busca e os cinco status operacionais.

2. **Toolbar mais pesada que a referência**
   - Hoje a busca permanece como um campo largo aberto.
   - No HTML, busca e filtro são botões quadrados compactos; o agrupamento e a alternância Lista/Quadro concentram a leitura.
   - A ordem geral está correta, mas tamanhos, superfícies e proporções ainda diferem.

3. **Linha sem a mesma proporção do HTML**
   - A linha atual tem altura, espaçamentos e colunas mais soltos.
   - O número, nome, progresso, tempo, responsáveis, prazo, status e menu existem, porém não formam a mesma linha compacta e contínua da referência.
   - O prazo atual se apresenta como botão com calendário; no HTML ele parece texto simples, embora precise continuar editável.
   - O responsável principal usa um seletor visível no lugar de uma pilha visualmente uniforme de avatares.

4. **Cartão superior Jobs/Pautas diferente**
   - Os dois acessos existem, mas o estado ativo, ícones, bordas, fundos e seta não seguem exatamente o HTML.
   - O acesso ativo de Jobs deve ser destacado sem seta; Pautas mantém a seta de navegação.

5. **Agrupamento e quadro extrapolam o protótipo visual**
   - O HTML demonstra apenas a alternância Nenhum/Status; o Unitos já possui também Responsável e Prazo, que foram pedidos anteriormente e serão preservados.
   - O HTML não implementa de fato o quadro, a busca, o filtro e o novo job; no Unitos essas funções já são reais e não serão reduzidas a controles decorativos.

## Plano de correção

### 1. Reproduzir a composição superior
- Ajustar somente a área de Jobs & Pautas para seguir as proporções, bordas, fundos e estados do HTML.
- Manter os acessos separados e todas as contagens reais.
- Preservar o comportamento atual de abertura de Pautas.

### 2. Compactar a toolbar
- Manter título, resumo de jobs/tarefas, Agrupar, Lista/Quadro e Novo job.
- Transformar a busca em controle compacto que abre o campo de pesquisa quando acionado, preservando pesquisa por nome e número.
- Manter o filtro de ativos/concluídos/arquivados em botão compacto, com menu funcional e indicação quando houver filtro diferente do padrão.
- Preservar as opções extras de agrupamento do Unitos: Nenhum, Status, Responsável e Prazo.

### 3. Refazer a linha do job fielmente
- Usar uma única grade compacta e estável para: número, nome, progresso, tempo, avatares, prazo, status e menu.
- Aproximar altura, espaçamento, tipografia, alinhamento e larguras do HTML.
- Manter `#projeto.job`, dados reais, abertura do drawer e menu completo.
- Manter progresso com concluídas em verde e barra na cor do status.
- Manter tempo agregado e destacar em verde quando houver timer rodando.
- Exibir responsáveis como pilha uniforme de avatares; a edição continuará acessível sem transformar a linha em formulário.
- Exibir prazo com aparência textual compacta; clique continua abrindo o calendário e atrasos continuam vermelhos.

### 4. Criar uma variante visual própria para o status do job
- Estender o seletor existente com uma variante compacta para linhas, sem alterar seu uso em projetos, tarefas ou no drawer.
- Renderizar a pill com fundo suave e texto/ponto na cor do status: Não iniciado, Em andamento, Em revisão, Bloqueado e Concluído.
- Manter “Buscar status” e a troca imediata.
- Na linha do job, mostrar apenas os cinco estados operacionais; criação e administração de status continuam disponíveis nos locais administrativos existentes, não dentro desta lista compacta.

### 5. Alinhar os estados da lista
- Estado inicial: Agrupar em Nenhum, todos os jobs em uma única superfície contínua.
- Quando agrupado, mostrar somente grupos com jobs, com cabeçalho compacto, cor, nome e contagem.
- Preservar o `+` contextual por status solicitado anteriormente e “Adicionar um job”.
- Ajustar carregamento, lista vazia, busca sem resultado e formulário de criação para não quebrar a composição.

### 6. Preservar e harmonizar o Quadro
- Manter o kanban real com arrastar e soltar entre os cinco status.
- Alinhar cabeçalhos e cartões ao mesmo vocabulário visual da lista.
- Preservar colunas vazias no Quadro, pois elas são destinos necessários para arrastar jobs.
- Não alterar regras de atualização, permissões, timers ou dados.

## Rotas e escopo preservados

Nenhuma rota, parâmetro ou navegação será criada, removida, renomeada ou redirecionada. Permanecem intactos:

- `/projects/$projectId`
- `tab=overview|jobs|comments|links`
- `job=<uuid>`
- `pauta`, `board` e `estagio`
- drawer do job, tarefas, Pautas, comentários, anexos, timesheet, histórico e demais telas

A mudança ficará restrita à apresentação e aos controles da lista/quadro de Jobs dentro de Projeto › Jobs & Pautas.

## Validação

- Cobrir em teste a toolbar compacta, a variante de status, o agrupamento padrão e a preservação dos parâmetros de rota.
- Validar lista, agrupamentos, busca, filtros, criação, edição de prazo/status/responsável, menu e drag-and-drop.
- Conferir desktop e largura móvel para evitar sobreposição ou corte.
- Executar checagem de tipos, testes direcionados, guardiões MASTER-first, verificação de diferenças e saúde do preview.
- Como a correção é visual, não há mudança de banco prevista; nenhuma publicação ou propagação será feita sem autorização explícita.
